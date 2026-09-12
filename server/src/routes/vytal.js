import { all, one } from '../db.js'
import { award } from '../engine/award.js'
import { BASE_XP } from '../engine/rewards.js'
import * as fs from '../integrations/foodsharing/client.js'
import { ASSUMPTIONS, byRelevance, score } from '../integrations/foodsharing/relevance.js'
import * as vytal from '../integrations/vytal/index.js'
import { requireUser } from '../session.js'

/**
 * Phase 9 — foodsharing und Vytal.
 *
 * Both partner interfaces live here because this is phase 9's single
 * registration point: `server/src/index.js` is frozen while several sessions
 * build at once, and it already registers exactly one file per phase. Hence
 * one file, two prefixes:
 *
 *   /api/vytal/*        Mehrweg — nachgebaut, jeder Wert „simuliert"
 *   /api/foodsharing/*  Essen retten — echt, jeder Wert „bestätigt"
 *
 * `/api/food/*` stays what it was: the read-only proxy in routes/food.js.
 * The writes are here instead, and the server makes them itself rather than
 * letting the browser report a pickup it claims to have done. That is the
 * difference between a receipt and a promise: the `pickup_id` and the
 * `picked_up_at` in the ledger came out of foodsharing's own answer, in this
 * process, one line before the credit was written.
 *
 * Points, as everywhere, come only from `engine/award.js`.
 */

/*
 * Base XP comes from `engine/rewards.js`, not from here.
 *
 * It is tempting to pay a Geschäftsrettung more than a walk to the Fairteiler,
 * and the numbers would look sensible. But the receipt re-derives the credit
 * from `BASE_XP[kind]` alone, and a base this file invented would make the
 * explanation disagree with the payment — which is the one thing the receipt
 * exists to prevent. If the sources should be worth different amounts, that
 * belongs in the rules file, next to the rest of the reasoning.
 */

const num = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** German date and time, Frankfurt, for the sentence that lands in the ledger. */
const stamp = (iso) =>
  new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** One place that turns a partner failure into an answer the app can show. */
function fail(reply, error, request) {
  if (error instanceof fs.FoodsharingError || error instanceof vytal.VytalError) {
    return reply.code(error.status).send({
      error: error.code,
      message: error.message,
      detail: error.detail ?? undefined,
    })
  }
  request.log.error({ error }, 'phase 9 route failed')
  return reply.code(500).send({ error: 'internal', message: 'Das hat auf unserer Seite nicht geklappt.' })
}

/** The ledger row a partner event was paid on, or null. */
const paidFor = (eventKey) =>
  one(
    `SELECT l.id, l.action_id AS actionId, l.xp, l.coins, l.reason, l.created_at AS createdAt, l.user_id AS userId
       FROM ledger_entries l WHERE l.event_key = ?`,
    eventKey,
  ) ?? null

export default async function vytalRoutes(app) {
  /* ================================================================
     Vytal — Mehrweg. Nachgebaut; jeder Wert trägt „simuliert".
     ================================================================ */

  const refOf = (user) => `remain:${user.id}`

  app.get('/api/vytal/partners', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { lat, lon, r } = request.query ?? {}
    return {
      tier: vytal.TIER,
      partners: vytal.partners({
        lat: lat === undefined ? undefined : num(lat, undefined),
        lon: lon === undefined ? undefined : num(lon, undefined),
        radiusKm: num(r, 12),
      }),
    }
  })

  /** What this person is holding, what it is worth, and when it is due back. */
  app.get('/api/vytal/containers', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { lat, lon } = request.query ?? {}
    const held = vytal.containers(refOf(user))

    // Which returns have already been paid — the screen shows the receipt
    // link on the ones that have, and nothing on a repeat.
    const returned = held.returned.map((c) => {
      const paid = c.return_event_id ? paidFor(c.return_event_id) : null
      return { ...c, actionId: paid?.actionId ?? null, xp: paid?.xp ?? 0 }
    })

    return {
      tier: vytal.TIER,
      loanDays: vytal.LOAN_DAYS,
      xpPerReturn: BASE_XP.vytal,
      active: held.active,
      returned,
      partners: vytal.partners({
        lat: lat === undefined ? undefined : num(lat, undefined),
        lon: lon === undefined ? undefined : num(lon, undefined),
        radiusKm: 12,
      }),
      note: 'Nachgebauter Dienst. Ereignisform, Behälter-ID und Partner-ID sind die echten; die Ereignisse selbst stammen aus unserem Stand-in.',
    }
  })

  /**
   * Borrowing.
   *
   * In the real system the partner's till triggers this, not the app — which
   * is why the screen labels it a Demo-Ausleihe. It exists so the return, the
   * part that actually matters, can be demonstrated end to end.
   */
  app.post('/api/vytal/borrow', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { partnerId, containerType } = request.body ?? {}
    if (!partnerId) {
      return reply.code(422).send({ error: 'missing_partner', message: 'Es fehlt der Partner.' })
    }

    try {
      const { event, container } = vytal.borrow({
        userRef: refOf(user),
        partnerId,
        containerType: containerType ?? 'bowl_1000',
      })
      return { tier: vytal.TIER, event, container }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * Returning — the exactly-once demonstration.
   *
   * The adapter hands back the same `event_id` for a repeat scan, `award()`
   * refuses to pay a key it has seen, and the answer says which ledger row
   * already holds the credit. Nothing here decides that; it only reports it.
   */
  app.post('/api/vytal/returns', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { containerId, partnerId } = request.body ?? {}
    if (!containerId || !partnerId) {
      return reply.code(422).send({
        error: 'missing_fields',
        message: 'Es fehlen Behälter-Code oder Rückgabeort.',
      })
    }

    let result
    try {
      result = vytal.returnContainer({ userRef: refOf(user), containerId, partnerId })
    } catch (error) {
      return fail(reply, error, request)
    }

    const { event, container, repeat } = result
    const where = container.return_partner_name ?? partnerId
    const reason = `Vytal-Behälter ${container.label} (${containerId}) zurückgegeben bei ${where} am ${stamp(event.occurred_at)} · Ereignis ${event.event_id}`

    const credit = award({
      userId: user.id,
      kind: 'vytal',
      refTable: 'vytal_events',
      refId: event.event_id,
      tier: vytal.TIER,
      reason,
      xp: BASE_XP.vytal,
      eventKey: event.event_id,
    })

    if (!credit.ok) {
      const paid = paidFor(event.event_id)
      return {
        credited: false,
        repeat,
        code: credit.code,
        message: `Dieses Rückgabe-Ereignis wurde schon belohnt — am ${paid ? stamp(paid.createdAt) : 'früher'}. Ein Ereignis zählt genau einmal.`,
        event,
        container,
        alreadyPaid: paid && { actionId: paid.actionId, xp: paid.xp, coins: paid.coins, at: paid.createdAt },
        tier: vytal.TIER,
      }
    }

    // A credit of zero is not a failure: the daily cap and the travel rule
    // both record the action and pay nothing, with a sentence saying why.
    // Passing `hint` on unchanged is what keeps the screen honest about it.
    const saved = container.single_use_grams
      ? ` Statt ${container.single_use_grams} g Einwegverpackung.`
      : ''

    return {
      credited: true,
      repeat: false,
      blocked: credit.blocked,
      hint: credit.hint,
      message: `Rückgabe erfasst.${saved}`,
      event,
      container,
      award: credit,
      tier: vytal.TIER,
    }
  })

  /* ================================================================
     foodsharing — echt. Der einzige Partner, der unser Wort bestätigt.
     ================================================================ */

  /**
   * Which of the team's two foodsharing test users is acting.
   *
   * The team key carries two of them and they are deliberately in different
   * verification states, so the locked Geschäftsrettung can be shown as the
   * real thing rather than as a mock-up. The choice is a query parameter
   * because it belongs to the demo, not to the ReMain account.
   */
  const actingUser = (request) => {
    const raw = (request.query ?? {}).as ?? (request.body ?? {}).as
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : undefined
  }

  /** The acting user with the verification state, straight from the API. */
  app.get('/api/foodsharing/state', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    try {
      const [users, acting] = await Promise.all([fs.users(), fs.me(actingUser(request))])
      return {
        tier: 'confirmed',
        source: 'foodsharing Hackathon-API',
        acting,
        users: users.map((u) => ({
          id: u.id,
          name: u.display_name,
          isDefault: u.is_default,
          isVerified: u.verification?.is_verified ?? false,
          status: u.verification?.status ?? 'unknown',
        })),
        lock: lockReason(acting.verification),
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * Everything rescuable nearby, in the order worth doing.
   *
   * Three live lists — Fairteiler, Körbe, Geschäfte — merged and sorted by
   * net effect per minute of effort. The effect is a `Schätzung` and the app
   * says so; the existence, position and expiry of every entry is `bestätigt`,
   * because it came out of the partner's answer a moment ago.
   */
  app.get('/api/foodsharing/nearby', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { lat, lon, r } = request.query ?? {}
    const home = one('SELECT lat, lon FROM districts WHERE id = ?', user.district_id)
    const at = {
      lat: num(lat, home?.lat ?? 50.1109),
      lon: num(lon, home?.lon ?? 8.6821),
    }
    const radius = num(r, 15)
    const as = actingUser(request)

    try {
      const [points, baskets, businesses, me] = await Promise.all([
        fs.foodSharePoints(at.lat, at.lon, Math.min(radius, 100)),
        fs.basketsNearby(at.lat, at.lon, Math.min(radius, 50)),
        fs.businesses(),
        fs.me(as),
      ])

      const lock = lockReason(me.verification)
      const now = Date.now()

      const items = [
        ...points.map((p) => ({
          key: `food_share_point:${p.id}`,
          source: 'food_share_point',
          sourceId: p.id,
          title: p.name,
          note: p.address ?? p.description ?? null,
          openingHours: p.opening_hours ?? null,
          lat: p.lat,
          lon: p.lon,
          distanceKm: p.distance_km ?? null,
          expiresAt: null,
          locked: false,
          ...score('food_share_point', p.distance_km, null, now),
        })),
        ...baskets.map((b) => ({
          key: `basket:${b.id}`,
          source: 'basket',
          sourceId: b.id,
          title: b.title,
          note: b.description ?? null,
          foodTypes: b.food_types ?? [],
          lat: b.lat,
          lon: b.lon,
          distanceKm: b.distance_km ?? null,
          expiresAt: b.expires_at,
          status: b.status,
          /** our own basket: foodsharing answers 400, so say it before we ask */
          ownBasket: as !== undefined ? b.created_by_user_id === as : b.created_by_user_id === me.id,
          locked: false,
          ...score('basket', b.distance_km, b.expires_at, now),
        })),
        ...businesses.map((biz) => ({
          key: `business:${biz.id}`,
          source: 'business',
          sourceId: biz.id,
          title: biz.name,
          note: 'Geschäftsrettung — nur mit foodsharing-Verifikation',
          lat: biz.lat,
          lon: biz.lon,
          distanceKm: Number(
            (((biz.lat - at.lat) ** 2 + (biz.lon - at.lon) ** 2) ** 0.5 * 111).toFixed(2),
          ),
          expiresAt: null,
          locked: !(me.verification?.is_verified ?? false),
          lock,
          ...score(
            'business',
            (((biz.lat - at.lat) ** 2 + (biz.lon - at.lon) ** 2) ** 0.5) * 111,
            null,
            now,
          ),
        })),
      ]

      // Unusable entries stay in the list — hiding them would hide the reason —
      // but they never outrank something that can actually be picked up.
      const unusable = (i) => Number(Boolean(i.locked || i.ownBasket))
      items.sort((a, b) => unusable(a) - unusable(b) || byRelevance(a, b))

      return {
        items,
        at,
        acting: { id: me.id, name: me.display_name, isVerified: me.verification?.is_verified ?? false },
        lock,
        assumptions: ASSUMPTIONS,
        tier: 'confirmed',
        estimateTier: 'estimated',
        source: 'foodsharing Hackathon-API',
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /** Reserve a basket. 400 own basket, 409 taken — passed through as they are. */
  app.post('/api/foodsharing/request', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { basketId, message } = request.body ?? {}
    if (!basketId) {
      return reply.code(422).send({ error: 'missing_basket', message: 'Es fehlt der Korb.' })
    }

    try {
      const created = await fs.requestBasket(basketId, actingUser(request), message)
      return {
        tier: 'confirmed',
        request: created,
        message: 'Anfrage gestellt. Der Korb ist jetzt für dich reserviert.',
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * Complete a pickup — and credit it.
   *
   * This is the one place in ReMain where an outside system confirms what we
   * claim. The order matters: the live call first, the credit only out of its
   * answer, keyed on the `pickup_id` foodsharing minted. Nothing is written
   * if the partner said no.
   */
  app.post('/api/foodsharing/pickup', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { source, sourceId } = request.body ?? {}
    const as = actingUser(request)

    if (!['food_share_point', 'basket', 'business'].includes(source) || !sourceId) {
      return reply.code(422).send({
        error: 'bad_source',
        message: 'Quelle fehlt oder ist keine von Fairteiler, Korb, Geschäft.',
      })
    }

    let pickup
    try {
      pickup =
        source === 'business'
          ? await fs.businessPickup(sourceId, as)
          : await fs.pickup(
              source === 'basket' ? { basket_id: sourceId } : { food_share_point_id: sourceId },
              as,
            )
    } catch (error) {
      return fail(reply, error, request)
    }

    const where =
      pickup.food_share_point_name ?? pickup.basket_title ?? pickup.business_name ?? 'foodsharing'
    const label =
      source === 'basket' ? 'Korb' : source === 'business' ? 'Geschäftsrettung' : 'Fairteiler'

    const eventKey = `fs_pickup_${pickup.id}`
    const reason = `Essen gerettet · ${label} „${where}" · foodsharing-Abholung #${pickup.id} vom ${stamp(pickup.picked_up_at)}`

    const credit = award({
      userId: user.id,
      kind: 'food',
      refTable: 'foodsharing_pickups',
      refId: String(pickup.id),
      tier: 'confirmed',
      reason,
      xp: BASE_XP.food,
      eventKey,
    })

    const estimate = score(source, 0, pickup.basket_expires_at ?? null)

    return {
      tier: 'confirmed',
      pickup: {
        id: pickup.id,
        source: pickup.source,
        pickedUpAt: pickup.picked_up_at,
        name: where,
        lat: pickup.lat,
        lon: pickup.lon,
        foodTypes: pickup.food_types ?? [],
      },
      credited: credit.ok,
      award: credit.ok ? credit : null,
      blocked: credit.ok ? credit.blocked : false,
      hint: credit.ok ? credit.hint : null,
      alreadyPaid: credit.ok ? null : paidFor(eventKey),
      message: credit.ok
        ? `Abholung #${pickup.id} bestätigt von foodsharing, ${stamp(pickup.picked_up_at)}.`
        : credit.message,
      estimate: { co2eKg: estimate.co2eNet, assumptions: ASSUMPTIONS, tier: 'estimated' },
    }
  })

  /**
   * The proof, readable after the fact: the partner's own history next to our
   * ledger. A row with an `actionId` was credited here; a row without was
   * picked up outside ReMain, and the list says so rather than quietly
   * claiming it.
   */
  app.get('/api/foodsharing/history', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    try {
      const rows = await fs.history(actingUser(request), 50)
      const paid = new Map(
        all(
          `SELECT event_key AS eventKey, action_id AS actionId, xp, user_id AS userId
             FROM ledger_entries WHERE event_key LIKE 'fs_pickup_%'`,
        ).map((r) => [r.eventKey, r]),
      )

      return {
        tier: 'confirmed',
        source: 'foodsharing Hackathon-API',
        pickups: rows.map((p) => {
          const credit = paid.get(`fs_pickup_${p.id}`)
          return {
            id: p.id,
            source: p.source,
            pickedUpAt: p.picked_up_at,
            wasTrial: p.was_trial,
            name: p.food_share_point_name ?? p.basket_title ?? p.business_name ?? null,
            foodTypes: p.food_types ?? [],
            lat: p.lat,
            lon: p.lon,
            actionId: credit && credit.userId === user.id ? credit.actionId : null,
            xp: credit && credit.userId === user.id ? credit.xp : 0,
            creditedElsewhere: Boolean(credit && credit.userId !== user.id),
          }
        }),
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * One pickup, re-read from the partner. This is the seam phase 3's receipt
   * uses for `kind = 'food'`: the confirmed block is not our copy of the
   * event, it is the event, fetched again from the system that minted it.
   */
  app.get('/api/foodsharing/pickup/:pickupId', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const wanted = Number(request.params.pickupId)
    try {
      const rows = await fs.history(actingUser(request), 500)
      const found = rows.find((p) => p.id === wanted)
      if (!found) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Diese Abholung steht nicht in der foodsharing-Historie.',
        })
      }
      return { tier: 'confirmed', source: 'foodsharing Hackathon-API', pickup: found }
    } catch (error) {
      return fail(reply, error, request)
    }
  })
}

/**
 * Why a Geschäftsrettung is locked, in German.
 *
 * The API's own `next_step` is an English instruction for a developer
 * ("PATCH /users/me …"), which is the right thing for a sandbox and the wrong
 * thing for a person. So the status is translated into what it means, and the
 * raw field travels along for whoever wants it.
 */
function lockReason(verification) {
  if (!verification || verification.is_verified) return null

  const byStatus = {
    quiz_pending: 'Der foodsharing-Onlinetest ist noch offen.',
    trial_pending: `Es fehlen noch Einführungsabholungen (${verification.trial_pickups_completed ?? 0} von ${verification.trial_pickups_required ?? 3}).`,
    approval_pending: 'Die Freigabe durch die Mentorin oder den Mentor steht noch aus.',
  }

  return {
    status: verification.status,
    title: 'Geschäftsrettungen sind für diesen Zugang gesperrt',
    why:
      byStatus[verification.status] ??
      'Die foodsharing-Verifikation ist noch nicht abgeschlossen.',
    what: 'Körbe und Fairteiler kannst du trotzdem abholen — dafür braucht foodsharing keine Verifikation.',
    nextStep: verification.next_step ?? null,
  }
}
