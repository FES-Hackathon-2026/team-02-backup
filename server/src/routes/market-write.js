import { all, distanceKm, id, now, one, run, tx } from '../db.js'
import { award } from '../engine/award.js'
import { BASE_XP } from '../engine/rewards.js'
import { requireUser } from '../session.js'

/**
 * Phase 6 — Reparatur-Markt, the writing half.
 *
 * The thing with the small defect reaches someone who can fix it instead of
 * becoming bulky waste. Nothing here has a price: free-to-take is what keeps
 * this out of the way of commercial second-hand, and out of the way of the
 * reward rules.
 *
 *   GET  /api/market/defects       the tag catalogue — defects are tags, never free text
 *   GET  /api/market/mine          what I offered and what I reserved
 *   GET  /api/market/:id           one item, with the two confirmations and real repair shops
 *   POST /api/market               offer something
 *   POST /api/market/:id/claim     reserve it and propose a pickup window
 *   POST /api/market/:id/release   give the reservation back
 *   POST /api/market/:id/handover  confirm the handover — credit only once both sides have
 *
 * GET /api/market (the open list) stays in content.js.
 *
 * --- one note on storage -------------------------------------------------
 * `market_items` carries `status` and `claimed_by` but no column for "who has
 * confirmed the handover" and none for the agreed window, and schema.sql is
 * closed. Both therefore live in `actions`, which the schema declares as the
 * row "per thing a person did" — a confirmation and a proposed window are
 * exactly that:
 *
 *   ref_table 'market_handover', ref_id <itemId>            status pending | rejected
 *   ref_table 'market_window',   ref_id <itemId>#<windowId> status open    | rejected
 *
 * The window id has to ride in ref_id because there is no text column to put
 * it in. That is the one place phase 6 would have asked for a column.
 */

/* ------------------------------------------------------------------
   Catalogue. Tags, not free text: they keep the list filterable, they
   stop "kaputt lol", and they give the scan agent (phase 4) a fixed
   vocabulary to suggest from.
   ------------------------------------------------------------------ */

const CATEGORIES = [
  { id: 'elektro', label: 'Elektro' },
  { id: 'moebel', label: 'Möbel' },
  { id: 'fahrrad', label: 'Fahrrad' },
  { id: 'sonstiges', label: 'Sonstiges' },
]

const DEFECTS = {
  elektro: [
    'Pumpe defekt',
    'Akku schwach',
    'Schalter klemmt',
    'Motor brummt',
    'Kabel beschädigt',
    'Schlauch gerissen',
    'Brühgruppe verkalkt',
    'Display dunkel',
    'Startet nicht mehr',
  ],
  moebel: [
    'Lehne lose',
    'Bein wackelt',
    'Scharnier ausgerissen',
    'Bezug gerissen',
    'Schublade klemmt',
    'Kratzer im Lack',
  ],
  fahrrad: [
    'Bremszug gerissen',
    'Akku schwach',
    'Schaltung verstellt',
    'Reifen platt',
    'Speichen gebrochen',
    'Kette gerissen',
  ],
  sonstiges: [
    'Kleinteil fehlt',
    'Naht offen',
    'Glas gesprungen',
    'Nur verschmutzt',
    'Unklar — bitte ansehen',
  ],
}

const CONDITIONS = [
  'läuft sonst',
  'komplett',
  'massiv',
  'kaum benutzt',
  'Rahmen ok',
  'Gebrauchsspuren',
  'Zubehör dabei',
]

/** Every defect tag across all categories, for validation. */
const ALL_DEFECTS = new Set(Object.values(DEFECTS).flat())
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))

/* ------------------------------------------------------------------
   Pickup windows. Generated from the clock rather than stored as copy,
   so "Heute, 18–20 Uhr" is never a lie the next morning.
   ------------------------------------------------------------------ */

const SLOTS = [
  [10, 12],
  [14, 16],
  [18, 20],
]

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** '2026-09-12T18:00/20:00' — a real point in time, not a label. */
function windowId(date, [from, to]) {
  return `${dayKey(date)}T${pad(from)}:00/${pad(to)}:00`
}

function parseWindow(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00\/(\d{2}):00$/.exec(value ?? '')
  if (!m) return null
  const [, y, mo, d, from, to] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  return { date, from: Number(from), to: Number(to) }
}

function windowLabel(value) {
  const w = parseWindow(value)
  if (!w) return null
  const today = new Date()
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((w.date - midnight) / 86_400_000)
  const when =
    days === 0
      ? 'Heute'
      : days === 1
        ? 'Morgen'
        : `${DAY_SHORT[w.date.getDay()]}, ${pad(w.date.getDate())}.${pad(w.date.getMonth() + 1)}.`
  return `${when}, ${w.from}–${w.to} Uhr`
}

/** The next four slots that have not started yet. */
function windowOptions(from = new Date()) {
  const out = []
  for (let day = 0; day < 4 && out.length < 4; day++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + day)
    for (const slot of SLOTS) {
      if (out.length >= 4) break
      if (day === 0 && from.getHours() >= slot[0]) continue
      const value = windowId(date, slot)
      out.push({ id: value, label: windowLabel(value) })
    }
  }
  return out
}

/* ------------------------------------------------------------------
   Reward. Both sides are credited, and only once both have confirmed.
   Phase 3's rules (net impact, daily cap, repeat damper) land inside
   award() and apply to these numbers without anything here changing.
   ------------------------------------------------------------------ */

/**
 * Both sides pass the same base value — `BASE_XP.market` from the engine,
 * rather than a number invented here. The asymmetry between the two people
 * is not ours to decide: `causesTravel()` already charges the trip to the
 * person who collects and not to the one who stayed home, so the collector's
 * credit comes out lower by exactly the CO₂ their journey cost.
 */

/**
 * `plausible`, never `confirmed`: two people pressing a button is a strong
 * signal that the thing changed hands, but it is not an interface telling us
 * so. The receipt says exactly that.
 */
const TIER = 'plausible'

const eventKeyFor = (itemId, side) => `market:${itemId}:${side}`

/* ------------------------------------------------------------------ */

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

function nearestDistrict(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  let best = null
  for (const d of all('SELECT id, lat, lon FROM districts')) {
    const km = distanceKm({ lat, lon }, d)
    if (!best || km < best.km) best = { id: d.id, km }
  }
  return best?.id ?? null
}

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    defect: row.defect,
    condition: row.condition,
    category: row.category,
    district: row.district_name ?? null,
    lat: row.lat,
    lon: row.lon,
    photoId: row.photo_id,
    status: row.status,
    createdAt: row.created_at,
    ownerId: row.user_id,
    ownerName: row.owner_name ?? null,
    claimedBy: row.claimed_by,
    claimerName: row.claimer_name ?? null,
  }
}

const ITEM_SELECT = `
  SELECT m.*, d.name AS district_name,
         o.name AS owner_name, c.name AS claimer_name
    FROM market_items m
    LEFT JOIN districts d ON d.id = m.district_id
    LEFT JOIN users o     ON o.id = m.user_id
    LEFT JOIN users c     ON c.id = m.claimed_by`

const loadItem = (itemId) => one(`${ITEM_SELECT} WHERE m.id = ?`, itemId)

/** Who has pressed "übergeben" for this item and not had it withdrawn. */
function confirmations(itemId) {
  const rows = all(
    `SELECT user_id FROM actions
      WHERE ref_table = 'market_handover' AND ref_id = ? AND status = 'pending'`,
    itemId,
  )
  return new Set(rows.map((r) => r.user_id))
}

function agreedWindow(itemId) {
  const row = one(
    `SELECT ref_id FROM actions
      WHERE ref_table = 'market_window' AND ref_id LIKE ? AND status = 'open'
      ORDER BY id DESC LIMIT 1`,
    `${itemId}#%`,
  )
  if (!row) return null
  const value = row.ref_id.slice(itemId.length + 1)
  const label = windowLabel(value)
  return label ? { id: value, label } : null
}

/** The action id behind a credit, so the screen can link to its receipt. */
function receiptFor(itemId, side) {
  const row = one(
    'SELECT action_id FROM ledger_entries WHERE event_key = ?',
    eventKeyFor(itemId, side),
  )
  return row?.action_id ?? null
}

/** The other half of the marketplace: who can actually fix this. Real OSM shops. */
function repairShopsNear(lat, lon, limit = 3) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
  return all("SELECT id, name, addr, opening_hours, lat, lon FROM places WHERE kind = 'reparatur'")
    .map((p) => ({
      id: p.id,
      name: p.name,
      addr: p.addr,
      openingHours: p.opening_hours,
      distanceKm: Number(distanceKm({ lat, lon }, p).toFixed(2)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

/** Everything a screen needs to render one item and decide what to offer. */
function detail(item, viewerId) {
  const confirmed = confirmations(item.id)
  const done = item.status === 'handed_over'
  const role =
    viewerId === item.user_id ? 'owner' : viewerId === item.claimed_by ? 'claimer' : 'visitor'

  return {
    item: shape(item),
    role,
    window: agreedWindow(item.id),
    windowOptions: item.status === 'open' ? windowOptions() : [],
    handover: {
      owner: done || confirmed.has(item.user_id),
      claimer: done || (item.claimed_by !== null && confirmed.has(item.claimed_by)),
      complete: done,
    },
    receiptActionId:
      role === 'owner'
        ? receiptFor(item.id, 'offer')
        : role === 'claimer'
          ? receiptFor(item.id, 'claim')
          : null,
    repairShops: repairShopsNear(item.lat, item.lon),
    attribution: '© OpenStreetMap contributors (ODbL)',
  }
}

/* ------------------------------------------------------------------ */

export default async function marketWriteRoutes(app) {
  /** The tag vocabulary. One list, so the app and the scan agent agree. */
  app.get('/api/market/defects', async () => ({
    categories: CATEGORIES,
    defects: DEFECTS,
    conditions: CONDITIONS,
  }))

  /**
   * My side of the market. The open list in content.js deliberately hides
   * reserved items, so this is the only way back to a handover in progress —
   * and both phones need it.
   */
  app.get('/api/market/mine', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const withState = (row) => {
      const confirmed = confirmations(row.id)
      const done = row.status === 'handed_over'
      return {
        ...shape(row),
        window: agreedWindow(row.id),
        handover: {
          owner: done || confirmed.has(row.user_id),
          claimer: done || (row.claimed_by !== null && confirmed.has(row.claimed_by)),
          complete: done,
        },
      }
    }

    return {
      offered: all(`${ITEM_SELECT} WHERE m.user_id = ? ORDER BY m.created_at DESC`, user.id).map(
        withState,
      ),
      claimed: all(`${ITEM_SELECT} WHERE m.claimed_by = ? ORDER BY m.created_at DESC`, user.id).map(
        withState,
      ),
    }
  })

  app.get('/api/market/:id', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const item = loadItem(request.params.id)
    if (!item) {
      return reply.code(404).send({ error: 'unknown_item', message: 'Dieses Angebot gibt es nicht.' })
    }
    return detail(item, user.id)
  })

  /**
   * Offer something. `photoId` normally comes straight from the scan, so the
   * picture the agent looked at is the picture the next person sees.
   */
  app.post('/api/market', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const body = request.body ?? {}
    const title = text(body.title, 80)
    const defect = text(body.defect, 60)
    const condition = text(body.condition, 60)
    const category = text(body.category, 20)

    if (title.length < 2) {
      return reply.code(422).send({
        error: 'title_too_short',
        message: 'Bitte sag in zwei Worten, was es ist — „Waschmaschine, Bosch“ reicht.',
      })
    }
    if (!CATEGORY_IDS.has(category)) {
      return reply
        .code(422)
        .send({ error: 'unknown_category', message: 'Diese Kategorie kennen wir nicht.' })
    }
    if (!ALL_DEFECTS.has(defect)) {
      return reply.code(422).send({
        error: 'unknown_defect',
        message: 'Bitte einen Defekt aus der Liste wählen — Freitext nimmt der Markt nicht an.',
      })
    }
    if (condition && !CONDITIONS.includes(condition)) {
      return reply
        .code(422)
        .send({ error: 'unknown_condition', message: 'Diesen Zustand kennen wir nicht.' })
    }

    let photoId = null
    if (body.photoId) {
      const photo = one('SELECT id FROM photos WHERE id = ? AND user_id = ?', body.photoId, user.id)
      if (!photo) {
        return reply.code(422).send({ error: 'unknown_photo', message: 'Dieses Foto kennen wir nicht.' })
      }
      photoId = photo.id
    }

    const lat = Number(body.lat)
    const lon = Number(body.lon)
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon)

    // Position first, the person's own Stadtteil as the fallback. Nothing is
    // invented: without a position the item simply sits in their district.
    const home = one('SELECT lat, lon FROM districts WHERE id = ?', user.district_id)
    const districtId = (hasPos ? nearestDistrict(lat, lon) : null) ?? user.district_id

    const itemId = id('item')
    run(
      `INSERT INTO market_items
         (id, user_id, title, defect, condition, category, district_id, lat, lon, photo_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      itemId,
      user.id,
      title,
      defect,
      condition || null,
      category,
      districtId,
      hasPos ? lat : (home?.lat ?? null),
      hasPos ? lon : (home?.lon ?? null),
      photoId,
      now(),
    )

    // No credit for offering. The reward belongs to the handover, or the
    // market fills up with things nobody ever collects.
    return reply.code(201).send(detail(loadItem(itemId), user.id))
  })

  /** Reserve it, and say when it could be picked up. */
  app.post('/api/market/:id/claim', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const item = loadItem(request.params.id)
    if (!item) {
      return reply.code(404).send({ error: 'unknown_item', message: 'Dieses Angebot gibt es nicht.' })
    }
    if (item.user_id === user.id) {
      return reply.code(409).send({
        error: 'own_item',
        message: 'Das ist dein eigenes Angebot — du kannst es nicht selbst abholen.',
      })
    }
    if (item.status !== 'open') {
      return reply.code(409).send({
        error: 'not_open',
        message:
          item.claimed_by === user.id
            ? 'Du hast das schon reserviert.'
            : 'Das hat sich gerade jemand anderes gesichert.',
      })
    }

    const chosen = text(request.body?.window, 40)
    if (chosen && !parseWindow(chosen)) {
      return reply
        .code(422)
        .send({ error: 'unknown_window', message: 'Dieses Zeitfenster kennen wir nicht.' })
    }

    const ts = now()
    tx(() => {
      run(
        "UPDATE market_items SET status = 'reserved', claimed_by = ? WHERE id = ? AND status = 'open'",
        user.id,
        item.id,
      )
      if (chosen) {
        run(
          `INSERT INTO actions (user_id, kind, ref_table, ref_id, status, created_at)
           VALUES (?, 'market', 'market_window', ?, 'open', ?)`,
          user.id,
          `${item.id}#${chosen}`,
          ts,
        )
      }
    })()

    return detail(loadItem(item.id), user.id)
  })

  /** Plans change. Either side can hand the reservation back. */
  app.post('/api/market/:id/release', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const item = loadItem(request.params.id)
    if (!item) {
      return reply.code(404).send({ error: 'unknown_item', message: 'Dieses Angebot gibt es nicht.' })
    }
    if (item.status !== 'reserved') {
      return reply.code(409).send({ error: 'not_reserved', message: 'Hier ist gerade nichts reserviert.' })
    }
    if (item.user_id !== user.id && item.claimed_by !== user.id) {
      return reply.code(403).send({ error: 'not_involved', message: 'Das betrifft dich nicht.' })
    }

    // Confirmations and the window are marked rejected, never deleted: the
    // trail of who pressed what stays readable.
    tx(() => {
      run("UPDATE market_items SET status = 'open', claimed_by = NULL WHERE id = ?", item.id)
      run(
        `UPDATE actions SET status = 'rejected'
          WHERE ref_table = 'market_handover' AND ref_id = ? AND status = 'pending'`,
        item.id,
      )
      run(
        `UPDATE actions SET status = 'rejected'
          WHERE ref_table = 'market_window' AND ref_id LIKE ? AND status = 'open'`,
        `${item.id}#%`,
      )
    })()

    return detail(loadItem(item.id), user.id)
  })

  /**
   * Confirm the handover.
   *
   * One press is a claim; two presses from the two people involved is a
   * handover. Only the second one creates anything — and it credits both
   * sides, each through award() with its own event key, so a double tap, a
   * retry or a refresh can never pay twice.
   */
  app.post('/api/market/:id/handover', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const item = loadItem(request.params.id)
    if (!item) {
      return reply.code(404).send({ error: 'unknown_item', message: 'Dieses Angebot gibt es nicht.' })
    }

    const isOwner = item.user_id === user.id
    const isClaimer = item.claimed_by === user.id
    if (!isOwner && !isClaimer) {
      return reply.code(403).send({
        error: 'not_involved',
        message: 'Nur die beiden Beteiligten bestätigen die Übergabe.',
      })
    }
    if (item.status === 'handed_over') return detail(item, user.id)
    if (item.status !== 'reserved') {
      return reply.code(409).send({ error: 'not_reserved', message: 'Erst reservieren, dann übergeben.' })
    }

    const already = confirmations(item.id)
    if (!already.has(user.id)) {
      run(
        `INSERT INTO actions (user_id, kind, ref_table, ref_id, status, tier, created_at)
         VALUES (?, 'market', 'market_handover', ?, 'pending', ?, ?)`,
        user.id,
        item.id,
        TIER,
        now(),
      )
      already.add(user.id)
    }

    if (!(already.has(item.user_id) && already.has(item.claimed_by))) {
      const waitingFor = isOwner ? item.claimer_name : item.owner_name
      return {
        ...detail(loadItem(item.id), user.id),
        message: `Bestätigt. Sobald ${waitingFor ?? 'die andere Seite'} das auch tut, wird gutgeschrieben.`,
      }
    }

    // Both sides agree. Close the item first, then credit — award() is the
    // only thing that writes to the ledger, and its event key is what makes
    // this exactly-once even if both phones press at the same moment.
    run("UPDATE market_items SET status = 'handed_over' WHERE id = ? AND status = 'reserved'", item.id)

    const offerAward = award({
      userId: item.user_id,
      kind: 'market',
      refTable: 'market_items',
      refId: item.id,
      tier: TIER,
      reason: `„${item.title}“ weitergegeben statt entsorgt — Übergabe von beiden Seiten bestätigt`,
      xp: BASE_XP.market,
      eventKey: eventKeyFor(item.id, 'offer'),
    })
    const claimAward = award({
      userId: item.claimed_by,
      kind: 'market',
      refTable: 'market_items',
      refId: item.id,
      tier: TIER,
      reason: `„${item.title}“ übernommen und weiter benutzt — Übergabe von beiden Seiten bestätigt`,
      xp: BASE_XP.market,
      eventKey: eventKeyFor(item.id, 'claim'),
    })

    // Whichever of the two pressed second sees their own credit. A blocked
    // one (daily cap, or a trip that cost more than the act) still counts as
    // an action and carries the sentence saying why — that is the engine's
    // call, not this route's.
    const mine = isOwner ? offerAward : claimAward
    return {
      ...detail(loadItem(item.id), user.id),
      message: 'Übergabe bestätigt. Beide Seiten sind gutgeschrieben.',
      award: mine.ok
        ? {
            xp: mine.xp,
            coins: mine.coins,
            actionId: mine.actionId,
            blocked: mine.blocked,
            hint: mine.hint,
            totals: mine.totals,
          }
        : null,
    }
  })
}
