import * as api from './client.js'
import * as stores from './stores.js'

export { VytalError, hasKey, storeClaims } from './client.js'
export * as stores from './stores.js'
export { ensureVytalUser, vytalUserId, referenceFor } from './users.js'

/**
 * Vytal Mehrweg — the real integration.
 *
 * This used to be a rebuild that announced itself as one. It is now the live
 * merchant API, and the tier says so: everything below comes out of Vytal's
 * own answer, so it is `confirmed` and the receipt may say `bestätigt`
 * without a footnote.
 *
 * Two things did not survive the swap, and it is worth being plain about why,
 * because the old INTEGRATION.md promised they would:
 *
 *   The method signatures changed. The stand-in let someone pick a partner
 *   and a bowl size from a menu. The real system is driven by a physical QR
 *   code — you scan the container in your hand, and its type and name come
 *   back from Vytal. There is no size to choose.
 *
 *   The stand-in's `event_id` is gone. Its job is done better by two real
 *   fields: `transactionId`, which Vytal accepts to make a call idempotent,
 *   and the pair (`containerId`, `checkoutTime`), which identifies one rental
 *   cycle. Containers are reused — the same bowl comes back to the same
 *   person next month — so the ledger key has to be the cycle, not the
 *   container. `cycleKey()` below is that key, and it is the only thing
 *   standing between a returned bowl and being paid for twice.
 */

/** Every value here comes from Vytal's own answer. */
export const TIER = 'confirmed'

/** Vytal's standard loan period. Display only — `returnDeadline` decides. */
export const LOAN_DAYS = 14

/**
 * The ledger key for one rental cycle.
 *
 * `award({ eventKey })` pays a key at most once, ever. Keying on the
 * container alone would pay the first return and silently refuse every later
 * one for the life of that bowl; keying on the transaction would pay every
 * scan. The checkout timestamp is what separates one rental from the next.
 */
export const cycleKey = (containerId, checkoutTime) =>
  `vytal_return:${containerId}:${checkoutTime}`

const hoursUntil = (iso, at) =>
  iso ? Math.round((new Date(iso).getTime() - at) / 3_600_000) : null

/** One container, in the app's vocabulary. */
function shape(c, at = Date.now()) {
  const hoursLeft = hoursUntil(c.returnDeadline, at)
  return {
    containerId: c.containerId,
    name: c.containerName ?? null,
    typeId: c.containerTypeId ?? null,
    typeName: c.containerTypeName ?? null,
    sizeHelper: c.containerTypeSizeHelper ?? null,
    // containerTypeIconUrl is deprecated per the documentation.
    imageUrl: c.containerTypeImageUrl ?? null,

    checkoutTime: c.checkoutTime ?? null,
    returnDeadline: c.returnDeadline ?? null,
    returnTime: c.returnTime ?? null,
    /** Vytal's own word for the state; we do not reinterpret it. */
    status: c.status ?? null,

    hoursLeft,
    overdue: hoursLeft !== null && hoursLeft < 0,
    isOnHold: Boolean(c.isOnHold),
    onHoldSince: c.onHoldSince ?? null,

    checkoutStoreName: c.checkoutStoreName ?? null,
    checkinStoreName: c.checkinStoreName ?? null,
    restrictedCheckinInfo: c.restrictedCheckinInfo ?? null,

    /** What it costs if it never comes back, and what Vytal credits if it does. */
    overduePrice: c.overduePrice ?? 0,
    creditsOnReturn: c.creditsOnReturn ?? 0,

    cycleKey: c.containerId && c.checkoutTime ? cycleKey(c.containerId, c.checkoutTime) : null,
  }
}

/**
 * Everything this person holds, has handed back, or has been charged for.
 *
 * The third list is new and the reason it is shown: `sold` means the
 * container never came back in time and the compensation fee was charged.
 * An app that hides that is an app that lets someone find out from their
 * bank statement.
 */
export async function containers(vytalUserId, at = Date.now()) {
  const answer = await api.userContainers(vytalUserId)
  return {
    active: (answer?.active ?? []).map((c) => shape(c, at)),
    returned: (answer?.returned ?? []).map((c) => shape(c, at)),
    sold: (answer?.sold ?? []).map((c) => shape(c, at)),
    counts: {
      active: answer?.activeCount ?? 0,
      returned: answer?.returnedCount ?? 0,
      sold: answer?.soldCount ?? 0,
    },
  }
}

/**
 * What was scanned?
 *
 * The raw decode goes to Vytal untouched. The app is explicitly not allowed
 * to decide whether a string is a container — there are legacy code formats
 * in circulation and only Vytal knows them all. `type` comes back as
 * `Container`, `User` or `Invalid`, and a Vytal *user* code is a real thing
 * someone might hold up to the camera, so the caller has to handle it.
 */
export async function checkCode(code) {
  const answer = await api.checkCode(code)
  return {
    ok: Boolean(answer?.codeOk),
    type: answer?.type ?? 'Invalid',
    containerId: answer?.id ?? null,
    shortId: answer?.shortId ?? null,
    name: answer?.containerName ?? null,
    typeId: answer?.containerTypeId ?? null,
    typeName: answer?.containerTypeName ?? null,
    sizeHelper: answer?.containerTypeSizeHelper ?? null,
    imageUrl: answer?.containerTypeImageUrl ?? null,
    /** e.g. CheckedOut — whether the bowl is currently out with someone. */
    containerStatus: answer?.containerStatus ?? null,
  }
}

/**
 * Vytal reports success in a `result` field rather than by status code, so a
 * 200 is not on its own good news. Anything but `Success` is surfaced as it
 * came, because we do not have the full vocabulary of failures and guessing
 * at a friendlier wording would mean inventing one.
 */
function settle(answer, fallbackMessage) {
  const result = answer?.result ?? null
  if (result !== 'Success') {
    throw new api.VytalError(
      409,
      `vytal_${String(result ?? 'unknown').toLowerCase()}`,
      fallbackMessage,
      answer,
    )
  }
  return {
    result,
    storeName: answer?.storeName ?? null,
    timestamp: answer?.timestamp ?? null,
    containers: (answer?.containers ?? []).map((c) => ({
      containerId: c.id,
      name: c.name ?? null,
      typeId: c.typeId ?? null,
      imageUrl: c.containerTypeImageUrl ?? null,
    })),
    currentUserContainerCount: answer?.currentUserContainerCount ?? null,
    transactionContainerCount: answer?.transactionContainerCount ?? null,
    remainingCheckouts: answer?.remainingCheckouts ?? null,
    showCheckoutLimitWarning: Boolean(answer?.showCheckoutLimitWarning),
    forbiddenContainerTypeNames: answer?.forbiddenContainerTypeNames ?? null,
    allowedStoreNames: answer?.allowedStoreNames ?? null,
  }
}

/**
 * Hand a container over. Draws on *our* store's stock — the token decides
 * which store that is, so there is no shop to choose.
 */
export async function checkout({ vytalUserId, qrCodes, transactionId }) {
  const answer = await api.checkout(vytalUserId, qrCodes, transactionId)
  return settle(answer, 'Vytal hat die Ausgabe nicht angenommen.')
}

/**
 * Take a container back. Books into our store, because that is whose token
 * we present — which is exactly what the screen has to say rather than
 * implying the bowl was dropped at the café it came from.
 */
export async function returnContainer({ qrCodes, transactionId }) {
  const answer = await api.containerReturn(qrCodes, transactionId)
  return settle(answer, 'Vytal hat die Rückgabe nicht angenommen.')
}

/**
 * CO₂ Vytal itself attributes to this person — a measured figure from the
 * partner, not our estimate. Store-scoped: only containers we issued and
 * that came back count, which the screen has to say alongside the number.
 */
export async function co2Saved(vytalUserId) {
  const answer = await api.co2ForUser(vytalUserId)
  return {
    co2SavedKg: answer?.co2SavedKg ?? 0,
    containerCount: answer?.containerCount ?? 0,
  }
}

/** What our own station has on the shelf right now. */
export async function stock() {
  const rows = await api.storeStock()
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    typeId: r.id,
    name: r.name,
    amount: r.amount ?? 0,
  }))
}

/** Real Vytal partners near a point — public directory, no token. */
export const partners = (opts) => stores.nearby(opts)
