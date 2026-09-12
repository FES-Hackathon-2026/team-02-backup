import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'

const dir = mkdtempSync(join(tmpdir(), 'remain-pickup-test-'))
process.env.DATABASE_FILE = join(dir, 'test.db')
process.env.SESSION_SECRET = 'collection-test-secret'
const { db, one, run } = await import('../src/db.js')
const { default: routes } = await import('../src/routes/fes.js')
const { today, addDays } = await import('../src/integrations/fes/dates.js')
const { localTime, scheduleReminders } = await import('../src/routes/pickup-lifecycle.js')
const { slots } = await import('../src/integrations/fes/pickup.js')
const app = Fastify()
await app.register(cookie)
await app.register(routes)
await app.register((await import('../src/routes/session.js')).default)
run("INSERT INTO districts VALUES ('bockenheim','Bockenheim',2,50.1,8.6)")
for (const user of [1, 2]) run("INSERT INTO users(id,name,district_id,created_at,auth_provider,google_uid) VALUES (?,?,'bockenheim',?,'google',?)", user, `Person ${user}`, new Date().toISOString(), `seed-${user}`)
for (let i = 1; i <= 12; i++) run("INSERT INTO photos(id,user_id,mime,bytes,byte_size,created_at) VALUES (?,1,'image/jpeg',?,1,?)", `photo${i}`, Buffer.from([1]), new Date().toISOString())
const token = user => `${user}.${createHmac('sha256', process.env.SESSION_SECRET).update(String(user)).digest('base64url')}`
const call = async (method, url, payload, user = 1) => {
  const response = await app.inject({ method, url, payload, cookies: { remain_session: token(user) } })
  return { status: response.statusCode, body: response.json() }
}
const item = { address: 'Leipziger Straße 12', districtId: 'bockenheim', category: 'moebel', volumeM3: 1, photoId: 'photo1' }
const date = slots('bockenheim', 2).slots.find(s => s.available).date
let bookingId

after(async () => { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }) })

test('Frankfurt dates and local reminders handle UTC midnight and DST', () => {
  assert.equal(today(new Date('2026-09-12T22:30:00Z')), '2026-09-13')
  assert.equal(localTime(new Date('2026-03-29T01:30:00Z')), '2026-03-29T03:30:00')
  assert.equal(localTime(new Date('2026-10-25T01:30:00Z')), '2026-10-25T02:30:00')
})

test('resolver requires address, validates ownership and rejects unsupported objects', async () => {
  assert.equal((await call('POST', '/api/fes/resolve', { ...item, address: '' })).body.state, 'needs_address')
  assert.equal((await call('POST', '/api/fes/resolve', item, 2)).status, 400)
  assert.equal((await call('POST', '/api/fes/resolve', { ...item, category: 'schadstoff' })).status, 400)
  assert.equal((await call('POST', '/api/fes/resolve', { ...item, volumeM3: 7 })).status, 400)
  const result = await call('POST', '/api/fes/resolve', item)
  assert.equal(result.body.state, 'available_slots')
  assert.equal(result.body.source, 'simulated')
  assert.ok(result.body.slots.some(s => s.available))
})

test('booking atomically stores item, notification and a single reward; retry is idempotent', async () => {
  const body = { ...item, slotDate: date, requestKey: 'create-1' }
  const first = await call('POST', '/api/fes/pickups', body)
  assert.equal(first.status, 200, JSON.stringify(first.body))
  bookingId = first.body.pickup.id
  const repeat = await call('POST', '/api/fes/pickups', body)
  assert.equal(repeat.status, 200)
  assert.equal(repeat.body.pickup.id, bookingId)
  assert.equal(one('SELECT COUNT(*) n FROM pickups').n, 1)
  assert.equal(one('SELECT COUNT(*) n FROM pickup_items').n, 1)
  assert.equal(one('SELECT COUNT(*) n FROM ledger_entries').n, 1)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='booked'").n, 1)
  assert.equal((await call('POST', '/api/fes/pickups', { ...body, volumeM3: 2 })).status, 409)
  assert.equal((await call('POST', '/api/fes/resolve', { ...item, address: '' })).body.state, 'already_booked')
})

test('address/category matching, duplicate scan association and combined capacity', async () => {
  const second = { ...item, photoId: 'photo2', address: '  Leipziger   Straße 12 ' }
  assert.equal((await call('POST', '/api/fes/resolve', second)).body.state, 'existing_booking')
  assert.equal((await call('POST', '/api/fes/resolve', { ...second, address: 'Andere Straße 12' })).body.state, 'available_slots')
  assert.equal((await call('POST', '/api/fes/resolve', { ...second, category: 'metall' })).body.state, 'existing_booking')
  assert.equal((await call('POST', '/api/fes/pickups', { ...item, slotDate: date, requestKey: 'new-key' })).status, 409)
  const added = await call('POST', `/api/fes/pickups/${bookingId}/items`, second)
  assert.equal(added.status, 200, JSON.stringify(added.body))
  assert.equal(added.body.pickup.volumeM3, 2)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/items`, second)).body.pickup.volumeM3, 2)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/items`, { ...second, photoId: 'photo3', volumeM3: 5 })).status, 409)
  assert.equal(one('SELECT COUNT(*) n FROM ledger_entries').n, 1)
})

test('booking and notification access stays scoped to owner', async () => {
  assert.equal((await call('GET', `/api/fes/pickups/${bookingId}`, undefined, 2)).status, 404)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/cancel`, {}, 2)).status, 404)
  assert.equal((await call('GET', '/api/fes/notifications', undefined, 2)).body.notifications.length, 0)
  const notice = one('SELECT id FROM pickup_notifications LIMIT 1')
  await call('POST', `/api/fes/notifications/${notice.id}/read`, {}, 2)
  assert.equal(one('SELECT read_at FROM pickup_notifications WHERE id=?', notice.id).read_at, null)
})

test('reschedule failure preserves original; success replaces reminders and calendar date', async () => {
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/reminders`, { enabled: true })).status, 200)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='reminder'").n, 2)
  const failed = await call('POST', `/api/fes/pickups/${bookingId}/reschedule`, { slotDate: '2020-01-01' })
  assert.equal(failed.status, 409)
  assert.equal(one('SELECT slot_date FROM pickups WHERE id=?', bookingId).slot_date, date)
  const next = slots('bockenheim', 2).slots.find(s => s.available && s.date !== date).date
  const changed = await call('POST', `/api/fes/pickups/${bookingId}/reschedule`, { slotDate: next })
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal(changed.body.pickup.date, next)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='reminder'").n, 2)
  assert.equal(one('SELECT COUNT(*) n FROM ledger_entries').n, 1)
  const calendar = (await call('GET', '/api/fes/calendar')).body
  assert.equal(calendar.dates.find(d => d.pickupId === bookingId).date, next)
})

test('remove item is idempotent; last item uses cancellation', async () => {
  const items = (await call('GET', `/api/fes/pickups/${bookingId}`)).body.items
  const removed = await call('POST', `/api/fes/pickups/${bookingId}/items/${items[1].id}/remove`, {})
  assert.equal(removed.body.pickup.volumeM3, 1)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/items/${items[1].id}/remove`, {})).body.pickup.volumeM3, 1)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/items/${items[0].id}/remove`, {})).status, 409)
})

test('due reminders survive process boundaries; future ones stay hidden', async () => {
  const before = (await call('GET', '/api/fes/notifications')).body
  assert.ok(!before.notifications.some(n => n.kind === 'reminder'))
  const reminder = one("SELECT id FROM pickup_notifications WHERE kind='reminder' LIMIT 1")
  run('UPDATE pickup_notifications SET due_local=? WHERE id=?', `${today()}T00:00:00`, reminder.id)
  assert.ok((await call('GET', '/api/fes/notifications')).body.notifications.some(n => n.id === reminder.id))
  await call('POST', `/api/fes/notifications/${reminder.id}/read`, {})
  assert.ok((await call('GET', '/api/fes/notifications')).body.notifications.find(n => n.id === reminder.id).read)
})

test('cancel removes future reminders, preserves ledger/history and excludes match', async () => {
  const result = await call('POST', `/api/fes/pickups/${bookingId}/cancel`, {})
  assert.equal(result.status, 200)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='reminder' AND due_local>?", localTime()).n, 0)
  assert.equal(one('SELECT COUNT(*) n FROM ledger_entries').n, 1)
  assert.equal((await call('POST', '/api/fes/resolve', item)).body.state, 'available_slots')
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/items`, { ...item, photoId: 'photo3' })).status, 409)
  assert.equal((await call('POST', `/api/fes/pickups/${bookingId}/reminders`, { enabled: true })).status, 409)
})

test('legacy bookings remain readable and manual item additions are idempotent', async () => {
  const next = slots('bockenheim', 2).slots.find(s => s.available).date
  run("INSERT INTO pickups VALUES ('legacy',1,'Andere Straße 20','bockenheim','moebel',1,?,'legacy-ref','booked','simulated',?)", next, new Date().toISOString())
  assert.equal((await call('GET', '/api/fes/pickups/legacy')).body.items.length, 1)
  const manual = { ...item, address: 'Andere Straße 20', photoId: undefined, requestKey: 'manual-item' }
  const result = await call('POST', '/api/fes/pickups/legacy/items', manual)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.items.length, 2)
  assert.equal((await call('POST', '/api/fes/pickups/legacy/items', manual)).body.pickup.volumeM3, 2)
})

test('missing collection is documented only after window; time alone never completes booking', async () => {
  assert.equal((await call('POST', '/api/fes/pickups/legacy/issue', {})).status, 409)
  run('UPDATE pickups SET slot_date=? WHERE id=?', addDays(today(), -1), 'legacy')
  assert.equal((await call('POST', '/api/fes/pickups/legacy/issue', {})).status, 200)
  await call('POST', '/api/fes/pickups/legacy/issue', {})
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='issue'").n, 1)
  assert.equal(one("SELECT status FROM pickups WHERE id='legacy'").status, 'booked')
  scheduleReminders(one("SELECT * FROM pickups WHERE id='legacy'"))
})


test('multi-object basket joins shared tour; citizen sees only their own stop', async () => {
  const slot = slots('bockenheim', 2).slots.find(s => s.available).date
  const basket = { ...item, photoId: 'photo4', address: 'Teststraße 40', volumeM3: 2, slotDate: slot, requestKey: 'basket',
    items: [{ category: 'moebel', volumeM3: 1, photoId: 'photo4' }, { category: 'elektro-gross', volumeM3: 1, photoId: 'photo5' }] }
  const booked = await call('POST', '/api/fes/pickups', basket)
  assert.equal(booked.status, 200, JSON.stringify(booked.body))
  const other = await call('POST', '/api/fes/pickups', { ...item, photoId: undefined, address: 'Private Nachbaradresse 90', slotDate: slot, requestKey: 'neighbor' }, 2)
  assert.equal(other.status, 200, JSON.stringify(other.body))
  const own = (await call('GET', `/api/fes/pickups/${booked.body.pickup.id}`)).body
  assert.equal(own.items.length, 2)
  assert.equal(own.tour.status, 'collecting')
  assert.equal(own.tour.stops, 2)
  assert.equal(own.tour.eta, null)
  assert.ok(!JSON.stringify(own).includes('Private Nachbaradresse'))
  assert.equal((await call('POST', '/api/fes/pickups', { ...basket, requestKey: 'basket-repeat' })).status, 409)
  const corrupted = { ...basket, photoId: 'photo6', requestKey: 'bad-total', items: [{ category: 'moebel', volumeM3: 4, photoId: 'photo6' }] }
  assert.equal((await call('POST', '/api/fes/pickups', corrupted)).status, 400)
})

test('driver permissions, planning, completion and registration snapshot', async () => {
  assert.equal((await call('GET', '/api/fes/driver/tours')).status, 403)
  run("INSERT INTO users(id,name,district_id,role,created_at,auth_provider,google_uid) VALUES (3,'Driver','bockenheim','driver',?,'google','driver-test')", new Date().toISOString())
  const tours = (await call('GET', '/api/fes/driver/tours', undefined, 3)).body.tours
  const tour = tours.find(t => t.stops.some(s => s.address === 'Teststraße 40'))
  assert.ok(tour)
  assert.equal((await call('POST', `/api/fes/driver/tours/${tour.id}/plan`, {}, 1)).status, 403)
  assert.equal((await call('POST', `/api/fes/driver/tours/${tour.id}/plan`, {}, 3)).status, 200)
  const planned = (await call('GET', '/api/fes/driver/tours', undefined, 3)).body.tours.find(t => t.id === tour.id)
  assert.ok(planned.stops.every(s => s.eta))
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='tour_planned'").n, 2)
  await call('POST', `/api/fes/driver/tours/${tour.id}/plan`, {}, 3)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='tour_planned'").n, 2)
  const stop = planned.stops.find(s => s.address === 'Teststraße 40')
  assert.equal((await call('POST', `/api/fes/driver/stops/${stop.id}/collect`, {}, 1)).status, 403)
  assert.equal((await call('POST', `/api/fes/driver/stops/${stop.id}/collect`, {}, 3)).status, 200)
  await call('POST', `/api/fes/driver/stops/${stop.id}/collect`, {}, 3)
  assert.equal(one("SELECT COUNT(*) n FROM pickup_notifications WHERE kind='collected'").n, 1)
  assert.equal(one('SELECT status FROM pickups WHERE id=?', stop.id).status, 'collected')
  const original = one('SELECT * FROM pickup_registration_snapshots WHERE pickup_id=?', bookingId)
  assert.equal(original.volume_m3, 1)
  assert.equal(original.slot_date, date)
})


test('request recovery is owner-scoped and demo role switch cannot grant driver access', async () => {
  assert.equal((await call('GET', '/api/fes/requests/create-1')).body.pickup.id, bookingId)
  assert.equal((await call('GET', '/api/fes/requests/create-1', undefined, 2)).status, 404)
  assert.equal((await call('POST', '/api/session/switch', { userId: 3 })).status, 403)
})

test('shared-tour capacity prevents accepting an overfilled vehicle', async () => {
  const slot = slots('bockenheim', 1).slots.find(s => s.available && !one('SELECT id FROM pickup_tours WHERE collection_date=?', s.date)).date
  const first = await call('POST', '/api/fes/pickups', { ...item, photoId: 'photo8', address: 'Kapazität Test 1', slotDate: slot, requestKey: 'capacity-1' })
  assert.equal(first.status, 200)
  const tour = one('SELECT tour_id FROM pickup_tour_stops WHERE pickup_id=?', first.body.pickup.id)
  run('UPDATE pickup_tours SET capacity_m3=1 WHERE id=?', tour.tour_id)
  const failed = await call('POST', '/api/fes/pickups', { ...item, photoId: 'photo9', address: 'Kapazität Test 2', slotDate: slot, requestKey: 'capacity-2' })
  assert.equal(failed.status, 409)
  assert.equal(failed.body.error, 'tour_full')
  const resolved = (await call('POST', '/api/fes/resolve', { ...item, photoId: 'photo9', address: 'Kapazität Test 2' })).body
  assert.equal(resolved.slots.find(s => s.date === slot).available, false)
})
