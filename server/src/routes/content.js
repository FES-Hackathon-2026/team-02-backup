import { all, distanceKm, one } from '../db.js'

/**
 * Reading the world: districts, real places, quests, market items.
 *
 * Writes live in the phases that own them — quests in 7, market in 6,
 * pickups in 5 — so this file stays a read model and the rules stay in
 * the engine.
 */

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Adds distance and sorts, when the caller told us where they are. */
function byDistance(rows, lat, lon, radiusKm, limit) {
  if (lat === undefined || lon === undefined) return rows.slice(0, limit)
  const from = { lat, lon }
  return rows
    .map((r) => ({ ...r, distanceKm: Number(distanceKm(from, r).toFixed(3)) }))
    .filter((r) => r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

export default async function contentRoutes(app) {
  /** All 46 Stadtteile, for the sign-in picker. */
  app.get('/api/districts', async () => ({
    districts: all('SELECT id, name, bezirk, lat, lon FROM districts ORDER BY name COLLATE NOCASE'),
  }))

  /**
   * The neighbourhood standings.
   *
   * Districts are compared, people are not. Everything still adds up to one
   * city total, and the table exists to show where there is room left — not
   * to rank anyone against their neighbour.
   */
  app.get('/api/standings', async () => {
    const rows = all(
      `SELECT d.id, d.name, d.bezirk,
              COALESCE(SUM(l.xp), 0) AS xp,
              COUNT(DISTINCT u.id)   AS people
         FROM districts d
         LEFT JOIN users u          ON u.district_id = d.id
         LEFT JOIN ledger_entries l ON l.user_id = u.id
        GROUP BY d.id
        ORDER BY xp DESC, d.name COLLATE NOCASE`,
    )
    const active = rows.filter((r) => r.people > 0)
    const cityXp = rows.reduce((sum, r) => sum + r.xp, 0)
    return { standings: active, cityXp, districtsWithPeople: active.length }
  })

  /**
   * Real Frankfurt facilities from OpenStreetMap — Wertstoffhöfe, glass and
   * clothing banks, disposal points, repair shops and second-hand places.
   * Nothing here is invented; `isFes` marks the ones FES actually operates.
   */
  app.get('/api/places', async (request) => {
    const { kind, lat, lon, r, limit } = request.query ?? {}
    const rows = kind
      ? all('SELECT * FROM places WHERE kind = ?', kind)
      : all('SELECT * FROM places')

    const shaped = rows.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      addr: p.addr,
      postcode: p.postcode,
      openingHours: p.opening_hours,
      operator: p.operator,
      isFes: p.is_fes === 1,
      website: p.website,
      phone: p.phone,
      source: p.source,
    }))

    const places = byDistance(
      shaped,
      lat === undefined ? undefined : num(lat, undefined),
      lon === undefined ? undefined : num(lon, undefined),
      num(r, 5),
      num(limit, 60),
    )

    return {
      places,
      total: shaped.length,
      attribution: '© OpenStreetMap contributors (ODbL)',
    }
  })

  /** Open quests, nearest first when a position is given. */
  app.get('/api/quests', async (request) => {
    const { lat, lon, r, status } = request.query ?? {}
    const rows = all(
      `SELECT q.*, u.name AS created_by_name, d.name AS district_name
         FROM quests q
         LEFT JOIN users u     ON u.id = q.created_by
         LEFT JOIN districts d ON d.id = q.district_id
        WHERE q.status = ?
        ORDER BY q.created_at DESC`,
      status ?? 'open',
    )

    const shaped = rows.map((q) => ({
      id: q.id,
      title: q.title,
      note: q.note,
      category: q.category,
      lat: q.lat,
      lon: q.lon,
      district: q.district_name,
      xp: q.xp,
      status: q.status,
      photoId: q.photo_id,
      createdBy: q.created_by_name,
      createdAt: q.created_at,
      openForDays: Math.max(
        0,
        Math.round((Date.now() - Date.parse(q.created_at)) / 86_400_000),
      ),
    }))

    return {
      quests: byDistance(
        shaped,
        lat === undefined ? undefined : num(lat, undefined),
        lon === undefined ? undefined : num(lon, undefined),
        num(r, 25),
        60,
      ),
    }
  })

  app.get('/api/quests/:id', async (request, reply) => {
    const q = one('SELECT * FROM quests WHERE id = ?', request.params.id)
    if (!q) return reply.code(404).send({ error: 'unknown_quest' })
    return q
  })

  /** Things with a small defect, looking for someone who can fix them. */
  app.get('/api/market', async (request) => {
    const { category, lat, lon, r, q, sort } = request.query ?? {}

    const rows = category
      ? all(
          `SELECT m.*, d.name AS district_name FROM market_items m
             LEFT JOIN districts d ON d.id = m.district_id
            WHERE m.status = 'open' AND m.category = ? ORDER BY m.created_at DESC`,
          category,
        )
      : all(
          `SELECT m.*, d.name AS district_name FROM market_items m
             LEFT JOIN districts d ON d.id = m.district_id
            WHERE m.status = 'open' ORDER BY m.created_at DESC`,
        )

    const shaped = rows.map((m) => ({
      id: m.id,
      title: m.title,
      defect: m.defect,
      condition: m.condition,
      category: m.category,
      district: m.district_name,
      lat: m.lat,
      lon: m.lon,
      photoId: m.photo_id,
      status: m.status,
      createdAt: m.created_at,
    }))

    // Search and sort before limiting, so matches beyond the first page remain discoverable.
    const terms = String(q ?? '').trim().toLocaleLowerCase('de-DE').split(/\s+/).filter(Boolean)
    const matching = shaped.filter(item => {
      const text = [item.title, item.defect, item.condition, item.district].join(' ').toLocaleLowerCase('de-DE')
      return terms.every(term => text.includes(term))
    })
    const nearby = byDistance(matching,
      lat === undefined ? undefined : num(lat, undefined),
      lon === undefined ? undefined : num(lon, undefined), num(r, 25), Infinity)
    if (sort === 'newest') nearby.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return { items: nearby.slice(0, 60), total: nearby.length }
  })
}
