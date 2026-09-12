import { all, now, one, run } from '../db.js'
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
    ...totals(user.id),
  }
}

export default async function sessionRoutes(app) {
  /** Sign in. A name and a Stadtteil, nothing else. */
  app.post('/api/session', async (request, reply) => {
    const { name, districtId } = request.body ?? {}

    const clean = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : ''
    if (clean.length < 2) {
      return reply.code(422).send({
        error: 'name_too_short',
        message: 'Bitte gib einen Namen mit mindestens zwei Zeichen an.',
      })
    }

    const district = one('SELECT id FROM districts WHERE id = ?', districtId)
    if (!district) {
      return reply.code(422).send({
        error: 'unknown_district',
        message: 'Diesen Stadtteil kennen wir nicht. Bitte aus der Liste wählen.',
      })
    }

    const result = run(
      'INSERT INTO users (name, district_id, role, is_demo, created_at) VALUES (?, ?, ?, 0, ?)',
      clean,
      district.id,
      'citizen',
      now(),
    )
    const user = one('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid))

    setSession(reply, user.id)
    return reply.code(201).send(publicUser(user))
  })

  /** Who am I? The client calls this on every load. */
  app.get('/api/me', async (request, reply) => {
    const user = currentUser(request)
    if (!user) return reply.code(401).send({ error: 'not_signed_in' })
    return publicUser(user)
  })

  /** Switch the acting person on one device — how the demo shows peer review. */
  app.post('/api/session/switch', async (request, reply) => {
    const { userId } = request.body ?? {}
    const target = one('SELECT * FROM users WHERE id = ?', userId)
    if (!target) return reply.code(404).send({ error: 'unknown_user' })
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
