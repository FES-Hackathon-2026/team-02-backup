/**
 * Phase 8 — Mobilität aus echten GTFS-Daten.
 *
 *   GET /api/mobility/stops?lat=&lon=&r=&limit=
 *       Haltestellen im Umkreis, mit Linien, Verkehrsmitteln und Fußweg.
 *
 *   GET /api/mobility/departures?stopId=&at=HH:MM&limit=
 *       Nächste Abfahrten laut Fahrplan. Keine Echtzeit, keine Verspätungen.
 *
 *   GET /api/mobility/routes?fromLat=&fromLon=&toLat=&toLon=&at=HH:MM
 *   GET /api/mobility/routes?questId=&fromLat=&fromLon=
 *       Vier Optionen mit Zeit, CO₂-Differenz und Punktwirkung. Das Auto
 *       steht mit 0 XP und der Begründung dabei.
 *
 *   GET /api/mobility/meta
 *       Herkunft der Daten: Quelldateien, Prüfsummen, Zeilenzahlen, Annahmen.
 *
 * Die Daten liegen als JSON in server/data/mobility/ und entstehen aus
 * `node scripts/build-mobility-data.mjs`. Fehlen sie, antworten die Endpunkte
 * mit 503 und sagen, welcher Befehl fehlt — der Server startet trotzdem.
 *
 * Dieser Router vergibt keine Punkte. Er sagt nur voraus, was der Weg mit der
 * Gutschrift macht; entstehen können XP ausschließlich in engine/award.js.
 */

import { one } from '../db.js'
import { compare } from '../integrations/traffiq/compare.js'
import * as gtfs from '../integrations/traffiq/gtfs.js'

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** "14:05" or "14:05:30" or plain seconds -> seconds into the operating day. */
function parseAt(value) {
  if (value === undefined || value === '') return gtfs.secondsOfDay()
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value))
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)
  return num(value, gtfs.secondsOfDay())
}

export default async function mobilityRoutes(app) {
  /** One guard for all of them: without the built data there is nothing honest to say. */
  const guard = (reply) => {
    if (gtfs.available) return false
    reply.code(503).send(gtfs.missing)
    return true
  }

  app.get('/api/mobility/stops', async (request, reply) => {
    if (guard(reply)) return
    const { lat, lon, r, limit } = request.query ?? {}
    const la = num(lat, undefined)
    const lo = num(lon, undefined)
    if (la === undefined || lo === undefined) {
      return reply.code(400).send({ error: 'position_required', message: 'lat und lon fehlen.' })
    }

    const stops = gtfs.nearest({
      lat: la,
      lon: lo,
      radiusKm: Math.min(num(r, 1), 10),
      limit: Math.min(num(limit, 8), 40),
    })

    return {
      stops: stops.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        modes: s.modes,
        lines: s.lines,
        distanceKm: s.distanceKm,
        walkMinutes: Math.max(1, Math.round(s.walkSeconds / 60)),
        departuresPerDay: s.departures,
      })),
      serviceDate: gtfs.stats.serviceDate,
      tier: 'confirmed',
    }
  })

  app.get('/api/mobility/departures', async (request, reply) => {
    if (guard(reply)) return
    const { stopId, at, limit } = request.query ?? {}
    const station = gtfs.station(stopId)
    if (!station) {
      return reply.code(404).send({ error: 'unknown_stop', message: 'Diese Haltestelle kennen wir nicht.' })
    }

    const from = parseAt(at)
    return {
      stop: { id: station.id, name: station.name, modes: station.modes, lat: station.lat, lon: station.lon },
      at: from,
      atTime: gtfs.clock(from),
      departures: gtfs.departures({ stopId: station.id, from, limit: Math.min(num(limit, 12), 40) }).map((d) => ({
        line: d.line,
        mode: d.mode,
        headsign: d.headsign,
        time: d.time,
        inMinutes: Math.max(0, Math.round(d.inSeconds / 60)),
      })),
      // The occupancy the AFZ export measured for this line, when it has one.
      serviceDate: gtfs.stats.serviceDate,
      note: 'Fahrplanzeiten, kein Echtzeitbetrieb.',
      tier: 'confirmed',
    }
  })

  app.get('/api/mobility/routes', async (request, reply) => {
    if (guard(reply)) return
    const q = request.query ?? {}

    const from = { lat: num(q.fromLat, undefined), lon: num(q.fromLon, undefined) }
    let to = { lat: num(q.toLat, undefined), lon: num(q.toLon, undefined) }
    let target = null

    // A quest is the usual destination, so the screen may name it instead of
    // repeating its coordinates.
    let baseXp = num(q.baseXp, null)
    if (q.questId) {
      const quest = one('SELECT id, title, lat, lon, xp FROM quests WHERE id = ?', q.questId)
      if (!quest) {
        return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
      }
      to = { lat: quest.lat, lon: quest.lon }
      target = { kind: 'quest', id: quest.id, title: quest.title, xp: quest.xp }
      baseXp = quest.xp
    }

    if (from.lat === undefined || from.lon === undefined) {
      return reply.code(400).send({ error: 'position_required', message: 'fromLat und fromLon fehlen.' })
    }
    if (to.lat === undefined || to.lon === undefined) {
      return reply.code(400).send({ error: 'destination_required', message: 'Ziel fehlt: toLat/toLon oder questId.' })
    }

    const result = compare({ from, to, at: parseAt(q.at), baseXp })
    return { ...result, target }
  })

  /** Where every number on this screen comes from. */
  app.get('/api/mobility/meta', async (request, reply) => {
    if (guard(reply)) return
    return { ...gtfs.meta, loaded: gtfs.stats, dailyProfile: gtfs.demand?.dailyProfile ?? null }
  })
}
