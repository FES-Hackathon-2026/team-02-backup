import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, all, db, distanceKm, id, now, one, run, tx } from './db.js'

/**
 * Seeds the database so the app is never an empty box.
 *
 * Two kinds of content go in, and the difference matters on stage:
 *
 *   REAL      districts and places. The 46 Stadtteile are the official ones;
 *             the 1000+ facilities come straight from OpenStreetMap with
 *             their OSM ids intact, including the ones FES actually operates.
 *
 *   DEMO      a handful of people, quests and market items, so the map and
 *             the standings have something in them before the first judge
 *             arrives. Every row is flagged is_demo / demo ids, and the app
 *             labels them.
 *
 * Demo quests are pinned to REAL nearby coordinates (a real glass container,
 * a real Wertstoffhof), so walking to one actually takes you somewhere.
 */

const VENUE = {
  lat: Number(process.env.VENUE_LAT ?? 50.1109),
  lon: Number(process.env.VENUE_LON ?? 8.6821),
}

const read = (name) => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'))

/* ------------------------------------------------------------------ */

function seedDistricts() {
  const districts = read('districts.json')
  const stmt = db.prepare(
    `INSERT INTO districts (id, name, bezirk, lat, lon) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, bezirk = excluded.bezirk,
       lat = excluded.lat, lon = excluded.lon`,
  )
  tx(() => {
    for (const d of districts) stmt.run(d.id, d.name, d.bezirk, d.lat, d.lon)
  })()
  return districts.length
}

function seedPlaces() {
  const stmt = db.prepare(
    `INSERT INTO places (id, kind, name, lat, lon, addr, postcode, opening_hours, operator, is_fes, website, phone, source, email, info_url)
     VALUES (@id, @kind, @name, @lat, @lon, @addr, @postcode, @opening_hours, @operator, @is_fes, @website, @phone, @source, @email, @info_url)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, opening_hours = excluded.opening_hours,
       operator = excluded.operator, is_fes = excluded.is_fes, website = excluded.website,
       email = excluded.email, info_url = excluded.info_url`,
  )

  const { places } = read('places.json')

  /*
   * The Repair Cafés live in their own file rather than in places.json,
   * because places.json is overwritten wholesale by scripts/fetch-places.mjs
   * and OpenStreetMap has never heard of seven of these eight. Folding them
   * in here means one table, one distance sort, one /api/places — and the
   * next Overpass run cannot quietly delete them.
   */
  const { cafes } = read('repair-cafes.json')
  const asPlace = (c) => ({
    ...c,
    kind: 'reparaturcafe',
    is_fes: 0,
    source: 'repaircafe.org',
  })

  const rows = [...places.map((p) => ({ ...p, is_fes: p.fes ? 1 : 0 })), ...cafes.map(asPlace)]
  tx(() => {
    for (const p of rows) {
      stmt.run({ email: null, info_url: null, phone: null, ...p })
    }
  })()
  return rows.length
}

/** Nearest real place of a kind, so a demo quest sits somewhere that exists. */
function nearestPlace(kind, from = VENUE) {
  const rows = all('SELECT id, name, lat, lon, addr FROM places WHERE kind = ?', kind)
  let best = null
  let bestKm = Infinity
  for (const r of rows) {
    const km = distanceKm(from, r)
    if (km < bestKm) {
      bestKm = km
      best = r
    }
  }
  return best
}

function districtNear(pos) {
  const rows = all('SELECT id, lat, lon FROM districts')
  let best = rows[0]
  let bestKm = Infinity
  for (const r of rows) {
    const km = distanceKm(pos, r)
    if (km < bestKm) {
      bestKm = km
      best = r
    }
  }
  return best.id
}

/** Scatters a point a little so several demo quests are not stacked. */
const jitter = (p, m) => ({
  lat: p.lat + (Math.random() - 0.5) * (m / 111_320),
  lon: p.lon + (Math.random() - 0.5) * (m / (111_320 * Math.cos((p.lat * Math.PI) / 180))),
})

const DEMO_PEOPLE = [
  { name: 'Lena', district: 'bockenheim', xp: 1240, coins: 340 },
  { name: 'Tarek', district: 'nordend-west', xp: 980, coins: 210 },
  { name: 'Mirjam', district: 'sachsenhausen-nord', xp: 1520, coins: 95 },
  { name: 'Jonas', district: 'gallus', xp: 460, coins: 60 },
  { name: 'Aylin', district: 'bornheim', xp: 720, coins: 180 },
]

const DEMO_QUESTS = [
  { title: 'Müll neben dem Glascontainer', near: 'glascontainer', xp: 120, note: 'Kartons und Flaschen stehen daneben statt drin.' },
  { title: 'Altkleider-Container überfüllt', near: 'altkleider', xp: 80, note: 'Säcke stapeln sich außen.' },
  { title: 'Sperrmüll ohne Anmeldung', near: 'entsorgung', xp: 90, note: 'Zwei Sessel stehen seit Tagen am Gehweg.' },
  { title: 'Papierkorb übervoll', near: 'glascontainer', xp: 60, note: 'Der Korb an der Ecke läuft über.' },
  { title: 'Scherben auf dem Gehweg', near: 'glascontainer', xp: 70, note: 'Bitte mit Handschuhen.' },
  { title: 'Wilde Ablagerung hinter dem Hof', near: 'wertstoffhof', xp: 110, note: 'Farbeimer und Bauschutt.' },
]

const DEMO_MARKET = [
  { title: 'Waschmaschine, Bosch', defect: 'Pumpe defekt', condition: 'läuft sonst', category: 'elektro', district: 'nordend-west' },
  { title: 'E-Bike, 2019', defect: 'Akku schwach', condition: 'Rahmen ok', category: 'fahrrad', district: 'sachsenhausen-nord' },
  { title: 'Siebträgermaschine', defect: 'Brühgruppe verkalkt', condition: 'komplett', category: 'elektro', district: 'gallus' },
  { title: '4 Holzstühle, Eiche', defect: 'Lehne lose', condition: 'massiv', category: 'moebel', district: 'bornheim' },
  { title: 'Standmixer', defect: 'Schalter klemmt', condition: 'Behälter neu', category: 'elektro', district: 'bockenheim' },
  { title: 'Kinderfahrrad 20 Zoll', defect: 'Bremszug gerissen', condition: 'kaum gefahren', category: 'fahrrad', district: 'bockenheim' },
  { title: 'Schreibtisch, höhenverstellbar', defect: 'Motor brummt', condition: 'Platte einwandfrei', category: 'moebel', district: 'ostend' },
  { title: 'Staubsauger', defect: 'Schlauch gerissen', condition: 'Motor stark', category: 'elektro', district: 'nordend-ost' },
]

function seedDemo() {
  const ts = now()

  const users = DEMO_PEOPLE.map((p) => {
    const res = run(
      'INSERT INTO users (name, district_id, role, is_demo, created_at) VALUES (?, ?, ?, 1, ?)',
      p.name,
      p.district,
      'citizen',
      ts,
    )
    const userId = Number(res.lastInsertRowid)

    // Give the standings something to stand on. One opening entry per person
    // rather than a fake history: honest, and the receipt says where it came
    // from ("Startguthaben der Demo-Daten").
    run(
      `INSERT INTO ledger_entries (user_id, xp, coins, reason, tier, created_at)
       VALUES (?, ?, ?, ?, 'simulated', ?)`,
      userId,
      p.xp,
      p.coins,
      'Startguthaben der Demo-Daten',
      ts,
    )
    return { ...p, id: userId }
  })

  let questCount = 0
  for (const q of DEMO_QUESTS) {
    const anchor = nearestPlace(q.near) ?? VENUE
    const pos = jitter(anchor, 120)
    run(
      `INSERT INTO quests (id, created_by, title, note, category, lat, lon, district_id, xp, status, created_at)
       VALUES (?, ?, ?, ?, 'muell', ?, ?, ?, ?, 'open', ?)`,
      id('quest'),
      users[questCount % users.length].id,
      q.title,
      q.note,
      pos.lat,
      pos.lon,
      districtNear(pos),
      q.xp,
      ts,
    )
    questCount++
  }

  let marketCount = 0
  for (const m of DEMO_MARKET) {
    const d = one('SELECT lat, lon FROM districts WHERE id = ?', m.district)
    const pos = d ? jitter(d, 600) : VENUE
    run(
      `INSERT INTO market_items (id, user_id, title, defect, condition, category, district_id, lat, lon, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      id('item'),
      users[marketCount % users.length].id,
      m.title,
      m.defect,
      m.condition,
      m.category,
      m.district,
      pos.lat,
      pos.lon,
      ts,
    )
    marketCount++
  }

  return { users: users.length, quests: questCount, items: marketCount }
}

/* ------------------------------------------------------------------ */

/**
 * Reference data (districts, places) is refreshed every boot — it is real and
 * cheap to re-apply. Demo content is only created when there is none, so a
 * restart never duplicates quests or wipes what a judge just did.
 */
export function seed({ reset = false } = {}) {
  if (reset) {
    tx(() => {
      for (const t of [
        'peer_reviews',
        'quest_submissions',
        'redemptions',
        'ledger_entries',
        'actions',
        'pickups',
        'market_items',
        'quests',
        'photos',
        'users',
      ]) {
        db.exec(`DELETE FROM ${t}`)
      }
    })()
  }

  const districts = seedDistricts()
  const places = seedPlaces()

  const existing = one('SELECT COUNT(*) AS n FROM users').n
  const demo = existing === 0 ? seedDemo() : null

  return { districts, places, demo, alreadySeeded: existing > 0 }
}

// `npm run seed` runs this file directly.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const result = seed({ reset: process.argv.includes('--reset') })
  console.log('seeded:', JSON.stringify(result))
}
