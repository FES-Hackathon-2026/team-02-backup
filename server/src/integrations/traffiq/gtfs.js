/**
 * The Frankfurt timetable, in memory.
 *
 * Reads the JSON that `scripts/build-mobility-data.mjs` produced from the
 * delivered RMV GTFS export. No CSV is parsed at boot and nothing is fetched;
 * if the files are missing the module reports that instead of throwing, so a
 * checkout that never ran the build script still starts.
 *
 * Shape of the data, because the compactness is not obvious:
 *
 *   a *pattern* is one line running one exact stop sequence
 *     { line, mode, headsign, stations[], offsets[], starts[] }
 *
 *   offsets[i]  scheduled seconds from the pattern's first stop to station i,
 *               the median over every trip of the pattern
 *   starts[t]   when trip t leaves the first stop, seconds into the operating
 *               day, sorted; values past 86400 are the night service
 *
 *   departure of trip t at station i  =  starts[t] + offsets[i]
 *
 * That is 671 patterns and 245 828 real scheduled departures in 320 KB.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, distanceKm } from '../../db.js'
import { ACCESS_WALK_KM, ASSUMPTIONS, TRANSFER_SECONDS } from './factors.js'

const DIR = join(ROOT, 'data', 'mobility')

function read(name) {
  const file = join(DIR, name)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

const stationFile = read('stations.json')
const patternFile = read('patterns.json')
const demandFile = read('demand.json')
const metaFile = read('meta.json')

export const available = stationFile !== null && patternFile !== null

/** What the API tells the client when the build script has not been run. */
export const missing = {
  error: 'mobility_data_missing',
  message: 'Die Fahrplandaten fehlen. Einmal `node scripts/build-mobility-data.mjs` ausführen.',
}

export const meta = metaFile ?? null
export const demand = demandFile ?? null

const stations = stationFile?.stations ?? []
const patterns = patternFile?.patterns ?? []

const byId = new Map(stations.map((s) => [s.id, s]))

/**
 * station id -> [{ p: pattern index, i: stop index within the pattern }]
 * A station can appear twice in one pattern on a loop line, hence a list.
 */
const serving = new Map()
patterns.forEach((p, pi) => {
  p.stations.forEach((sid, i) => {
    let list = serving.get(sid)
    if (!list) { list = []; serving.set(sid, list) }
    list.push({ p: pi, i })
  })
})

export const stats = {
  stations: stations.length,
  patterns: patterns.length,
  trips: patterns.reduce((n, p) => n + p.starts.length, 0),
  serviceDate: stationFile?.serviceDate ?? null,
}

/* ------------------------------------------------------------------
   Time
   ------------------------------------------------------------------ */

/** Seconds into the operating day, Europe/Berlin, for a Date. */
export function secondsOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return get('hour') * 3600 + get('minute') * 60 + get('second')
}

/** 90000 -> "01:00" — the night service wraps past midnight rather than overflowing. */
export function clock(seconds) {
  const s = ((Math.round(seconds) % 86400) + 86400) % 86400
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ------------------------------------------------------------------
   Stations
   ------------------------------------------------------------------ */

export const station = (id) => byId.get(id) ?? null

const walkSeconds = (kmDirect) =>
  Math.round(((kmDirect * ASSUMPTIONS.detourFactor) / ASSUMPTIONS.walkKmh) * 3600)

/**
 * Where a journey can start or end.
 *
 * Not simply the closest stations: in Höchst the seven nearest stops are bus
 * stops and the Bahnhof — 1965 departures a day, every S-Bahn to the city —
 * is the eighth. Taking distance alone would route someone onto a local bus
 * past the station they wanted. So the nearest few are joined by the best
 * served few inside the same walking radius.
 */
function accessPoints({ lat, lon, radiusKm = ACCESS_WALK_KM }) {
  const inRange = nearest({ lat, lon, radiusKm, limit: 40 })
  const picked = inRange.slice(0, 6)
  const seen = new Set(picked.map((s) => s.id))

  const hubs = [...inRange].sort((a, b) => b.departures - a.departures)
  for (const hub of hubs) {
    if (picked.length >= 8) break
    if (seen.has(hub.id)) continue
    picked.push(hub)
    seen.add(hub.id)
  }
  return picked
}

/** Nearest stations to a point, closest first. */
export function nearest({ lat, lon, radiusKm = ACCESS_WALK_KM, limit = 8 }) {
  const out = []
  for (const s of stations) {
    const d = distanceKm({ lat, lon }, s)
    if (d <= radiusKm) out.push({ ...s, distanceKm: Math.round(d * 100) / 100, walkSeconds: walkSeconds(d) })
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm)
  return out.slice(0, limit)
}

/* ------------------------------------------------------------------
   Departures
   ------------------------------------------------------------------ */

/** Index of the first element of a sorted array that is >= value. */
function lowerBound(arr, value) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The next departures at a station from a point in the operating day.
 * Straight out of the schedule — nothing here is estimated.
 */
export function departures({ stopId, from = secondsOfDay(), limit = 12, withinSeconds = 7200 }) {
  const list = serving.get(stopId)
  if (!list) return []

  const out = []
  for (const { p: pi, i } of list) {
    const pattern = patterns[pi]
    if (i === pattern.stations.length - 1) continue // terminus: you cannot board onwards
    const offset = pattern.offsets[i]
    // departure = start + offset, so the first usable trip starts at from - offset
    let t = lowerBound(pattern.starts, from - offset)
    for (let n = 0; n < 4 && t < pattern.starts.length; n++, t++) {
      const at = pattern.starts[t] + offset
      if (at - from > withinSeconds) break
      out.push({
        line: pattern.line,
        mode: pattern.mode,
        headsign: pattern.headsign.replace(/^Frankfurt \(Main\)\s*/, ''),
        at,
        time: clock(at),
        inSeconds: at - from,
        pattern: pi,
      })
    }
  }

  out.sort((a, b) => a.at - b.at)
  return out.slice(0, limit)
}

/* ------------------------------------------------------------------
   Routing — direct first, then one change
   Not a full RAPTOR. It searches the patterns that actually touch the two
   ends of the journey, which inside one city is nearly always enough and
   costs a few milliseconds instead of a graph build.
   ------------------------------------------------------------------ */

/** Earliest boarding on pattern pi at stop index i, not before `ready`. */
function board(pi, i, ready) {
  const p = patterns[pi]
  const offset = p.offsets[i]
  const t = lowerBound(p.starts, ready - offset)
  if (t >= p.starts.length) return null
  return { trip: t, depart: p.starts[t] + offset }
}

/**
 * Best transit itinerary between two points.
 *
 * @returns {{legs: object[], departAt, arriveAt, rideSeconds, waitSeconds,
 *            walkSeconds, changes, rideKm} | null}
 */
export function plan({ from, to, at = secondsOfDay() }) {
  if (!available) return null

  const origins = accessPoints(from)
  const targets = accessPoints(to)
  if (origins.length === 0 || targets.length === 0) return null

  const targetById = new Map(targets.map((t) => [t.id, t]))
  let best = null

  const consider = (candidate) => {
    if (candidate === null) return
    if (best === null || candidate.arriveAt < best.arriveAt) best = candidate
  }

  const leg = (pi, i, j, boarding) => {
    const p = patterns[pi]
    const a = byId.get(p.stations[i])
    const b = byId.get(p.stations[j])
    return {
      kind: 'ride',
      line: p.line,
      mode: p.mode,
      headsign: p.headsign.replace(/^Frankfurt \(Main\)\s*/, ''),
      from: a.name,
      fromId: a.id,
      to: b.name,
      toId: b.id,
      stops: j - i,
      departAt: boarding.depart,
      arriveAt: boarding.depart + (p.offsets[j] - p.offsets[i]),
      departTime: clock(boarding.depart),
      arriveTime: clock(boarding.depart + (p.offsets[j] - p.offsets[i])),
      km: Math.round(distanceKm(a, b) * ASSUMPTIONS.detourFactor * 100) / 100,
    }
  }

  const finish = (rides, origin, lastStationId) => {
    const target = targetById.get(lastStationId)
    if (!target) return null
    const arriveAt = rides[rides.length - 1].arriveAt + target.walkSeconds
    const legs = [
      { kind: 'walk', to: origin.name, seconds: origin.walkSeconds, km: origin.distanceKm },
      ...rides,
      { kind: 'walk', from: target.name, seconds: target.walkSeconds, km: target.distanceKm },
    ]
    const rideSeconds = rides.reduce((n, r) => n + (r.arriveAt - r.departAt), 0)
    const walk = origin.walkSeconds + target.walkSeconds
    return {
      legs,
      departAt: at,
      arriveAt,
      rideSeconds,
      walkSeconds: walk,
      waitSeconds: Math.max(0, arriveAt - at - rideSeconds - walk),
      changes: rides.length - 1,
      rideKm: rides.reduce((n, r) => n + r.km, 0),
      accessKm: origin.distanceKm + target.distanceKm,
    }
  }

  /* --- direct --- */
  for (const origin of origins) {
    const ready = at + origin.walkSeconds
    for (const { p: pi, i } of serving.get(origin.id) ?? []) {
      const p = patterns[pi]
      for (let j = i + 1; j < p.stations.length; j++) {
        if (!targetById.has(p.stations[j])) continue
        const boarding = board(pi, i, ready)
        if (boarding === null) break
        consider(finish([leg(pi, i, j, boarding)], origin, p.stations[j]))
        break // offsets grow along a pattern, so the first target hit arrives earliest
      }
    }
  }

  /* --- one change ---
     Run even when a direct connection exists: a slow bus straight there can
     easily lose to a U-Bahn with one change, and the search is cheap.
     Built backwards so the search stays small: first collect, for every
     station in the city, the last legs that end at one of the target
     stations. Then a single pass over the first leg's stops finds a change
     by lookup instead of by a fourth nested loop. */
  const finalLeg = new Map()
  for (const target of targets) {
    for (const { p: qi, i: l } of serving.get(target.id) ?? []) {
      const q = patterns[qi]
      for (let k = 0; k < l; k++) {
        const sid = q.stations[k]
        let list = finalLeg.get(sid)
        if (!list) { list = []; finalLeg.set(sid, list) }
        list.push({ qi, k, l, target, ride: q.offsets[l] - q.offsets[k] })
      }
    }
  }
  // Several lines usually leave an interchange towards the same destination.
  // Keeping only the shortest ride would ignore the one that leaves sooner —
  // which is how a change turns into a quarter of an hour on the platform —
  // so a handful of candidates per station survive and the wait decides.
  const CANDIDATES_PER_INTERCHANGE = 6
  for (const [sid, list] of finalLeg) {
    list.sort((a, b) => a.ride - b.ride)
    const seen = new Set()
    const keep = []
    for (const c of list) {
      if (seen.has(c.qi)) continue
      seen.add(c.qi)
      keep.push(c)
      if (keep.length === CANDIDATES_PER_INTERCHANGE) break
    }
    finalLeg.set(sid, keep)
  }

  for (const origin of origins) {
    const ready = at + origin.walkSeconds
    for (const { p: pi, i } of serving.get(origin.id) ?? []) {
      const first = patterns[pi]
      const boarding = board(pi, i, ready)
      if (boarding === null) continue

      for (let x = i + 1; x < first.stations.length; x++) {
        const changes = finalLeg.get(first.stations[x])
        if (changes === undefined) continue
        const legOne = leg(pi, i, x, boarding)
        const readyAgain = legOne.arriveAt + TRANSFER_SECONDS
        for (const change of changes) {
          if (change.qi === pi) continue
          const boardTwo = board(change.qi, change.k, readyAgain)
          if (boardTwo === null) continue
          consider(
            finish([legOne, leg(change.qi, change.k, change.l, boardTwo)], origin, change.target.id),
          )
        }
      }
    }
  }

  return best
}

/** Lines and average occupancy from the AFZ export, for one line. */
export function occupancy(line) {
  return demand?.occupancy?.find((o) => o.line === line) ?? null
}
