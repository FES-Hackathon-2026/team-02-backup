import { bindInvitation } from '../engine/progression.js'
import { all, db, now, one, run } from '../db.js'
import { TokenError, firebaseEnabled, verifyIdToken } from '../auth/firebase.js'
import { totals } from '../engine/totals.js'
import { clearSession, currentUser, requireUser, setSession } from '../session.js'

const NAME_MAX = 40

function publicUser(user) {
  const district = one('SELECT id, name, bezirk FROM districts WHERE id = ?', user.district_id)
  return {
    id: user.id,
    name: user.name,
    district,
    role: user.role,
    isDemo: user.is_demo === 1,
    // Identity, so the settings screen can say how this person signed in and
    // the app can show a real face instead of an initial.
    provider: user.auth_provider ?? 'guest',
    email: user.email ?? null,
    photoUrl: user.photo_url ?? null,
    createdAt: user.created_at,
    ...totals(user.id),
  }
}

/** Reads a name the same way everywhere: trimmed and capped. */
const cleanName = (value) => (typeof value === 'string' ? value.trim().slice(0, NAME_MAX) : '')

const findDistrict = (districtId) =>
  one('SELECT id FROM districts WHERE id = ?', districtId) ?? null

export default async function sessionRoutes(app) {
  /**
   * Which sign-in methods this deployment actually has.
   *
   * The client asks before painting the login screen, so a build without
   * Firebase configured shows the guest form alone rather than a Google
   * button that fails the moment it is pressed.
   */
  app.get('/api/auth/config', async () => ({ google: firebaseEnabled(), guest: true }))

  /** Sign in as a guest. A name and a Stadtteil, nothing else. */
  app.post('/api/session', async (request, reply) => {
    const { name, districtId } = request.body ?? {}

    const clean = cleanName(name)
    if (clean.length < 2) {
      return reply.code(422).send({
        error: 'name_too_short',
        message: 'Bitte gib einen Namen mit mindestens zwei Zeichen an.',
      })
    }

    const district = findDistrict(districtId)
    if (!district) {
      return reply.code(422).send({
        error: 'unknown_district',
        message: 'Diesen Stadtteil kennen wir nicht. Bitte aus der Liste wählen.',
      })
    }

    const result = run(
      `INSERT INTO users (name, district_id, role, is_demo, created_at, auth_provider, last_seen_at)
       VALUES (?, ?, ?, 0, ?, 'guest', ?)`,
      clean,
      district.id,
      'citizen',
      now(),
      now(),
    )
    const user = one('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid))
    bindInvitation(user.id, request.body?.inviteCode)

    setSession(reply, user.id)
    return reply.code(201).send(publicUser(user))
  })

  /**
   * Sign in with Google.
   *
   * The client does the whole OAuth dance with Firebase and sends the ID
   * token it got back. We verify that token against Google's published keys
   * (see auth/firebase.js) and then issue our OWN cookie — the Firebase
   * token never becomes the session, so every other route in this server
   * keeps exactly one way of knowing who is calling.
   *
   * Three outcomes:
   *   known uid          sign in, refresh the profile
   *   new uid, and this
   *   device is a guest  UPGRADE that guest row in place, so the XP earned
   *                      before signing in survives
   *   new uid, no guest  needs a Stadtteil first → 409 district_required,
   *                      and the client asks for one and calls again
   */
  app.post('/api/session/google', async (request, reply) => {
    if (!firebaseEnabled()) {
      return reply.code(501).send({
        error: 'google_not_configured',
        message:
          'Google-Anmeldung ist auf diesem Server nicht eingerichtet (FIREBASE_PROJECT_ID fehlt).',
      })
    }

    const { idToken, districtId } = request.body ?? {}

    let profile
    try {
      profile = await verifyIdToken(idToken)
    } catch (error) {
      if (error instanceof TokenError) {
        request.log.warn({ reason: error.message }, 'google sign-in rejected')
        return reply.code(401).send({ error: 'invalid_token', message: error.message })
      }
      throw error
    }

    const existing = one('SELECT * FROM users WHERE google_uid = ?', profile.uid)
    if (existing) {
      // Picture and address can change on the Google side, so keep them
      // current — but never overwrite a name the person edited here.
      run(
        'UPDATE users SET email = ?, photo_url = ?, last_seen_at = ? WHERE id = ?',
        profile.email,
        profile.picture,
        now(),
        existing.id,
      )
      setSession(reply, existing.id)
      return publicUser(one('SELECT * FROM users WHERE id = ?', existing.id))
    }

    // First sign-in with this Google account on this server.
    const guest = currentUser(request)
    const upgradable =
      guest !== null &&
      guest.is_demo === 0 &&
      !guest.google_uid &&
      (guest.auth_provider ?? 'guest') === 'guest'

    const district = findDistrict(districtId)

    if (upgradable) {
      run(
        `UPDATE users
            SET auth_provider = 'google', google_uid = ?, email = ?, photo_url = ?,
                name = ?, district_id = ?, last_seen_at = ?
          WHERE id = ?`,
        profile.uid,
        profile.email,
        profile.picture,
        guest.name || cleanName(profile.name) || 'Gast',
        district?.id ?? guest.district_id,
        now(),
        guest.id,
      )
      setSession(reply, guest.id)
      return publicUser(one('SELECT * FROM users WHERE id = ?', guest.id))
    }

    if (!district) {
      // Not a mistake the person made — the client turns this into one more
      // question rather than a red box.
      return reply.code(409).send({
        error: 'district_required',
        message: 'Fast geschafft — wähle noch deinen Stadtteil.',
        profile: { name: cleanName(profile.name), email: profile.email, photoUrl: profile.picture },
      })
    }

    const fromEmail = (profile.email ?? '').split('@')[0].slice(0, NAME_MAX)
    const name = cleanName(profile.name) || fromEmail

    const result = run(
      `INSERT INTO users (name, district_id, role, is_demo, created_at,
                          auth_provider, google_uid, email, photo_url, last_seen_at)
       VALUES (?, ?, 'citizen', 0, ?, 'google', ?, ?, ?, ?)`,
      name.length >= 2 ? name : 'Neu in Frankfurt',
      district.id,
      now(),
      profile.uid,
      profile.email,
      profile.picture,
      now(),
    )
    const user = one('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid))
    bindInvitation(user.id, request.body?.inviteCode)
    setSession(reply, user.id)
    return reply.code(201).send(publicUser(user))
  })

  /** Who am I? The client calls this on every load. */
  app.get('/api/me', async (request, reply) => {
    const user = currentUser(request)
    if (!user) return reply.code(401).send({ error: 'not_signed_in' })
    return publicUser(user)
  })

  /** Edit the profile: the display name and the Stadtteil. */
  app.patch('/api/me', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { name, districtId } = request.body ?? {}
    const fields = []
    const params = []

    if (name !== undefined) {
      const clean = cleanName(name)
      if (clean.length < 2) {
        return reply.code(422).send({
          error: 'name_too_short',
          message: 'Bitte gib einen Namen mit mindestens zwei Zeichen an.',
        })
      }
      fields.push('name = ?')
      params.push(clean)
    }

    if (districtId !== undefined) {
      const district = findDistrict(districtId)
      if (!district) {
        return reply.code(422).send({
          error: 'unknown_district',
          message: 'Diesen Stadtteil kennen wir nicht. Bitte aus der Liste wählen.',
        })
      }
      fields.push('district_id = ?')
      params.push(district.id)
    }

    if (fields.length === 0) {
      return reply.code(422).send({
        error: 'nothing_to_change',
        message: 'Es wurde kein Feld übermittelt.',
      })
    }

    run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...params, user.id)
    return publicUser(one('SELECT * FROM users WHERE id = ?', user.id))
  })

  /**
   * Delete the account.
   *
   * Everything personal goes; everything the neighbourhood depends on stays
   * and loses its author. A quest somebody else is already walking towards
   * must not vanish because the person who reported it left — so quests,
   * market items and photos are anonymised, and only the rows that are
   * *about* this person are removed.
   *
   * The ledger is documented as append-only, and it stays that way: nothing
   * here edits an entry. Erasing a person's own entries on request is the
   * one thing that outranks it, and doing so takes their totals with it, so
   * no receipt is left pointing at a number that can no longer be explained.
   *
   * The Google account itself is untouched — we never had access to it.
   */
  app.delete('/api/me', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    if (user.is_demo === 1) {
      return reply.code(403).send({
        error: 'demo_user',
        message: 'Demo-Konten gehören zum Seed und lassen sich nicht löschen.',
      })
    }

    db.transaction(() => {
      // Children before parents — foreign_keys is ON, so the order is not
      // decoration.
      run(
        `DELETE FROM peer_reviews
          WHERE user_id = ?
             OR submission_id IN (SELECT id FROM quest_submissions WHERE user_id = ?)`,
        user.id,
        user.id,
      )
      run('DELETE FROM quest_submissions WHERE user_id = ?', user.id)
      run('DELETE FROM redemptions WHERE user_id = ?', user.id)
      run('DELETE FROM ledger_entries WHERE user_id = ?', user.id)
      for (const table of ['pickup_items', 'pickup_requests', 'pickup_preferences', 'pickup_notifications', 'pickup_registration_snapshots', 'pickup_tour_stops', 'pickup_contacts']) {
        run(`DELETE FROM ${table} WHERE pickup_id IN (SELECT id FROM pickups WHERE user_id = ?)`, user.id)
      }
      run('DELETE FROM pickups WHERE user_id = ?', user.id)
      run('DELETE FROM quest_journeys WHERE user_id = ?', user.id)
      run('DELETE FROM referrals WHERE referred_id = ? OR referrer_id = ?', user.id, user.id)
      run('DELETE FROM reward_events WHERE user_id = ?', user.id)
      run('DELETE FROM vytal_transactions WHERE user_id = ?', user.id)
      run('DELETE FROM vytal_users WHERE user_id = ?', user.id)
      run('DELETE FROM actions WHERE user_id = ?', user.id)

      // Shared content outlives the account, without a name on it.
      run('UPDATE quests SET created_by = NULL WHERE created_by = ?', user.id)
      run(
        `UPDATE quests SET claimed_by = NULL, claimed_until = NULL, status = 'open'
          WHERE claimed_by = ?`,
        user.id,
      )
      run('UPDATE market_items SET user_id = NULL WHERE user_id = ?', user.id)
      run('UPDATE market_items SET claimed_by = NULL WHERE claimed_by = ?', user.id)
      run('UPDATE photos SET user_id = NULL WHERE user_id = ?', user.id)

      run('DELETE FROM users WHERE id = ?', user.id)
    })()

    clearSession(reply)
    return { ok: true }
  })

  /**
   * Switch the acting person on one device — how the demo shows peer review.
   *
   * Demo rows only. This used to take any user id and hand out a session for
   * it, which meant a signed-in Google account could be taken over by anyone
   * who could POST a number.
   */
  app.post('/api/session/switch', async (request, reply) => {
    const { userId } = request.body ?? {}
    const target = one('SELECT * FROM users WHERE id = ?', userId)
    if (!target) return reply.code(404).send({ error: 'unknown_user' })
    // Public demo switching must never grant access to private driver manifests.
    if (target.role === 'driver') return reply.code(403).send({ error: 'restricted_role' })

    if (target.is_demo !== 1) {
      return reply.code(403).send({
        error: 'not_a_demo_user',
        message: 'Es lässt sich nur zu Demo-Konten wechseln.',
      })
    }

    setSession(reply, target.id)
    return publicUser(target)
  })

  app.post('/api/session/logout', async (request, reply) => {
    clearSession(reply)
    return { ok: true }
  })

  /**
   * The person's own ledger — every credit with its reason and tier.
   * This is what the receipt screen reads; phase 3 adds the per-action
   * breakdown underneath each entry.
   */
  app.get('/api/me/ledger', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const entries = all(
      `SELECT id, action_id, xp, coins, reason, tier, created_at
         FROM ledger_entries WHERE user_id = ?
        ORDER BY id DESC LIMIT 100`,
      user.id,
    )
    return { entries, ...totals(user.id) }
  })
}
