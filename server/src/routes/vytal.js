import { randomUUID } from 'node:crypto'

import { all, now, one, run } from '../db.js'
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
 * registration point: `server/src/index.js` registers exactly one file per
 * phase. Hence one file, two prefixes:
 *
 *   /api/vytal/*        Mehrweg — echt, Merchant-API, jeder Wert „bestätigt"
 *   /api/foodsharing/*  Essen retten — echt, jeder Wert „bestätigt"
 *
 * `/api/food/*` stays what it was: the read-only proxy in routes/food.js.
 * The writes are here instead, and the server makes them itself rather than
 * letting the browser report something it claims to have done. That is the
 * difference between a receipt and a promise.
 *
 * Points, as everywhere, come only from `engine/award.js`.
 */

/*
 * Base XP comes from `engine/rewards.js`, not from here.
 *
 * The receipt re-derives a credit from `BASE_XP[kind]` alone, so a base this
 * file invented would make the explanation disagree with the payment — the
 * one thing the receipt exists to prevent.
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
     Vytal — Mehrweg. Echte Merchant-API; jeder Wert trägt „bestätigt".
     ================================================================ */

  /**
   * Every Vytal route needs the person's Vytal identity, and the first one
   * they ever touch creates it. Registration is lazy on purpose: nobody is
   * enrolled with a partner for opening the app.
   */
  async function vytalUserFor(user) {
    return vytal.ensureVytalUser(user.id)
  }

  /** Our own station, as Vytal knows it. */
  const stationName = () => process.env.VYTAL_STORE_NAME ?? 'ReMain-Station'

  /**
   * Whether Vytal is configured at all. Without a token every route below
   * would fail identically and unhelpfully, so it is said once, plainly.
   */
  function requireVytal(reply) {
    if (vytal.hasKey()) return true
    reply.code(503).send({
      error: 'no_key',
      message:
        'Auf dem Server ist kein Vytal-Store-Token hinterlegt (VYTAL_JWT). Mehrweg ist deshalb noch nicht nutzbar.',
    })
    return false
  }

  /**
   * Where this integration stands — what the Integrationen screen reads, and
   * the one place that says out loud that ReMain is itself a Vytal station.
   */
  app.get('/api/vytal/status', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const claims = vytal.storeClaims()
    return {
      tier: vytal.TIER,
      configured: vytal.hasKey(),
      loanDays: vytal.LOAN_DAYS,
      xpPerReturn: BASE_XP.vytal,
      store: claims && { ...claims, name: stationName() },
      registered: Boolean(vytal.vytalUserId(user.id)),
      note: 'Der Store-Token gehört einer Ausgabestelle. Ausgabe und Rücknahme laufen deshalb immer über unsere eigene Station, nicht über fremde Vytal-Partner.',
    }
  })

  /** Real Vytal partners nearby — public directory, no token involved. */
  app.get('/api/vytal/stores', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { lat, lon, r, q } = request.query ?? {}
    const home = one('SELECT lat, lon FROM districts WHERE id = ?', user.district_id)
    const at = { lat: num(lat, home?.lat ?? 50.1109), lon: num(lon, home?.lon ?? 8.6821) }

    try {
      const stores = q
        ? await vytal.stores.search({ query: String(q), lat: at.lat, lon: at.lon, limit: 25 })
        // `r` is kilometres, hence the *1000. The default was 5000 — i.e. a
        // 5000 km proximity, the metre default of `nearby()` run through the
        // conversion a second time. Harmless only because the directory
        // sorts by distance and the limit binds long before the radius does.
        : await vytal.stores.nearby({ lat: at.lat, lon: at.lon, radiusM: num(r, 5) * 1000, limit: 25 })

      // Return boxes are a Vytal store type, but there are none deployed in
      // the Frankfurt area — checked against the live directory. Saying so
      // beats an empty list the person has to interpret.
      return {
        tier: vytal.TIER,
        source: 'Vytal Filialverzeichnis (öffentlich)',
        at,
        stores,
        returnBoxes: [],
        returnBoxNote:
          'Im Raum Frankfurt gibt es derzeit keine Vytal-Rückgabeboxen. Zurückgeben kannst du an unserer Station.',
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /** What our station can hand out right now. */
  app.get('/api/vytal/stock', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    try {
      return { tier: vytal.TIER, store: stationName(), stock: await vytal.stock() }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * What this person holds, handed back, or was charged for.
   *
   * The credited-ness of each returned container is read back out of our own
   * ledger by its cycle key, so the screen can show a receipt link on the
   * ones that paid and nothing on the ones that did not.
   */
  app.get('/api/vytal/containers', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    try {
      const vytalUser = await vytalUserFor(user)
      const held = await vytal.containers(vytalUser)

      const withCredit = (list) =>
        list.map((c) => {
          const paid = c.cycleKey ? paidFor(c.cycleKey) : null
          const mine = paid && paid.userId === user.id
          return {
            ...c,
            actionId: mine ? paid.actionId : null,
            xp: mine ? paid.xp : 0,
            creditedAt: mine ? paid.createdAt : null,
          }
        })

      return {
        tier: vytal.TIER,
        source: 'Vytal Merchant-API',
        loanDays: vytal.LOAN_DAYS,
        xpPerReturn: BASE_XP.vytal,
        station: stationName(),
        active: held.active,
        returned: withCredit(held.returned),
        sold: held.sold,
        counts: held.counts,
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * What did the camera see?
   *
   * The app sends the raw decode and nothing else. Vytal's documentation is
   * explicit that code validation belongs in the backend — there are legacy
   * formats in circulation and only Vytal knows them all — so the app is not
   * allowed to decide that a string looks like a container.
   *
   * The answer carries a `transactionId` minted here and written down before
   * anything is booked. The app hands it back on confirm, which is what makes
   * a retry after a timeout idempotent on Vytal's side rather than a second
   * bowl on someone's account.
   */
  app.post('/api/vytal/scan', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    const { code, intent } = request.body ?? {}
    if (!code || typeof code !== 'string') {
      return reply.code(422).send({ error: 'missing_code', message: 'Es fehlt der gescannte Code.' })
    }
    if (!['checkout', 'return'].includes(intent)) {
      return reply
        .code(422)
        .send({ error: 'bad_intent', message: 'Unbekannte Absicht — ausleihen oder zurückgeben.' })
    }

    try {
      const scanned = await vytal.checkCode(code)

      if (!scanned.ok || scanned.type === 'Invalid') {
        return reply.code(404).send({
          error: 'invalid_code',
          message: 'Das ist kein gültiger Vytal-Code.',
        })
      }
      if (scanned.type === 'User') {
        return reply.code(422).send({
          error: 'user_code',
          message:
            'Das ist ein Vytal-Nutzercode, kein Behälter. In ReMain brauchst du ihn nicht — scanne den Code auf dem Behälter.',
        })
      }

      const vytalUser = await vytalUserFor(user)
      const transactionId = randomUUID()
      run(
        `INSERT INTO vytal_transactions (id, user_id, kind, qr_code, container_id, short_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        transactionId,
        user.id,
        intent,
        code,
        scanned.containerId,
        scanned.shortId,
        now(),
      )

      // For a return, the cycle this container is on decides whether a credit
      // is still outstanding — so say it before the person taps anything.
      let alreadyCredited = null
      if (intent === 'return') {
        const held = await vytal.containers(vytalUser)
        const cycle =
          held.active.find((c) => c.containerId === scanned.containerId) ??
          held.returned.find((c) => c.containerId === scanned.containerId)
        if (cycle?.cycleKey) {
          const paid = paidFor(cycle.cycleKey)
          if (paid && paid.userId === user.id) {
            alreadyCredited = { actionId: paid.actionId, xp: paid.xp, at: paid.createdAt }
          }
        }
      }

      return {
        tier: vytal.TIER,
        transactionId,
        intent,
        container: scanned,
        registered: Boolean(vytalUser),
        alreadyCredited,
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /**
   * Take a container out.
   *
   * Draws on our own station's stock — the token decides which store that is,
   * so there is nothing to choose. Borrowing earns nothing: carrying a bowl
   * home is not yet the good deed, bringing it back is.
   */
  app.post('/api/vytal/checkout', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    const tx = pendingTransaction(request, reply, user, 'checkout')
    if (!tx) return

    try {
      const vytalUser = await vytalUserFor(user)
      const result = await vytal.checkout({
        vytalUserId: vytalUser,
        qrCodes: [tx.qr_code],
        transactionId: tx.id,
      })

      settleTransaction(tx.id, 'done', result.result, null)

      return {
        tier: vytal.TIER,
        ok: true,
        message: `Behälter ausgegeben. Zurück bis in ${vytal.LOAN_DAYS} Tagen.`,
        result,
        station: result.storeName ?? stationName(),
      }
    } catch (error) {
      settleTransaction(tx.id, 'failed', error?.detail?.result ?? null, null)
      return fail(reply, error, request)
    }
  })

  /**
   * Bring a container back — and get paid for it, exactly once.
   *
   * The order is deliberate. The rental cycle is read first, because the
   * ledger key is (container, checkout time) and after the return the
   * container has moved lists. Then Vytal books it. Only then is a credit
   * written, out of Vytal's own answer.
   *
   * Scan the same bowl twice and the second attempt earns nothing: Vytal
   * refuses the booking, and even if it did not, `award()` refuses a key it
   * has already paid. Both halves are shown to the person rather than
   * swallowed.
   */
  app.post('/api/vytal/returns', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    const tx = pendingTransaction(request, reply, user, 'return')
    if (!tx) return

    try {
      const vytalUser = await vytalUserFor(user)

      // The cycle key has to be read while the container is still active.
      const before = await vytal.containers(vytalUser)
      const cycle = before.active.find((c) => c.containerId === tx.container_id)

      if (!cycle) {
        const done = before.returned.find((c) => c.containerId === tx.container_id)
        settleTransaction(tx.id, 'failed', 'NotActive', null)
        const paid = done?.cycleKey ? paidFor(done.cycleKey) : null
        return reply.code(409).send({
          error: 'not_active',
          message: done
            ? `Dieser Behälter ist schon zurück — am ${stamp(done.returnTime ?? done.checkoutTime)}.`
            : 'Dieser Behälter ist nicht auf dich ausgeliehen.',
          alreadyPaid:
            paid && paid.userId === user.id
              ? { actionId: paid.actionId, xp: paid.xp, at: paid.createdAt }
              : null,
        })
      }

      const result = await vytal.returnContainer({
        qrCodes: [tx.qr_code],
        transactionId: tx.id,
      })

      const where = result.storeName ?? stationName()
      const label = cycle.typeName ?? cycle.name ?? 'Mehrwegbehälter'
      const reason = `Vytal-Behälter ${label} (${cycle.name ?? tx.short_id ?? tx.container_id}) zurückgegeben bei ${where} am ${stamp(result.timestamp ?? now())} · Vytal-Vorgang ${tx.id}`

      const credit = award({
        userId: user.id,
        kind: 'vytal',
        refTable: 'vytal_transactions',
        refId: tx.id,
        tier: vytal.TIER,
        reason,
        xp: BASE_XP.vytal,
        eventKey: cycle.cycleKey,
      })

      settleTransaction(tx.id, 'done', result.result, cycle.cycleKey)

      if (!credit.ok) {
        const paid = paidFor(cycle.cycleKey)
        return {
          tier: vytal.TIER,
          ok: true,
          credited: false,
          code: credit.code,
          message: `Rückgabe gebucht — belohnt wurde sie schon am ${paid ? stamp(paid.createdAt) : 'früher'}. Eine Ausleihe zählt genau einmal.`,
          result,
          container: cycle,
          alreadyPaid: paid && {
            actionId: paid.actionId,
            xp: paid.xp,
            coins: paid.coins,
            at: paid.createdAt,
          },
        }
      }

      // A credit of zero is not a failure: the daily cap records the action
      // and pays nothing, with a sentence saying why.
      return {
        tier: vytal.TIER,
        ok: true,
        credited: true,
        blocked: credit.blocked,
        hint: credit.hint,
        message: `Rückgabe bestätigt von Vytal, ${stamp(result.timestamp ?? now())}.`,
        result,
        container: cycle,
        award: credit,
      }
    } catch (error) {
      settleTransaction(tx.id, 'failed', error?.detail?.result ?? null, null)
      return fail(reply, error, request)
    }
  })

  /**
   * Vytal's own CO₂ figure for this person.
   *
   * This is a measurement from the partner, not our estimate — the one number
   * on the Mehrweg screen that needs no assumption printed under it. The
   * caveat that does have to be printed: it counts only containers our
   * station issued and that came back.
   */
  app.get('/api/vytal/impact', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return
    if (!requireVytal(reply)) return

    try {
      const vytalUser = await vytalUserFor(user)
      const saved = await vytal.co2Saved(vytalUser)
      return {
        tier: vytal.TIER,
        source: 'Vytal Merchant-API',
        ...saved,
        scope: `Gezählt werden nur Behälter, die über ${stationName()} ausgegeben und wieder zurückgegeben wurden.`,
      }
    } catch (error) {
      return fail(reply, error, request)
    }
  })

  /* ----------------------------------------------------------------
     Transaction bookkeeping
     ---------------------------------------------------------------- */

  /**
   * The scan that this confirm belongs to.
   *
   * A transaction is claimed once. Replaying a `transactionId` that has
   * already settled is refused here rather than forwarded — Vytal would treat
   * it as idempotent and answer success, and the app would show a second
   * confirmation for something that happened once.
   */
  function pendingTransaction(request, reply, user, kind) {
    const { transactionId } = request.body ?? {}
    if (!transactionId) {
      reply.code(422).send({ error: 'missing_transaction', message: 'Es fehlt der Scan-Vorgang.' })
      return null
    }

    const tx = one('SELECT * FROM vytal_transactions WHERE id = ?', transactionId)
    if (!tx || tx.user_id !== user.id) {
      reply.code(404).send({ error: 'unknown_transaction', message: 'Diesen Scan kennen wir nicht.' })
      return null
    }
    if (tx.kind !== kind) {
      reply.code(409).send({
        error: 'wrong_intent',
        message: 'Dieser Scan war für etwas anderes gedacht. Scanne noch einmal.',
      })
      return null
    }
    if (tx.status !== 'pending') {
      reply.code(409).send({
        error: 'already_settled',
        message: 'Dieser Scan ist schon verbucht. Scanne noch einmal.',
      })
      return null
    }
    return tx
  }

  const settleTransaction = (id, status, result, eventKey) =>
    run(
      `UPDATE vytal_transactions SET status = ?, result = ?, event_key = ?, settled_at = ? WHERE id = ?`,
      status,
      result,
      eventKey,
      now(),
      id,
    )

  /* ================================================================
     foodsharing — echt. Der einzige Partner, der unser Wort bestätigt.
     ================================================================ */

  /**
   * The one foodsharing account ReMain acts as.
   *
   * The team key carries two test accounts in deliberately different
   * verification states, and the screen used to let you switch between them
   * with `?as=`. That made the app a demonstration of the interface rather
   * than a use of it: the person signed into ReMain has one foodsharing
   * account, not a choice of two.
   *
   * So we bind to one, and to the verified one — otherwise every
   * Geschäftsrettung is permanently locked for a reason the app offers no way
   * out of. Resolved once from `GET /users` rather than written down here,
   * because the ids belong to the key and change with it; FS_USER_ID pins a
   * specific account when that is wanted.
   */
  let bound
  function actingUser() {
    if (bound === undefined) {
      bound = (async () => {
        const pinned = Number(process.env.FS_USER_ID)
        if (Number.isInteger(pinned) && pinned > 0) return pinned
        const users = await fs.users()
        const chosen =
          users.find((u) => u.verification?.is_verified) ?? users.find((u) => u.is_default)
        return chosen?.id
      })()
      // A lookup that failed must not be the answer for the rest of the
      // process — the next request tries again.
      bound.catch(() => {
        bound = undefined
      })
    }
    return bound
  }

  /** The acting user with the verification state, straight from the API. */
  app.get('/api/foodsharing/state', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    try {
      const acting = await fs.me(await actingUser())
      return {
        tier: 'confirmed',
        source: 'foodsharing Hackathon-API',
        acting,
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
    const as = await actingUser()

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
      const created = await fs.requestBasket(basketId, await actingUser(), message)
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
    const as = await actingUser()

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
      const rows = await fs.history(await actingUser(), 50)
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
      const rows = await fs.history(await actingUser(), 500)
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
