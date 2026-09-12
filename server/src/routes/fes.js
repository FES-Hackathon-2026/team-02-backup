import { all, distanceKm, id, now, one, run, tx } from '../db.js'
import { award } from '../engine/award.js'
import * as abc from '../integrations/fes/abfall-abc.js'
import * as calendar from '../integrations/fes/calendar.js'
import { formatDe, today } from '../integrations/fes/dates.js'
import * as pickup from '../integrations/fes/pickup.js'
import { requireUser } from '../session.js'
import { attachTour, decorateSlots, syncTours, tourCapacity, tourFor, period } from './pickup-tours.js'
import lifecycleRoutes, { activePhotoBooking, attachItem, checkItem, detail, notify, scheduleReminders, snapshotRegistration, localTime, pickupShape } from './pickup-lifecycle.js'

/**
 * Phase 5 — the FES services: bulky-waste booking, collection calendar,
 * disposal guidance.
 *
 *   GET  /api/fes/categories
 *   GET  /api/fes/slots?districtId=&volume=
 *   POST /api/fes/pickups   { address, districtId, category, volumeM3, slotDate }
 *   GET  /api/fes/pickups                     (the person's own bookings)
 *   POST /api/fes/pickups/:id/cancel
 *   GET  /api/fes/calendar?districtId=
 *   GET  /api/fes/abc?category=&districtId=   (added in phase 5, for Wissen)
 *
 * Every response carries source: 'simulated' until FES gives us an endpoint.
 * The rules live in integrations/fes/*; this file only persists, rewards and
 * shapes — so swapping the adapter for the real service never touches a route.
 */

/** XP for registering a collection instead of leaving it on the pavement. */
const PICKUP_XP = 40

/** Heading for the real OSM places the Wissen screen shows. */
const PLACE_LABEL = {
  wertstoffhof: 'Wertstoffhöfe in deiner Nähe',
  glascontainer: 'Glascontainer in deiner Nähe',
  altkleider: 'Altkleidercontainer in deiner Nähe',
}

const asNumber = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const districtOf = (request, user) => {
  const wanted = request.query?.districtId
  if (typeof wanted === 'string' && wanted.length > 0) return wanted
  return user.district_id
}

/** The shape the app reads. Keeps snake_case out of the client. */
const shape = pickupShape

export default async function fesRoutes(app) {
  app.addHook('onRequest', async () => syncTours(localTime()))
  const planningTimer = setInterval(() => syncTours(localTime()), 60_000)
  planningTimer.unref()
  app.addHook('onClose', async () => clearInterval(planningTimer))
  await app.register(lifecycleRoutes)
  /* ----------------------------------------------------------------
     What can be booked, and what has its own route instead.
     ---------------------------------------------------------------- */
  app.get('/api/fes/categories', async () => pickup.categories())

  /* ----------------------------------------------------------------
     Free dates for a district. Nothing here is stored — the adapter is
     deterministic, so the same question gets the same answer.
     ---------------------------------------------------------------- */
  app.get('/api/fes/slots', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const districtId = districtOf(request, user)
    const volume = asNumber(request.query?.volume, 1)
    return decorateSlots(pickup.slots(districtId, volume), volume)
  })

  /* ----------------------------------------------------------------
     Book. The adapter decides whether FES would accept it; this writes
     the row and hands the credit to award().
     ---------------------------------------------------------------- */
  app.post('/api/fes/pickups', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    return tx(() => {
      const body = request.body ?? {}
      const itemError = checkItem(body, user.id)
      if (itemError) return reply.code(400).send({ error: 'invalid_item', message: itemError })
      const contact = body.contact ?? {}
      if (body.contact && (typeof contact !== 'object' || ['fullName','email','phone','postcode','placement'].some(k => contact[k] != null && (typeof contact[k] !== 'string' || contact[k].length > 400)))) return reply.code(400).send({ error: 'invalid_contact', message: 'Bitte Kontaktdaten prüfen.' })
      const payload = JSON.stringify([body.address, body.districtId, body.category, body.volumeM3, body.slotDate, body.photoId, body.contact, body.items])
      if (body.requestKey && (typeof body.requestKey !== 'string' || body.requestKey.length > 100)) return reply.code(400).send({ error: 'invalid_key', message: 'Ungültige Anfrage.' })
      const prior = body.requestKey && one('SELECT * FROM pickup_requests WHERE user_id=? AND request_key=?', user.id, body.requestKey)
      if (prior) {
        if (prior.payload !== payload) return reply.code(409).send({ error: 'request_changed', message: 'Diese Anfrage wurde bereits mit anderen Angaben verarbeitet.' })
        return { ...detail(one('SELECT * FROM pickups WHERE id=?', prior.pickup_id)), award: null }
      }
      const linked = activePhotoBooking(user.id, body.items?.map(i => i.photoId) ?? body.photoId)
      if (linked) return reply.code(409).send({ error: 'already_booked', message: 'Dieses Objekt ist bereits eingetragen. Bitte den vorhandenen Termin öffnen.' })
      const districtId = body.districtId || user.district_id
      const district = one('SELECT id, name FROM districts WHERE id = ?', districtId)
      if (!district) {
        return reply.code(400).send({ error: 'unknown_district', message: 'Diesen Stadtteil gibt es nicht.' })
      }

      const result = pickup.book({
        address: body.address,
        districtId,
        categoryId: pickup.category(body.category).id,
        volumeM3: body.volumeM3,
        slotDate: body.slotDate,
      })

      if (!result.ok) {
        return reply.code(400).send({
          error: result.code,
          message: result.message,
          alternative: result.alternative ?? null,
        })
      }

      // The reference is derived from address, date and category, so booking
      // the same thing twice would produce two rows with one Auftragsnummer.
      // FES would refuse that, and so does this.
      if (!tourCapacity(districtId, result.slotDate, result.volumeM3)) return reply.code(409).send({ error: 'tour_full', message: 'Diese gemeinsame Tour ist bereits voll oder geplant. Bitte einen anderen Zeitraum wählen.' })
      const twin = all("SELECT * FROM pickups WHERE user_id=? AND status='booked' AND slot_date=? AND district_id=?", user.id, result.slotDate, districtId)
        .find(p => p.address.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ') === body.address.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' '))
      if (twin) {
        return reply.code(409).send({
          error: 'already_booked',
          message: `Für diese Adresse steht am ${formatDe(result.slotDate)} schon ein Termin: ${twin.reference}.`,
          pickup: shape(twin),
        })
      }

      const pickupId = id('pu')
      run(
        `INSERT INTO pickups (id, user_id, address, district_id, category, volume_m3,
                              slot_date, reference, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?)`,
        pickupId,
        user.id,
        body.address.trim(),
        districtId,
        result.category,
        result.volumeM3,
        result.slotDate,
        result.reference,
        pickup.SOURCE,
        now(),
      )

      const stored = one('SELECT * FROM pickups WHERE id=?', pickupId)
      attachTour(stored)
      run('INSERT INTO pickup_contacts VALUES (?,?,?,?,?,?)', pickupId, contact.fullName || user.name, contact.email || '', contact.phone || '', contact.postcode || '', contact.placement || '')
      snapshotRegistration(one('SELECT * FROM pickups WHERE id=?', pickupId))
      attachItem(pickupId, body)
      if (body.requestKey) run('INSERT INTO pickup_requests VALUES (?,?,?,?)', user.id, body.requestKey, payload, pickupId)
      notify(one('SELECT * FROM pickups WHERE id=?', pickupId), 'booked', `Anfrage für ${period(result.slotDate).periodLabel} eingegangen. Dein Ankunftsfenster folgt nach gemeinsamer Tourplanung. Simulation, keine FES-Buchung.`, 'created')

      // 'simulated' and never anything better: we rebuilt this service, so the
      // receipt has to say the booking was not confirmed by FES.
      const credit = award({
        userId: user.id,
        kind: 'pickup',
        refTable: 'pickups',
        refId: pickupId,
        tier: 'simulated',
        reason: `Sperrmüll für den ${formatDe(result.slotDate)} angemeldet statt auf den Gehweg gestellt`,
        xp: PICKUP_XP,
        eventKey: `fes:pickup:${result.reference}`,
      })

      const row = one('SELECT * FROM pickups WHERE id = ?', pickupId)
      return {
        pickup: shape(row),
        instructions: result.instructions,
        window: result.window,
        vehicle: result.vehicle,
        district: district.name,
        award: credit.ok
          ? { xp: credit.xp, coins: credit.coins, actionId: credit.actionId, totals: credit.totals }
          : null,
        awardNote: credit.ok ? null : credit.message,
        source: pickup.SOURCE,
        note: 'Der Termin steht in ReMain, nicht bei FES. Sobald die Schnittstelle da ist, wird aus „eingetragen" ein „bestätigt".',
      }
    })()
  })

  /** The person's own bookings, newest slot first. */
  app.get('/api/fes/pickups', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const rows = all(
      'SELECT * FROM pickups WHERE user_id = ? ORDER BY slot_date DESC',
      user.id,
    )
    return { pickups: rows.map(shape), source: pickup.SOURCE }
  })

  /**
   * Withdraw a booking.
   *
   * The ledger is append-only, so the XP stays — and the answer says so out
   * loud rather than quietly leaving the person to notice.
   */
  app.post('/api/fes/pickups/:id/cancel', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const row = one(
      'SELECT * FROM pickups WHERE id = ? AND user_id = ?',
      request.params.id,
      user.id,
    )
    if (!row) return reply.code(404).send({ error: 'unknown_pickup', message: 'Diesen Termin gibt es nicht.' })
    if (row.status === 'cancelled') {
      return reply.code(409).send({ error: 'already_cancelled', message: 'Der Termin ist schon storniert.' })
    }

    const result = pickup.cancel(row.reference, { slotDate: row.slot_date })
    if (!result.ok) return reply.code(400).send({ error: result.code, message: result.message })

    if (row.status !== 'booked') return reply.code(409).send({ error: 'inactive', message: 'Dieser Termin ist nicht aktiv.' })
    tx(() => {
      run("UPDATE pickups SET status = 'cancelled' WHERE id = ?", row.id)
      scheduleReminders({ ...row, status: 'cancelled' })
      notify(row, 'cancelled', `Termin ${row.reference} storniert. Die Gutschrift bleibt als Anmeldung erhalten.`, 'cancelled')
    })()

    return {
      pickup: shape(one('SELECT * FROM pickups WHERE id = ?', row.id)),
      message: `Termin ${row.reference} storniert.`,
      ledgerNote:
        'Die Gutschrift bleibt stehen — das Verzeichnis wird nie rückwirkend geändert. Sichtbar bleibt sie als Anmeldung, nicht als Abholung.',
      source: pickup.SOURCE,
    }
  })

  /* ----------------------------------------------------------------
     The collection calendar: the four cycles plus this person's own
     bookings, merged into one list.
     ---------------------------------------------------------------- */
  app.get('/api/fes/calendar', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const districtId = districtOf(request, user)
    const district = one('SELECT id, name, bezirk FROM districts WHERE id = ?', districtId)
    if (!district) {
      return reply.code(404).send({ error: 'unknown_district', message: 'Diesen Stadtteil gibt es nicht.' })
    }

    const from = today()
    const cycle = calendar.dates(districtId, { from })

    // Own bookings are not part of a cycle. They are marked `own` so the app
    // can label them "eingetragen" — FES has not seen them.
    const mine = all(
      `SELECT * FROM pickups
        WHERE user_id = ? AND district_id = ? AND status = 'booked' AND slot_date >= ?
        ORDER BY slot_date`,
      user.id,
      districtId,
      from,
    ).map((p) => ({
      id: `pickup-${p.id}`,
      fraktion: 'sperrmuell',
      titel: `Sperrmüll · ${pickup.category(p.category)?.name ?? p.category}`,
      date: p.slot_date,
      label: shape(p).label,
      window: tourFor(p)?.eta ? `${tourFor(p).eta} Uhr · simuliert` : tourFor(p) ? 'Zeitfenster folgt nach Tourplanung' : '06:00–15:00 Uhr',
      own: true,
      pickupId: p.id,
      reference: p.reference,
      detail: `${p.volume_m3} m³ · ${p.address}`,
      source: p.source,
    }))

    const dates = [...cycle.dates, ...mine].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    return {
      district: { id: district.id, name: district.name, bezirk: district.bezirk },
      dates,
      fraktionen: cycle.fraktionen,
      source: calendar.SOURCE,
      assumptions: cycle.assumptions,
      note: 'Von dir gebuchte Termine stehen als „eingetragen" in dieser Liste — sie sind in ReMain angelegt, nicht von FES bestätigt.',
    }
  })

  /* ----------------------------------------------------------------
     "Was mache ich damit?" — the answer for one thing, with the next
     collection date for its bin and the nearest real Wertstoffhof.
     ---------------------------------------------------------------- */
  app.get('/api/fes/abc', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const districtId = districtOf(request, user)
    const query = request.query ?? {}
    const found = abc.lookup(query.category ?? query.subtype ?? query.q)

    if (!found) {
      return {
        entry: null,
        entries: abc.all(),
        source: abc.SOURCE,
        message: query.category
          ? `Zu „${query.category}" haben wir keinen Eintrag. Bitte aus der Liste wählen.`
          : null,
      }
    }

    const next = found.fraktion && found.fraktion !== 'sperrmuell'
      ? calendar.nextDate(districtId, found.fraktion)
      : null

    // Real OSM data, only where carrying it somewhere IS the answer — and
    // the right kind of place: 539 glass banks and 308 clothing containers
    // are in the database next to the twelve Wertstoffhöfe.
    const placeKind = found.route === 'wertstoffhof' ? (found.placeKind ?? 'wertstoffhof') : null
    let nearest = null
    if (placeKind) {
      const home = one('SELECT lat, lon FROM districts WHERE id = ?', districtId)
      const lat = asNumber(query.lat, home?.lat)
      const lon = asNumber(query.lon, home?.lon)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        nearest = all('SELECT * FROM places WHERE kind = ?', placeKind)
          .map((p) => ({
            id: p.id,
            name: p.name,
            addr: p.addr,
            openingHours: p.opening_hours,
            isFes: p.is_fes === 1,
            lat: p.lat,
            lon: p.lon,
            distanceKm: Number(distanceKm({ lat, lon }, p).toFixed(2)),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 2)
      }
    }

    return {
      entry: found,
      entries: abc.all(),
      nextDate: next,
      places: nearest,
      placeLabel: PLACE_LABEL[placeKind] ?? null,
      districtId,
      source: abc.SOURCE,
      attribution: nearest ? '© OpenStreetMap contributors (ODbL)' : null,
      note: 'Die Zuordnung ist nachgebaut. Die Rechtsgrundlagen darunter sind echt.',
    }
  })
}
