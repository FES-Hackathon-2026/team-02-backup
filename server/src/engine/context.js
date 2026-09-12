/**
 * What the engine knows about one action, read from the database.
 *
 * Both `award()` and the receipt go through here, and that is the whole
 * point: the rules are applied and later explained from the same facts, so
 * the explanation cannot drift away from the decision. Nothing in this file
 * writes.
 */
import { all, distanceKm, one } from '../db.js'

/** Tables an action may point at. Anything else is ignored rather than trusted. */
const REF_TABLES = new Set([
  'quests',
  'quest_submissions',
  'peer_reviews',
  'market_items',
  'pickups',
  'photos',
])

export function loadRef(refTable, refId) {
  if (!refTable || !refId || !REF_TABLES.has(refTable)) return null
  const ref = one(`SELECT * FROM ${refTable} WHERE id = ?`, refId) ?? null
  if (refTable === 'pickups' && ref) {
    const original = one('SELECT category, volume_m3, slot_date, reference FROM pickup_registration_snapshots WHERE pickup_id=?', refId)
    return original ? { ...ref, ...original } : ref
  }
  return ref
}

/**
 * The calendar day in Frankfurt, not in UTC.
 *
 * The daily cap is a promise made to a person standing in Frankfurt, so it
 * has to break at midnight there. 'sv-SE' is the shortest way to an ISO date.
 */
export const berlinDay = (iso) =>
  new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

/**
 * A coarse place identity, ~110 m wide.
 *
 * Used only by the repeat damper, so it wants to be forgiving: three bins
 * on one corner are one place. When there is no position we fall back to the
 * referenced row, which at least catches „the same item again".
 */
export function placeKeyOf(kind, refTable, refId, ref) {
  const row = ref ?? loadRef(refTable, refId)
  if (row && Number.isFinite(row.lat) && Number.isFinite(row.lon)) {
    return `geo:${row.lat.toFixed(3)},${row.lon.toFixed(3)}`
  }
  if (row?.address) return `addr:${String(row.address).toLowerCase().trim()}`
  if (refTable && refId) return `${refTable}:${refId}`
  return null
}

/** Where the person's trip is measured from: the centre of their Stadtteil. */
export function homeOf(user) {
  if (!user?.district_id) return null
  const d = one('SELECT id, name, lat, lon FROM districts WHERE id = ?', user.district_id)
  return d ?? null
}

/**
 * Everything one action is about: the row it points at, the place it
 * happened, the facts the person supplied, and how far it was.
 *
 * Every field is optional on purpose. Phases 5 to 9 write different shapes,
 * and a receipt that renders half a story beats one that throws.
 */
export function subjectOf({ kind, refTable, refId, user, facts = {} }) {
  const ref = loadRef(refTable, refId)

  // A quest submission is about its quest — follow the link so the receipt
  // can name the place rather than an id.
  const quest =
    refTable === 'quest_submissions' && ref?.quest_id
      ? one('SELECT * FROM quests WHERE id = ?', ref.quest_id)
      : refTable === 'quests'
        ? ref
        : null

  const place = quest ?? ref ?? null
  const home = homeOf(user)

  const target =
    place && Number.isFinite(place.lat) && Number.isFinite(place.lon)
      ? { lat: place.lat, lon: place.lon }
      : place?.district_id
        ? one('SELECT lat, lon FROM districts WHERE id = ?', place.district_id)
        : null

  const straightKm = home && target ? distanceKm(home, target) : null

  const district = place?.district_id
    ? one('SELECT id, name, bezirk FROM districts WHERE id = ?', place.district_id)
    : null

  return {
    ref,
    quest,
    district,
    home,
    straightKm,
    title: quest?.title ?? ref?.title ?? null,
    facts: {
      // Volumes and weights are typed by a person — „deine Angabe", always.
      kg: facts.kg ?? null,
      uses: facts.uses ?? null,
      volumeM3: facts.volumeM3 ?? ref?.volume_m3 ?? null,
      mode: facts.mode ?? null,
    },
  }
}

/**
 * The person's day up to a moment: how much has already been scored, and how
 * often they were at this place. Both rules read from the append-only ledger,
 * so a receipt written a week later reproduces the same two numbers.
 *
 * @param {number} userId
 * @param {string} at      ISO timestamp; only actions strictly before it count
 * @param {string|null} placeKey
 */
export function dayBefore(userId, at, placeKey) {
  const day = berlinDay(at)

  const rows = all(
    `SELECT a.id, a.kind, a.ref_table, a.ref_id, a.created_at,
            COALESCE(SUM(l.xp), 0) AS xp
       FROM actions a
       LEFT JOIN ledger_entries l ON l.action_id = a.id
      WHERE a.user_id = ? AND a.created_at < ?
      GROUP BY a.id
      ORDER BY a.created_at`,
    userId,
    at,
  ).filter((r) => berlinDay(r.created_at) === day)

  const scored = rows.filter((r) => r.xp > 0)
  const samePlace = placeKey
    ? rows.filter((r) => placeKeyOf(r.kind, r.ref_table, r.ref_id) === placeKey)
    : []

  return { day, scoredBefore: scored.length, samePlaceBefore: samePlace.length, actionsBefore: rows.length }
}
