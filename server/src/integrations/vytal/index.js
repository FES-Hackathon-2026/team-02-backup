import { distanceKm, id, now } from '../../db.js'
import { CONTAINERS, PARTNERS, partnerById } from './partners.js'
import { read, write } from './store.js'

/**
 * Vytal Mehrweg — stand-in adapter.
 *
 * The sandbox documentation is a Notion page we have no access to, so this is
 * a rebuild, and it says so at every value it produces: `TIER = 'simulated'`,
 * never `confirmed`. What is NOT improvised is the shape. The event carries
 * `event_id`, `container_id`, `partner_id`, `status` and timestamps, because
 * that is the vocabulary the real service speaks and the whole point of
 * building it this way is that swapping in the real adapter is this one file.
 *
 * The load-bearing part is `event_id`. Our ledger pays a partner event at most
 * once, keyed on exactly that string (`award({ eventKey })`). So a second scan
 * of the same container has to come back with the *same* `event_id` rather
 * than a fresh one — which is also what a real return terminal does when you
 * hold an already-returned bowl in front of it. Everything else here is
 * scaffolding; that is the guarantee.
 *
 * What the real integration replaces, field for field: INTEGRATION.md.
 */

/** Every value this module produces is a rebuild, not a reading. */
export const TIER = 'simulated'

/** Vytal's standard loan period. */
export const LOAN_DAYS = 14

export class VytalError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/* ------------------------------------------------------------------
   Return points
   ------------------------------------------------------------------ */

export function partners({ lat, lon, radiusKm = 12, limit = 20 } = {}) {
  const rows = PARTNERS.map((p) => ({
    ...p,
    distanceKm:
      lat === undefined || lon === undefined
        ? null
        : Number(distanceKm({ lat, lon }, p).toFixed(2)),
  }))

  if (lat === undefined || lon === undefined) return rows.slice(0, limit)
  return rows
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

/* ------------------------------------------------------------------
   Containers
   ------------------------------------------------------------------ */

/** Vytal prints a short code on the container; this is its shape. */
function newContainerId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 — read off a lid
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `VY-${code}`
}

const isOverdue = (container, at = Date.now()) =>
  container.status === 'borrowed' && new Date(container.due_at).getTime() < at

function shape(container, at = Date.now()) {
  const type = CONTAINERS[container.container_type] ?? { label: container.container_type }
  return {
    container_id: container.container_id,
    container_type: container.container_type,
    label: type.label,
    partner_id: container.partner_id,
    partner_name: partnerById(container.partner_id)?.name ?? null,
    status: isOverdue(container, at) ? 'overdue' : container.status,
    borrowed_at: container.borrowed_at,
    due_at: container.due_at,
    returned_at: container.returned_at ?? null,
    return_partner_id: container.return_partner_id ?? null,
    return_partner_name: container.return_partner_id
      ? (partnerById(container.return_partner_id)?.name ?? null)
      : null,
    borrow_event_id: container.borrow_event_id,
    return_event_id: container.return_event_id ?? null,
    /** Whole hours left before the loan runs out; negative when overdue. */
    hoursLeft: Math.round((new Date(container.due_at).getTime() - at) / 3_600_000),
    single_use_grams: type.single_use_grams ?? null,
  }
}

/** Everything this person currently holds, plus what they have handed back. */
export function containers(userRef, at = Date.now()) {
  const state = read()
  const mine = Object.values(state.containers).filter((c) => c.user_ref === userRef)
  return {
    active: mine.filter((c) => c.status === 'borrowed').map((c) => shape(c, at)),
    returned: mine
      .filter((c) => c.status === 'returned')
      .sort((a, b) => (a.returned_at < b.returned_at ? 1 : -1))
      .map((c) => shape(c, at)),
  }
}

/* ------------------------------------------------------------------
   The two events
   ------------------------------------------------------------------ */

/**
 * Borrowing. In the real flow the partner's till triggers this when the meal
 * is handed over; here the app asks for it, which is why the screen calls it
 * a Demo-Ausleihe rather than pretending a restaurant did something.
 */
export function borrow({ userRef, partnerId, containerType = 'bowl_1000' }) {
  const partner = partnerById(partnerId)
  if (!partner) throw new VytalError(404, 'unknown_partner', 'Diesen Vytal-Partner gibt es nicht.')
  if (!CONTAINERS[containerType]) {
    throw new VytalError(422, 'unknown_container_type', 'Diese Behältergröße gibt es nicht.')
  }
  if (!partner.accepts.includes(containerType)) {
    throw new VytalError(409, 'not_accepted', `${partner.name} gibt diese Behältergröße nicht aus.`)
  }

  const occurredAt = now()
  const dueAt = new Date(Date.now() + LOAN_DAYS * 86_400_000).toISOString()
  const containerId = newContainerId()
  const eventId = id('vytal_evt')

  const event = {
    event_id: eventId,
    type: 'borrow',
    container_id: containerId,
    container_type: containerType,
    partner_id: partnerId,
    user_ref: userRef,
    status: 'borrowed',
    occurred_at: occurredAt,
    due_at: dueAt,
  }

  write((state) => {
    state.containers[containerId] = {
      container_id: containerId,
      container_type: containerType,
      user_ref: userRef,
      partner_id: partnerId,
      borrowed_at: occurredAt,
      due_at: dueAt,
      status: 'borrowed',
      borrow_event_id: eventId,
    }
    state.events.push(event)
  })

  return { event, container: shape(read().containers[containerId]) }
}

/**
 * Returning.
 *
 * `repeat: true` means this container was already handed back and we are
 * handing out the event that recorded it — same `event_id`, so the ledger
 * recognises it and pays nothing. That is the exactly-once proof, and it has
 * to survive a server restart, which is why the store is a file.
 */
export function returnContainer({ userRef, containerId, partnerId }) {
  const state = read()
  const container = state.containers[containerId]

  if (!container) {
    throw new VytalError(404, 'unknown_container', 'Diesen Behälter-Code kennt Vytal nicht.')
  }
  if (container.user_ref !== userRef) {
    throw new VytalError(
      403,
      'not_your_container',
      'Dieser Behälter ist auf jemand anderen ausgeliehen.',
    )
  }

  const partner = partnerById(partnerId)
  if (!partner) {
    throw new VytalError(404, 'unknown_partner', 'Diesen Rückgabeort gibt es nicht.')
  }

  if (container.status === 'returned') {
    const existing = state.events.find((e) => e.event_id === container.return_event_id)
    return { event: existing, container: shape(container), repeat: true }
  }

  const occurredAt = now()
  const eventId = id('vytal_evt')
  const late = isOverdue(container)

  const event = {
    event_id: eventId,
    type: 'return',
    container_id: containerId,
    container_type: container.container_type,
    partner_id: partnerId,
    user_ref: userRef,
    status: 'returned',
    occurred_at: occurredAt,
    due_at: container.due_at,
    was_overdue: late,
    days_held: Math.max(
      0,
      Math.round((Date.now() - new Date(container.borrowed_at).getTime()) / 86_400_000),
    ),
  }

  write((s) => {
    const row = s.containers[containerId]
    row.status = 'returned'
    row.returned_at = occurredAt
    row.return_partner_id = partnerId
    row.return_event_id = eventId
    s.events.push(event)
  })

  return { event, container: shape(read().containers[containerId]), repeat: false }
}

/** One event by id — what the receipt reads when it wants the source row. */
export const event = (eventId) => read().events.find((e) => e.event_id === eventId) ?? null

/** Every event for one person, newest first. */
export const events = (userRef) =>
  read()
    .events.filter((e) => e.user_ref === userRef)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
