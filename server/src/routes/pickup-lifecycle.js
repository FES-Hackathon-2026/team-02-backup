import { all, id, now, one, run, tx } from '../db.js'
import { addDays, formatDe, today, localTimestamp } from '../integrations/fes/dates.js'
import * as provider from '../integrations/fes/pickup.js'
import { requireUser } from '../session.js'
import tourRoutes, { attachTour, decorateSlots, tourCapacity, tourFor } from './pickup-tours.js'

export const localTime = localTimestamp
export const addressKey = value => typeof value === 'string' ? value.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ') : ''
export const activePhotoBooking = (userId, photoId) => Array.isArray(photoId) ? photoId.map(p => activePhotoBooking(userId, p)).find(Boolean) : photoId && one(
  `SELECT p.* FROM pickups p JOIN pickup_items i ON i.pickup_id=p.id
   WHERE p.user_id=? AND i.photo_id=? AND p.status='booked' AND p.slot_date>=?`, userId, photoId, today())

export function checkItem(body, userId) {
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 3) return 'Bitte ein bis drei Gegenstände angeben.'
    for (const item of body.items) {
      if (!item || typeof item !== 'object' || item.items !== undefined) return 'Ungültiger Gegenstand.'
      const error = checkItem(item, userId)
      if (error) return error
    }
    const photos = body.items.map(i => i.photoId).filter(Boolean)
    if (new Set(photos).size !== photos.length) return 'Ein Foto darf nur einmal in der Liste stehen.'
    const total = body.items.reduce((sum, i) => sum + Number(i.volumeM3), 0)
    if (Math.abs(total - Number(body.volumeM3)) > 0.0001 || total > provider.MAX_VOLUME_M3) return 'Die gesamte Liste darf höchstens 6 m³ umfassen.'
  }
  const category = provider.category(body.category)
  if (!category?.collectable) return category?.alternative?.why ?? 'Diese Kategorie kann nicht abgeholt werden.'
  const volume = Number(body.volumeM3)
  if (!Number.isFinite(volume) || volume <= 0 || volume > provider.MAX_VOLUME_M3) return 'Bitte ein Volumen zwischen 0 und 6 m³ angeben (größer als 0).'
  if (body.photoId && (typeof body.photoId !== 'string' || !one('SELECT id FROM photos WHERE id=? AND user_id=?', body.photoId, userId))) return 'Dieses Foto gehört nicht zu deiner Sitzung.'
  return null
}
export function snapshotRegistration(p) {
  run('INSERT OR IGNORE INTO pickup_registration_snapshots VALUES (?,?,?,?,?)', p.id, p.category, p.volume_m3, p.slot_date, p.reference)
}
export function ensureItems(p) {
  snapshotRegistration(p)
  if (!one('SELECT id FROM pickup_items WHERE pickup_id=?', p.id)) {
    run('INSERT INTO pickup_items VALUES (?, ?, NULL, ?, ?, ?)', id('item'), p.id, p.category, p.volume_m3, p.created_at)
  }
}
export function attachItem(pickupId, body) {
  for (const item of body.items ?? [body]) run('INSERT INTO pickup_items VALUES (?, ?, ?, ?, ?, ?)', id('item'), pickupId, item.photoId || null, provider.category(item.category).id, Number(item.volumeM3), now())
}
export function notify(p, kind, message, key = id('event'), due = localTime()) {
  run(`INSERT OR IGNORE INTO pickup_notifications
    (id,user_id,pickup_id,event_key,kind,message,due_local,created_at) VALUES (?,?,?,?,?,?,?,?)`,
  id('notice'), p.user_id, p.id, `${p.id}:${kind}:${key}`, kind, message, due, now())
}
export function scheduleReminders(p) {
  // Remove undelivered reminders only. Already-visible events remain history.
  run("DELETE FROM pickup_notifications WHERE pickup_id=? AND kind='reminder' AND due_local>?", p.id, localTime())
  const pref = one('SELECT * FROM pickup_preferences WHERE pickup_id=?', p.id)
  if (!pref?.reminders || p.status !== 'booked') return
  for (const [suffix, due, text] of [
    ['evening', `${addDays(p.slot_date, -1)}T18:00:00`, 'Morgen ist dein eingetragener Abholtermin. Bitte Vorbereitungshinweise prüfen.'],
    ['morning', `${p.slot_date}T06:00:00`, 'Heute: eingetragene Abholung, 06:00–15:00 Uhr.'],
  ]) {
    if (due > localTime()) notify(p, 'reminder', `${text} Nur in ReMain, nicht von FES bestätigt.`, `${pref.revision}:${suffix}`, due)
  }
}
export const pickupShape = p => {
  const tour = tourFor(p)
  return ({
  id: p.id, address: p.address, districtId: p.district_id, category: p.category,
  categoryName: provider.category(p.category)?.name ?? p.category, volumeM3: p.volume_m3,
  date: p.slot_date, label: tour?.status === 'collecting' ? tour.periodLabel : formatDe(p.slot_date), reference: p.reference,
  window: tour ? tour.eta ? `${tour.eta} Uhr · simuliert` : 'Ankunftsfenster folgt nach Tourplanung' : '06:00–15:00 Uhr',
  status: p.status, source: p.source, createdAt: p.created_at,
})
}
export function detail(p) {
  const items = all('SELECT * FROM pickup_items WHERE pickup_id=? ORDER BY created_at,id', p.id)
  return {
    pickup: pickupShape(p),
    items: (items.length ? items : [{ id: 'legacy', category: p.category, volume_m3: p.volume_m3, photo_id: null }]).map(i => ({
      id: i.id, category: i.category, categoryName: provider.category(i.category)?.name ?? i.category,
      volumeM3: i.volume_m3, photoId: i.photo_id,
    })),
    window: '06:00–15:00 Uhr',
    instructions: ['Im Demo-Ablauf: am Vorabend ab 18:00 Uhr bereitstellen.', provider.category(p.category)?.note ?? 'Gehwege freihalten.', 'Für eine echte Abholung ist eine bestätigte Anmeldung bei FES erforderlich.'],
    reminders: !!one('SELECT reminders FROM pickup_preferences WHERE pickup_id=?', p.id)?.reminders,
    actionId: one("SELECT id FROM actions WHERE ref_table='pickups' AND ref_id=? AND user_id=? ORDER BY id LIMIT 1", p.id, p.user_id)?.id ?? null,
    tour: tourFor(p),
    contact: one('SELECT full_name AS fullName,email,phone,postcode,placement FROM pickup_contacts WHERE pickup_id=?', p.id) ?? null,
    note: 'In ReMain eingetragen, nicht bei FES gebucht. Termine und Kapazität sind simuliert.',
  }
}
const compatible = (p, body) => p.source === 'simulated' && p.status === 'booked' && p.slot_date > today()
  && p.district_id === body.districtId && addressKey(p.address) === addressKey(body.address)
  && !!provider.category(body.category)?.collectable
  && tourCapacity(p.district_id, p.slot_date, p.volume_m3 + Number(body.volumeM3), p.id)
  && (body.items ?? [body]).every(item => {
    const cat = provider.category(item.category)
    const added = (body.items ?? [body]).filter(i => provider.category(i.category)?.id === cat?.id).length
    const count = Number(one('SELECT COUNT(*) AS n FROM pickup_items WHERE pickup_id=? AND category=?', p.id, cat?.id).n || (p.category === cat?.id ? 1 : 0))
    return !cat?.maxPieces || count + added <= cat.maxPieces
  })
  && provider.book({ address: p.address, districtId: p.district_id, categoryId: p.category,
    volumeM3: p.volume_m3 + Number(body.volumeM3), slotDate: p.slot_date }).ok

export default async function lifecycleRoutes(app) {
  await app.register(tourRoutes)
  app.get('/api/fes/requests/:key', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const record = one('SELECT pickup_id FROM pickup_requests WHERE user_id=? AND request_key=?', user.id, req.params.key)
    if (!record) return reply.code(404).send({ error: 'unknown_request', message: 'Diese Anfrage wurde noch nicht gespeichert.' })
    return { pickup: pickupShape(one('SELECT * FROM pickups WHERE id=?', record.pickup_id)) }
  })
  app.get('/api/fes/opportunity', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const offered = decorateSlots(provider.slots(user.district_id, 1))
    return { slot: offered.slots.find(s => s.available) ?? null, district: one('SELECT name FROM districts WHERE id=?', user.district_id)?.name }
  })
  app.post('/api/fes/resolve', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const body = req.body ?? {}
    const error = checkItem(body, user.id)
    if (error) return reply.code(400).send({ error: 'invalid_item', message: error })
    const existing = activePhotoBooking(user.id, body.items?.map(i => i.photoId) ?? body.photoId)
    if (existing && body.items?.some(i => !i.photoId || activePhotoBooking(user.id, i.photoId)?.id !== existing.id)) return reply.code(409).send({ error: 'partial_booking', message: 'Ein Teil der Liste ist bereits eingetragen. Bitte diese Gegenstände aus der neuen Liste entfernen.' })
    if (existing) return { state: 'already_booked', pickup: pickupShape(existing), source: provider.SOURCE }
    const districtId = body.districtId || user.district_id
    if (!one('SELECT id FROM districts WHERE id=?', districtId)) return reply.code(400).send({ error: 'unknown_district', message: 'Bitte einen gültigen Stadtteil wählen.' })
    if (addressKey(body.address).length < 5) {
      const candidates = all("SELECT * FROM pickups WHERE user_id=? AND status='booked' AND slot_date>? ORDER BY slot_date", user.id, today())
        .filter(p => compatible(p, { ...body, address: p.address, districtId: p.district_id })).slice(0, 3)
      return { state: 'needs_address', candidates: candidates.map(pickupShape), slots: decorateSlots(provider.slots(districtId, body.volumeM3), body.volumeM3).slots, source: provider.SOURCE }
    }
    const mine = all("SELECT * FROM pickups WHERE user_id=? AND status='booked' AND slot_date>? ORDER BY slot_date", user.id, today())
    const match = mine.find(p => compatible(p, { ...body, districtId }))
    if (match) return { state: 'existing_booking', pickup: pickupShape(match), source: provider.SOURCE }
    const offered = decorateSlots(provider.slots(districtId, body.volumeM3), body.volumeM3)
    return { state: offered.slots.some(s => s.available) ? 'available_slots' : 'no_availability', ...offered }
  })

  app.get('/api/fes/pickups/:id', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
    if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
    return detail(p)
  })

  app.post('/api/fes/pickups/:id/items', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    return tx(() => {
      const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
      if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
      const body = req.body ?? {}
      const error = checkItem(body, user.id)
      if (error) return reply.code(400).send({ error: 'invalid_item', message: error })
      if (!body.photoId && (typeof body.requestKey !== 'string' || body.requestKey.length > 100 || !body.requestKey)) return reply.code(400).send({ error: 'invalid_key', message: 'Bitte erneut versuchen.' })
      const payload = JSON.stringify(['add', p.id, body.category, body.volumeM3, body.address, body.districtId, body.photoId, body.items])
      const prior = body.requestKey && one('SELECT * FROM pickup_requests WHERE user_id=? AND request_key=?', user.id, body.requestKey)
      if (prior) return prior.payload === payload ? detail(p) : reply.code(409).send({ error: 'request_changed', message: 'Diese Anfrage wurde bereits verarbeitet.' })
      const existing = activePhotoBooking(user.id, body.items?.map(i => i.photoId) ?? body.photoId)
      if (existing && body.items?.some(i => !i.photoId || activePhotoBooking(user.id, i.photoId)?.id !== existing.id)) return reply.code(409).send({ error: 'partial_booking', message: 'Ein Teil der Liste ist bereits eingetragen. Bitte die Liste erneut prüfen.' })
      if (existing) return existing.id === p.id ? detail(p) : reply.code(409).send({ error: 'already_booked', message: 'Dieses Objekt ist bereits einem anderen Termin zugeordnet.' })
      if (!compatible(p, body)) return reply.code(409).send({ error: 'incompatible', message: 'Termin, Adresse oder Kapazität passen nicht mehr. Bitte erneut prüfen.' })
      ensureItems(p)
      attachItem(p.id, body)
      run('UPDATE pickups SET volume_m3=volume_m3+? WHERE id=?', Number(body.volumeM3), p.id)
      if (body.requestKey) run('INSERT INTO pickup_requests VALUES (?,?,?,?)', user.id, body.requestKey, payload, p.id)
      notify(p, 'item_added', 'Gegenstand zum eingetragenen Termin hinzugefügt. Keine zusätzliche Buchung.', body.photoId || body.requestKey)
      return detail(one('SELECT * FROM pickups WHERE id=?', p.id))
    })()
  })

  app.post('/api/fes/pickups/:id/reschedule', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    return tx(() => {
      const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
      if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
      if (p.status !== 'booked') return reply.code(409).send({ error: 'inactive', message: 'Dieser Termin ist nicht aktiv.' })
      if (p.slot_date === req.body?.slotDate) return detail(p)
      const cancel = provider.cancel(p.reference, { slotDate: p.slot_date })
      const result = provider.book({ address: p.address, districtId: p.district_id, categoryId: p.category, volumeM3: p.volume_m3, slotDate: req.body?.slotDate })
      if (!cancel.ok || !result.ok) return reply.code(409).send({ error: 'unavailable', message: cancel.message ?? result.message })
      if (!tourCapacity(p.district_id, result.slotDate, p.volume_m3, p.id)) return reply.code(409).send({ error: 'tour_full', message: 'Diese gemeinsame Tour ist bereits voll oder geplant.' })
      const twin = all("SELECT * FROM pickups WHERE user_id=? AND slot_date=? AND district_id=? AND status='booked' AND id<>?", user.id, result.slotDate, p.district_id, p.id).find(q => addressKey(q.address) === addressKey(p.address))
      if (twin) return reply.code(409).send({ error: 'already_booked', message: 'Für dieses Datum besteht bereits eine Buchung.' })
      snapshotRegistration(p)
      run('UPDATE pickups SET slot_date=?, reference=? WHERE id=?', result.slotDate, result.reference, p.id)
      run('INSERT INTO pickup_preferences(pickup_id) VALUES (?) ON CONFLICT(pickup_id) DO NOTHING', p.id)
      run('UPDATE pickup_preferences SET revision=revision+1 WHERE pickup_id=?', p.id)
      const updated = one('SELECT * FROM pickups WHERE id=?', p.id)
      attachTour(updated)
      scheduleReminders(updated)
      notify(updated, 'rescheduled', `Termin verschoben: ${formatDe(result.slotDate)} · 06:00–15:00 Uhr. Nur in ReMain eingetragen.`)
      return detail(updated)
    })()
  })

  app.post('/api/fes/pickups/:id/items/:itemId/remove', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    return tx(() => {
      const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
      if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
      const allowed = provider.cancel(p.reference, { slotDate: p.slot_date })
      if (p.status !== 'booked' || !allowed.ok) return reply.code(409).send({ error: 'inactive', message: allowed.message || 'Dieser Termin ist nicht aktiv.' })
      const item = one('SELECT * FROM pickup_items WHERE id=? AND pickup_id=?', req.params.itemId, p.id)
      if (!item) return detail(p) // Retrying a successful removal is harmless.
      if (one('SELECT COUNT(*) AS n FROM pickup_items WHERE pickup_id=?', p.id).n <= 1) return reply.code(409).send({ error: 'last_item', message: 'Für den letzten Gegenstand bitte den gesamten Termin absagen.' })
      snapshotRegistration(p)
      run('DELETE FROM pickup_items WHERE id=?', item.id)
      run('UPDATE pickups SET volume_m3=volume_m3-? WHERE id=?', item.volume_m3, p.id)
      notify(p, 'item_removed', 'Gegenstand entfernt. Der Termin für die übrigen Gegenstände bleibt bestehen.', item.id)
      return detail(one('SELECT * FROM pickups WHERE id=?', p.id))
    })()
  })

  app.post('/api/fes/pickups/:id/issue', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
    if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
    if (p.status !== 'booked' || localTime() < `${p.slot_date}T15:00:00`) return reply.code(409).send({ error: 'too_early', message: 'Eine ausgebliebene Abholung lässt sich erst nach dem Termin dokumentieren.' })
    notify(p, 'issue', 'Ausgebliebene Abholung in ReMain dokumentiert. Diese Meldung wurde nicht an FES gesendet.', 'missed')
    return { ok: true }
  })

  app.post('/api/fes/pickups/:id/reminders', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    if (typeof req.body?.enabled !== 'boolean') return reply.code(400).send({ error: 'invalid', message: 'Erinnerung auswählen.' })
    return tx(() => {
      const p = one('SELECT * FROM pickups WHERE id=? AND user_id=?', req.params.id, user.id)
      if (!p) return reply.code(404).send({ error: 'unknown_pickup', message: 'Termin nicht gefunden.' })
      if (p.status !== 'booked') return reply.code(409).send({ error: 'inactive', message: 'Termin nicht aktiv.' })
      run(`INSERT INTO pickup_preferences(pickup_id,reminders) VALUES (?,?) ON CONFLICT(pickup_id)
        DO UPDATE SET reminders=excluded.reminders,revision=revision+1`, p.id, Number(req.body.enabled))
      scheduleReminders(p)
      return detail(p)
    })()
  })

  app.get('/api/fes/notifications', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    const rows = all('SELECT * FROM pickup_notifications WHERE user_id=? AND due_local<=? ORDER BY due_local DESC,created_at DESC LIMIT 100', user.id, localTime())
    return { notifications: rows.map(n => ({ id: n.id, pickupId: n.pickup_id, kind: n.kind, message: n.message, read: !!n.read_at, at: n.due_local })), unread: rows.filter(n => !n.read_at).length }
  })
  app.post('/api/fes/notifications/:id/read', async (req, reply) => {
    const user = requireUser(req, reply); if (!user) return
    run('UPDATE pickup_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=? AND due_local<=?', now(), req.params.id, user.id, localTime())
    return { ok: true }
  })
}
