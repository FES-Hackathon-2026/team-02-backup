import { all, id, now, one, run, tx } from '../db.js'
import { addDays, formatDe, weekday, localTimestamp } from '../integrations/fes/dates.js'
import { requireUser } from '../session.js'
import { category } from '../integrations/fes/pickup.js'

export function period(date) {
  const start = addDays(date, -((weekday(date) + 6) % 7))
  return { periodStart: start, periodEnd: addDays(start, 4), periodLabel: `${formatDe(start)} – ${formatDe(addDays(start, 4))}`, closesLocal: `${addDays(start, -1)}T23:59:59` }
}
export function tourCapacity(districtId, date, extra, excluding = '') {
  const tour = one('SELECT * FROM pickup_tours WHERE district_id=? AND collection_date=?', districtId, date)
  if (!tour) return true
  if (tour.status !== 'collecting') return false
  const used = one(`SELECT COALESCE(SUM(p.volume_m3),0) AS n FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id
    WHERE s.tour_id=? AND p.status='booked' AND p.id<>?`, tour.id, excluding).n
  const count = one("SELECT COUNT(*) AS n FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id WHERE s.tour_id=? AND p.status='booked' AND p.id<>?", tour.id, excluding).n
  return used + extra <= tour.capacity_m3 && count < 21
}
export function attachTour(p) {
  const window = period(p.slot_date)
  run(`INSERT OR IGNORE INTO pickup_tours(id,district_id,collection_date,period_start,period_end,closes_local,created_at)
    VALUES (?,?,?,?,?,?,?)`, id('tour'), p.district_id, p.slot_date, window.periodStart, window.periodEnd, window.closesLocal, now())
  const tour = one('SELECT id FROM pickup_tours WHERE district_id=? AND collection_date=?', p.district_id, p.slot_date)
  run('INSERT INTO pickup_tour_stops(pickup_id,tour_id) VALUES (?,?) ON CONFLICT(pickup_id) DO UPDATE SET tour_id=excluded.tour_id,position=NULL,eta_start=NULL,eta_end=NULL,status=\'pending\'', p.id, tour.id)
}
export function tourFor(p) {
  const row = one(`SELECT t.*,s.position,s.eta_start,s.eta_end FROM pickup_tour_stops s JOIN pickup_tours t ON t.id=s.tour_id WHERE s.pickup_id=?`, p.id)
  if (!row) return null
  const stats = one(`SELECT COUNT(*) AS stops,COALESCE(SUM(p.volume_m3),0) AS volume FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id WHERE s.tour_id=? AND p.status<>'cancelled'`, row.id)
  const district = one('SELECT name,lat,lon FROM districts WHERE id=?', row.district_id)
  return { id: row.id, status: row.status, ...period(row.collection_date), area: district.name,
    centre: { lat: district.lat, lon: district.lon }, stops: stats.stops, utilization: Math.round(stats.volume / row.capacity_m3 * 100),
    eta: row.eta_start ? `${row.eta_start}–${row.eta_end}` : null, source: 'simulated',
    note: 'Gebiet und Ankunft sind modelliert. Keine Live-Ortung; andere Abholadressen bleiben privat.' }
}
function event(p, kind, message, key) {
  run(`INSERT OR IGNORE INTO pickup_notifications(id,user_id,pickup_id,event_key,kind,message,due_local,created_at)
    VALUES (?,?,?,?,?,?,?,?)`, id('notice'), p.user_id, p.id, `${p.id}:tour:${key}`, kind, message, localTimestamp(), now())
}
export function planTour(tour) {
  // Addresses have no verified coordinates. Use a reproducible order and label
  // these service windows as model estimates, never optimized driving ETAs.
  const stops = all(`SELECT p.* FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id
    WHERE s.tour_id=? AND p.status='booked' ORDER BY p.address COLLATE NOCASE,p.id`, tour.id)
  const clock = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  for (const [i, p] of stops.entries()) {
    const start = 8 * 60 + i * 20
    run('UPDATE pickup_tour_stops SET position=?,eta_start=?,eta_end=? WHERE pickup_id=?', i + 1, clock(start), clock(start + 20), p.id)
    event(p, 'tour_planned', `Deine gemeinsame Tour ist geplant: ${formatDe(p.slot_date)} · ${clock(start)}–${clock(start + 20)} Uhr (Simulation, keine Live-ETA).`, `${tour.id}:planned`)
  }
  run("UPDATE pickup_tours SET status='planned' WHERE id=?", tour.id)
}
export function syncTours(localNow) {
  tx(() => { for (const tour of all("SELECT * FROM pickup_tours WHERE status='collecting' AND closes_local<?", localNow)) planTour(tour) })()
}
export function decorateSlots(result, volume = 1) {
  return { ...result, slots: result.slots.map(s => ({ ...s, ...period(s.date),
    available: s.available && tourCapacity(result.districtId, s.date, Number(volume)),
    reason: s.reason || (!tourCapacity(result.districtId, s.date, Number(volume)) ? 'Gemeinsame Tour voll oder bereits geplant.' : undefined),
  })) }
}
export default async function tourRoutes(app) {
  const staff = (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return null
    if (user.role !== 'driver') { reply.code(403).send({ error: 'driver_only', message: 'Diese Ansicht ist nur für freigeschaltete Fahrer:innen.' }); return null }
    return user
  }
  app.get('/api/fes/driver/tours', async (req, reply) => {
    if (!staff(req, reply)) return
    const tours = all("SELECT t.*,d.name AS area FROM pickup_tours t JOIN districts d ON d.id=t.district_id WHERE t.status<>'completed' ORDER BY t.collection_date")
    return { tours: tours.map(t => ({ id: t.id, date: t.collection_date, area: t.area, status: t.status, ...period(t.collection_date), source: 'simulated',
      stops: all(`SELECT p.*,s.position,s.eta_start,s.eta_end,c.full_name,c.phone,c.placement FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id LEFT JOIN pickup_contacts c ON c.pickup_id=p.id
        WHERE s.tour_id=? AND p.status<>'cancelled' ORDER BY s.position,p.address`, t.id).map(p => ({ id: p.id, address: p.address, name: p.full_name, phone: p.phone, placement: p.placement, status: p.status,
          eta: p.eta_start ? `${p.eta_start}–${p.eta_end}` : null, volumeM3: p.volume_m3, kind: 'booked',
          items: all('SELECT category,volume_m3 AS volumeM3 FROM pickup_items WHERE pickup_id=?', p.id).map(i => ({ ...i, category: category(i.category)?.name ?? i.category })) })) })) }
  })
  app.post('/api/fes/driver/tours/:id/plan', async (req, reply) => {
    if (!staff(req, reply)) return
    return tx(() => {
      const tour = one('SELECT * FROM pickup_tours WHERE id=?', req.params.id)
      if (!tour) return reply.code(404).send({ error: 'unknown', message: 'Tour nicht gefunden.' })
      if (tour.status === 'collecting') planTour(tour)
      return { ok: true }
    })()
  })
  app.post('/api/fes/driver/stops/:id/collect', async (req, reply) => {
    if (!staff(req, reply)) return
    return tx(() => {
      const p = one('SELECT * FROM pickups WHERE id=?', req.params.id)
      const stop = one('SELECT s.*,t.status AS tour_status FROM pickup_tour_stops s JOIN pickup_tours t ON t.id=s.tour_id WHERE s.pickup_id=?', req.params.id)
      if (!p || !stop) return reply.code(404).send({ error: 'unknown', message: 'Stopp nicht gefunden.' })
      if (p.status === 'collected') return { ok: true }
      if (p.status !== 'booked' || stop.tour_status !== 'planned') return reply.code(409).send({ error: 'inactive', message: 'Die Tour muss geplant und der Stopp aktiv sein.' })
      run("UPDATE pickups SET status='collected' WHERE id=?", p.id)
      run("UPDATE pickup_tour_stops SET status='collected' WHERE pickup_id=?", p.id)
      run("DELETE FROM pickup_notifications WHERE pickup_id=? AND kind='reminder' AND due_local>?", p.id, localTimestamp())
      event(p, 'collected', 'Fahrer:in hat die Abholung im Demo-System als erledigt markiert. Keine FES-Bestätigung.', 'collected')
      if (!one("SELECT p.id FROM pickup_tour_stops s JOIN pickups p ON p.id=s.pickup_id WHERE s.tour_id=? AND p.status='booked'", stop.tour_id)) run("UPDATE pickup_tours SET status='completed' WHERE id=?", stop.tour_id)
      return { ok: true }
    })()
  })
}
