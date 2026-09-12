#!/usr/bin/env node
/**
 * Phase 8 — turn the delivered mobility files into compact JSON the server can
 * read at boot without ever touching a CSV.
 *
 *   node scripts/build-mobility-data.mjs [--date=20250915] [--force]
 *
 * Input  (all committed in the repo, nothing is downloaded):
 *   Mobilitätsdaten/GTFS_gefiltert_Frankfurt+30km.7z   schedule, 8 tables, 154 MB unpacked
 *   Mobilitätsdaten/haltestellen_avg.csv               requests per average month per stop
 *   Mobilitätsdaten/tagesgang_avg.csv                  requests per hour of an average day
 *   Mobilitätsdaten/BeispielAFZ.csv                    passenger counts, cp1252, decimal commas
 *
 * Output (server/data/mobility/, read by server/src/routes/mobility.js):
 *   stations.json   Frankfurt stations with coordinates, modes and lines
 *   patterns.json   one entry per line+direction+stop sequence, with scheduled
 *                   offsets and every departure time of the service day
 *   demand.json     daily profile, per-station request averages, U-Bahn occupancy
 *   meta.json       provenance: source files, checksums, row counts, what we assumed
 *
 * The quirks the data catalogue warns about, and how they are handled here:
 *   - BeispielAFZ.csv is cp1252 with decimal commas and percent signs   -> decoded and parsed separately
 *   - only AFZ rows 2..101 are real; 102..1043 are synthetic            -> counted and reported apart
 *   - shape_id carries a trailing ".0" in trips.txt but not in shapes   -> shapes are not used here
 *   - stop hierarchy is incomplete, parent_station often dangles        -> stations are derived from the
 *                                                                          DHID prefix de:06412:<n>, not
 *                                                                          from parent_station
 *   - stop_times keeps times under 24:00:00 but *_seconds overflow      -> the _seconds columns are used
 *   - EFA original rows carry raw coordinates                           -> EFA is not used here at all
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SOURCE = join(REPO, 'Mobilitätsdaten')
const CACHE = join(REPO, '.cache', 'gtfs')
const GTFS = join(CACHE, 'GTFS_gefiltert_Frankfurt+30km')
const OUT = join(REPO, 'server', 'data', 'mobility')

const args = new Set(process.argv.slice(2))
const flag = (name, fallback) => {
  for (const a of args) if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3)
  return fallback
}

/**
 * A Monday inside the feed's validity (12.07.–13.12.2025) and the same day the
 * synthetic AFZ trips use, so schedule and passenger counts describe one day.
 */
const SERVICE_DATE = flag('date', '20250915')

/** Frankfurt am Main. Its municipality key is the second DHID segment. */
const CITY_PREFIX = 'de:06412:'

/** GTFS route_type -> the short label the app prints. */
const MODES = {
  0: 'Tram',
  1: 'U-Bahn',
  2: 'Zug',
  3: 'Bus',
  101: 'Zug',
  102: 'Zug',
  106: 'Zug',
  109: 'S-Bahn',
  700: 'Bus',
  1501: 'AST',
}

const log = (...m) => console.log(...m)

/* ------------------------------------------------------------------
   CSV — small and deliberate rather than a dependency. Handles quoted
   fields because calendar_dates.txt quotes its header and AFZ quotes
   nothing at all.
   ------------------------------------------------------------------ */

function splitRow(line, sep = ',') {
  const out = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out
}

/** Streams a CSV row by row as plain objects. Never holds the file in memory. */
async function eachRow(file, sep, onRow) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  let header = null
  let n = 0
  for await (const line of rl) {
    if (line === '') continue
    const cells = splitRow(line.replace(/\r$/, ''), sep)
    if (header === null) { header = cells.map((h) => h.replace(/^\uFEFF/, '').trim()); continue }
    const row = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? ''
    n++
    onRow(row, n)
  }
  return n
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/* ------------------------------------------------------------------
   Step 0 — unpack the archive
   ------------------------------------------------------------------ */

function findSevenZip() {
  if (process.env.MOBILITY_7Z) return process.env.MOBILITY_7Z

  const candidates = [
    '7z', '7za', '7zz', '7zr',
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '/opt/homebrew/bin/7z',
    '/usr/bin/7z',
  ]
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['i'], { stdio: 'ignore' })
      return bin
    } catch (err) {
      if (err.code !== 'ENOENT') return bin // it ran and complained: it exists
    }
  }

  // 7zip-bin ships the binary for every platform. Resolve it from wherever a
  // package.json in this repo happens to have pulled it in.
  for (const from of [HERE, join(REPO, 'server'), join(REPO, 'app')]) {
    try {
      const require = createRequire(join(from, 'noop.js'))
      const { path7za } = require('7zip-bin')
      if (path7za && existsSync(path7za)) return path7za
    } catch { /* not installed here */ }
  }
  return null
}

function unpack() {
  if (existsSync(join(GTFS, 'stop_times.txt')) && !args.has('--force')) {
    log(`GTFS already unpacked in ${GTFS} (use --force to redo)`)
    return
  }
  const archive = join(SOURCE, 'GTFS_gefiltert_Frankfurt+30km.7z')
  const bin = findSevenZip()
  if (!bin) {
    throw new Error(
      'No 7-Zip found. Install it (winget install 7zip.7zip / brew install p7zip),\n' +
      'or run `npm i -D 7zip-bin` in server/, or point MOBILITY_7Z at the binary.',
    )
  }
  log(`unpacking ${archive} with ${bin} — 154 MB, takes a moment`)
  mkdirSync(CACHE, { recursive: true })
  execFileSync(bin, ['x', '-y', `-o${CACHE}`, archive], { stdio: 'inherit' })
}

/* ------------------------------------------------------------------
   Step 1 — which services run on the service date
   ------------------------------------------------------------------ */

async function activeServices() {
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date(
      Number(SERVICE_DATE.slice(0, 4)),
      Number(SERVICE_DATE.slice(4, 6)) - 1,
      Number(SERVICE_DATE.slice(6, 8)),
    ).getDay()
  ]

  const active = new Set()
  await eachRow(join(GTFS, 'calendar.txt'), ',', (r) => {
    if (r.start_date <= SERVICE_DATE && SERVICE_DATE <= r.end_date && r[weekday] === '1') {
      active.add(r.service_id)
    }
  })
  const base = active.size

  // exception_type 1 adds the service on that date, 2 removes it
  let added = 0
  let removed = 0
  await eachRow(join(GTFS, 'calendar_dates.txt'), ',', (r) => {
    if (r.date !== SERVICE_DATE) return
    if (r.exception_type === '1') { if (!active.has(r.service_id)) added++; active.add(r.service_id) }
    else if (r.exception_type === '2') { if (active.delete(r.service_id)) removed++ }
  })

  log(`services on ${SERVICE_DATE} (${weekday}): ${base} from calendar, +${added} / -${removed} exceptions -> ${active.size}`)
  return { active, weekday, base, added, removed }
}

/* ------------------------------------------------------------------
   Step 2 — Frankfurt stations
   ------------------------------------------------------------------ */

/** de:06412:1507:6:6 -> de:06412:1507. The catalogue calls parent_station unreliable. */
const stationOf = (stopId) => stopId.split(':').slice(0, 3).join(':')

async function readStations() {
  const stations = new Map()
  const stopToStation = new Map()
  let all = 0

  await eachRow(join(GTFS, 'stops.txt'), ',', (r) => {
    all++
    if (!r.stop_id.startsWith(CITY_PREFIX)) return
    const lat = Number(r.stop_lat)
    const lon = Number(r.stop_lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

    const sid = stationOf(r.stop_id)
    stopToStation.set(r.stop_id, sid)

    let s = stations.get(sid)
    if (!s) {
      s = { id: sid, names: new Map(), lat: 0, lon: 0, n: 0, lines: new Set(), modes: new Set(), departures: 0 }
      stations.set(sid, s)
    }
    s.names.set(r.stop_name, (s.names.get(r.stop_name) ?? 0) + 1)
    s.lat += lat
    s.lon += lon
    s.n++
  })

  log(`stops: ${all} in the feed, ${stopToStation.size} in Frankfurt -> ${stations.size} stations`)
  return { stations, stopToStation }
}

/* ------------------------------------------------------------------
   Step 3 — routes and the trips that run today
   ------------------------------------------------------------------ */

async function readRoutes() {
  const routes = new Map()
  await eachRow(join(GTFS, 'routes.txt'), ',', (r) => {
    routes.set(r.route_id, {
      line: r.route_short_name || r.route_long_name || r.route_id,
      type: Number(r.route_type),
      mode: MODES[Number(r.route_type)] ?? 'ÖPNV',
    })
  })
  log(`routes: ${routes.size}`)
  return routes
}

async function readTrips(active, routes) {
  const trips = new Map()
  let total = 0
  await eachRow(join(GTFS, 'trips.txt'), ',', (r) => {
    total++
    if (!active.has(r.service_id)) return
    const route = routes.get(r.route_id)
    if (!route) return
    trips.set(r.trip_id, {
      line: route.line,
      mode: route.mode,
      type: route.type,
      headsign: r.trip_headsign,
      direction: r.direction_id,
      stops: [],
    })
  })
  log(`trips: ${total} in the feed, ${trips.size} run on ${SERVICE_DATE}`)
  return trips
}

/* ------------------------------------------------------------------
   Step 4 — the 1.9 M stop times, streamed
   ------------------------------------------------------------------ */

async function readStopTimes(trips, stopToStation) {
  let rows = 0
  let kept = 0
  await eachRow(join(GTFS, 'stop_times.txt'), ',', (r) => {
    rows++
    const trip = trips.get(r.trip_id)
    if (!trip) return
    const station = stopToStation.get(r.stop_id)
    if (!station) return // outside Frankfurt; we only route inside the city
    // departure_time_seconds is relative to the operating day and does overflow
    // past 86400, which is exactly what we want for the night lines.
    const dep = Number(r.departure_time_seconds)
    if (!Number.isFinite(dep)) return
    kept++
    trip.stops.push({ station, seq: Number(r.stop_sequence), dep, pickup: r.pickup_type !== '1' })
  })
  log(`stop_times: ${rows} rows, ${kept} at a Frankfurt stop of a trip running today`)
  return { rows, kept }
}

/* ------------------------------------------------------------------
   Step 5 — collapse trips into patterns
   A pattern is one line running one stop sequence. Every trip of a pattern
   then costs two numbers: which pattern, and when it leaves the first stop.
   ------------------------------------------------------------------ */

function buildPatterns(trips) {
  const byKey = new Map()
  let dropped = 0

  for (const trip of trips.values()) {
    if (trip.stops.length < 2) { dropped++; continue }
    trip.stops.sort((a, b) => a.seq - b.seq)

    // A trip can return to the same station (loop lines). Keep the order as is;
    // the station list is the identity of the pattern either way.
    const stations = trip.stops.map((s) => s.station)
    const key = `${trip.line}\u0000${trip.mode}\u0000${trip.direction}\u0000${trip.headsign}\u0000${stations.join('>')}`

    let p = byKey.get(key)
    if (!p) {
      p = {
        line: trip.line,
        mode: trip.mode,
        type: trip.type,
        headsign: trip.headsign,
        stations,
        // one array of observed offsets per stop, reduced to a median later
        offsets: stations.map(() => []),
        starts: [],
      }
      byKey.set(key, p)
    }

    const t0 = trip.stops[0].dep
    p.starts.push(t0)
    for (let i = 0; i < trip.stops.length; i++) p.offsets[i].push(trip.stops[i].dep - t0)
  }

  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
  }

  const patterns = []
  for (const p of byKey.values()) {
    patterns.push({
      line: p.line,
      mode: p.mode,
      headsign: p.headsign,
      stations: p.stations,
      // scheduled seconds from the first stop of the pattern, median over its trips
      offsets: p.offsets.map(median),
      starts: p.starts.sort((a, b) => a - b),
    })
  }
  patterns.sort((a, b) => b.starts.length - a.starts.length)

  const departures = patterns.reduce((n, p) => n + p.starts.length * p.stations.length, 0)
  log(`patterns: ${patterns.length} (${dropped} trips skipped, fewer than two Frankfurt stops), ${departures} departures`)
  return patterns
}

/* ------------------------------------------------------------------
   Step 6 — the three non-GTFS files
   ------------------------------------------------------------------ */

/** tagesgang_avg.csv: 24 rows, requests per hour of an average day. */
async function readDailyProfile() {
  const hours = new Array(24).fill(0)
  await eachRow(join(SOURCE, 'tagesgang_avg.csv'), ';', (r) => {
    const h = Number(r.stunde)
    if (h >= 0 && h < 24) hours[h] = Number(String(r.anfragen_durchschnittstag).replace(',', '.'))
  })
  const total = hours.reduce((a, b) => a + b, 0)
  return { hours, total, peakHour: hours.indexOf(Math.max(...hours)) }
}

/**
 * haltestellen_avg.csv: 3093 stop names with an average monthly request count.
 * 79 rows have no coordinates and the range reaches far outside Frankfurt, so
 * the join is by name and anything that does not match is simply left out.
 */
async function readStopDemand(stations) {
  const byName = new Map()
  for (const s of stations.values()) byName.set(s.name.toLowerCase(), s.id)

  const demand = {}
  let rows = 0
  let matched = 0
  let noCoords = 0

  await eachRow(join(SOURCE, 'haltestellen_avg.csv'), ';', (r) => {
    rows++
    if (r.gps_x === '' || r.gps_y === '') noCoords++
    const raw = String(r.haltestelle ?? '').trim()
    // the file writes "F Hauptwache", the feed "Frankfurt (Main) Hauptwache"
    const name = raw.replace(/^F\s+/i, '').replace(/^Frankfurt \(Main\)\s*/i, '').trim()
    const id = byName.get(name.toLowerCase())
    if (!id) return
    matched++
    demand[id] = Math.round(Number(String(r.anfragen_durchschnittsmonat).replace(',', '.')))
  })

  log(`haltestellen_avg: ${rows} rows (${noCoords} without coordinates), ${matched} matched a Frankfurt station`)
  return { demand, rows, matched, noCoords }
}

/**
 * BeispielAFZ.csv — cp1252, decimal commas, "3,00%" in the Auslastung column.
 * Only CSV rows 2..101 are real measurements (U7, 30.04.2024). Everything after
 * that is simulated, so the two are averaged and reported apart; anything the
 * app shows from the simulated part must be labelled as such.
 */
function readOccupancy() {
  const file = join(SOURCE, 'BeispielAFZ.csv')
  const text = new TextDecoder('windows-1252').decode(readFileSync(file))
  const lines = text.split(/\r?\n/).filter((l) => l !== '')
  const header = splitRow(lines[0], ';')

  // AbZeit and AnZeit each appear twice; position, not name, tells them apart.
  const col = {
    linie: header.indexOf('Linie'),
    hst: header.indexOf('HstName(Fpl)'),
    besetzung: 19,
    auslastung: 20,
    istAb: 14,
  }

  const num = (s) => Number(String(s).replace('%', '').replace(/\./g, '').replace(',', '.'))
  const lines_ = new Map()

  for (let i = 1; i < lines.length; i++) {
    const c = splitRow(lines[i], ';')
    const name = c[col.hst]
    if (name === 'einfahrend' || name === 'ausfahrend') continue // operational marker, not a stop
    const line = c[col.linie]
    const load = num(c[col.auslastung])
    if (!Number.isFinite(load)) continue

    const source = i <= 100 ? 'measured' : 'simulated' // CSV rows 2..101 are the real export
    const hour = Number(String(c[col.istAb]).slice(0, 2))

    let entry = lines_.get(line)
    if (!entry) { entry = { line, source, samples: 0, sum: 0, peak: 0, byHour: {} }; lines_.set(line, entry) }
    entry.samples++
    entry.sum += load
    entry.peak = Math.max(entry.peak, load)
    if (Number.isFinite(hour)) {
      const h = entry.byHour[hour] ?? { n: 0, sum: 0 }
      h.n++; h.sum += load
      entry.byHour[hour] = h
    }
  }

  const out = [...lines_.values()].map((e) => ({
    line: e.line,
    source: e.source,
    stops: e.samples,
    avgLoadPercent: Math.round((e.sum / e.samples) * 10) / 10,
    peakLoadPercent: Math.round(e.peak * 10) / 10,
    byHour: Object.fromEntries(
      Object.entries(e.byHour).map(([h, v]) => [h, Math.round((v.sum / v.n) * 10) / 10]),
    ),
  }))
  out.sort((a, b) => a.line.localeCompare(b.line))

  const measured = out.filter((o) => o.source === 'measured').map((o) => o.line)
  log(`AFZ: ${out.length} lines, measured for ${measured.join(', ') || '—'}, rest simulated`)
  return out
}

/* ------------------------------------------------------------------
   Run
   ------------------------------------------------------------------ */

const t0 = Date.now()
unpack()

const services = await activeServices()
const { stations, stopToStation } = await readStations()
const routes = await readRoutes()
const trips = await readTrips(services.active, routes)
const stopTimes = await readStopTimes(trips, stopToStation)
const patterns = buildPatterns(trips)

// Fill each station's lines, modes and departure count from the patterns.
for (const p of patterns) {
  const seen = new Set()
  for (const sid of p.stations) {
    const s = stations.get(sid)
    if (!s) continue
    s.lines.add(p.line)
    s.modes.add(p.mode)
    if (!seen.has(sid)) { s.departures += p.starts.length; seen.add(sid) }
  }
}

const stationList = [...stations.values()]
  .filter((s) => s.departures > 0) // a station nothing serves today is noise
  .map((s) => {
    const name = [...s.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return {
      id: s.id,
      name: name.replace(/^Frankfurt \(Main\)\s*/, ''),
      fullName: name,
      lat: Math.round((s.lat / s.n) * 1e6) / 1e6,
      lon: Math.round((s.lon / s.n) * 1e6) / 1e6,
      platforms: s.n,
      modes: [...s.modes].sort(),
      lines: [...s.lines].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })),
      departures: s.departures,
    }
  })
  .sort((a, b) => b.departures - a.departures)

const byId = new Map(stationList.map((s) => [s.id, s]))
const daily = await readDailyProfile()
const stopDemand = await readStopDemand(byId)
const occupancy = readOccupancy()

mkdirSync(OUT, { recursive: true })

const write = (name, value) => {
  const file = join(OUT, name)
  writeFileSync(file, JSON.stringify(value))
  log(`  ${name}  ${(statSync(file).size / 1024).toFixed(0)} KB`)
}

log('writing:')
write('stations.json', { serviceDate: SERVICE_DATE, stations: stationList })
write('patterns.json', {
  serviceDate: SERVICE_DATE,
  // Departure at station i of a trip = starts[t] + offsets[i], seconds from the
  // operating day. Overflow past 86400 is the night service and is intended.
  patterns: patterns.filter((p) => p.stations.some((s) => byId.has(s))),
})
write('demand.json', { dailyProfile: daily, stopRequests: stopDemand.demand, occupancy })
write('meta.json', {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-mobility-data.mjs',
  serviceDate: SERVICE_DATE,
  weekday: services.weekday,
  city: { name: 'Frankfurt am Main', dhidPrefix: CITY_PREFIX },
  counts: {
    stations: stationList.length,
    patterns: patterns.length,
    trips: patterns.reduce((n, p) => n + p.starts.length, 0),
    stopTimeRows: stopTimes.rows,
    stopTimeRowsKept: stopTimes.kept,
    servicesActive: services.active.size,
  },
  sources: [
    {
      file: 'Mobilitätsdaten/GTFS_gefiltert_Frankfurt+30km.7z',
      what: 'Fahrplan RMV, Frankfurt + 30 km',
      tier: 'confirmed',
      validFrom: '2025-07-12',
      validTo: '2025-12-13',
      sha256: sha256(join(SOURCE, 'GTFS_gefiltert_Frankfurt+30km.7z')),
    },
    {
      file: 'Mobilitätsdaten/tagesgang_avg.csv',
      what: 'Auskunftsanfragen je Stunde eines Durchschnittstags',
      tier: 'confirmed',
      sha256: sha256(join(SOURCE, 'tagesgang_avg.csv')),
    },
    {
      file: 'Mobilitätsdaten/haltestellen_avg.csv',
      what: 'Auskunftsanfragen je Haltestelle und Durchschnittsmonat',
      tier: 'confirmed',
      note: `${stopDemand.matched} von ${stopDemand.rows} Zeilen einer Frankfurter Station zugeordnet, ${stopDemand.noCoords} ohne Koordinaten`,
      sha256: sha256(join(SOURCE, 'haltestellen_avg.csv')),
    },
    {
      file: 'Mobilitätsdaten/BeispielAFZ.csv',
      what: 'Fahrgastzählung U-Bahn',
      tier: 'mixed',
      note: 'CSV-Zeilen 2–101 sind echte Messwerte (U7, 30.04.2024), 102–1043 sind synthetisch.',
      sha256: sha256(join(SOURCE, 'BeispielAFZ.csv')),
    },
  ],
  assumptions: [
    `Ein Betriebstag (${SERVICE_DATE}, ${services.weekday}) steht für den Fahrplan. Feiertage und Schulferien werden nicht unterschieden.`,
    'Fahrzeiten je Muster sind der Median über alle Fahrten des Musters, nicht die Zeit der einzelnen Fahrt.',
    'Stationen entstehen aus dem DHID-Präfix de:06412:<n>, weil parent_station im Export unvollständig ist.',
    'Halte außerhalb Frankfurts sind entfernt; geroutet wird nur innerhalb der Stadt.',
  ],
  notUsed: ['shapes.txt', 'agency.txt', 'BeispielDataSetEFA.csv', 'e-scooter-beispiel.csv'],
})

log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
