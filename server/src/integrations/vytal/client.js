/**
 * Vytal Merchant-API — server-side client.
 *
 * Vytal issues one JWT per *store*, not per app. That single fact shapes the
 * whole integration: the token identifies a place, every checkout draws from
 * that place's stock, and `ContainerReturn` takes no store parameter at all
 * because the token already said where the container landed. ReMain is
 * therefore not a guest of the Vytal network — it *is* a Vytal station, and
 * the UI has to say so rather than implying a return happened at a café.
 *
 * The JWT never reaches the browser. The documentation is explicit about it
 * for `CheckCode` and `GetUserContainers`, and it holds for everything here:
 * the token is a store credential, and a store credential in a public bundle
 * is a stranger's lunch on our stock.
 *
 * Keys live in server/.env — VYTAL_JWT, never with a VITE_ prefix.
 */
const BASE = process.env.VYTAL_API_BASE ?? 'https://merchantapi.vytal.org'
const JWT = process.env.VYTAL_JWT ?? ''

export const hasKey = () => JWT !== ''

/** The store this token belongs to, decoded from the JWT for display only. */
export function storeClaims() {
  if (!JWT) return null
  try {
    const [, payload] = JWT.split('.')
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return {
      storeId: json.store_id ?? null,
      vytalStoreId: json.vytal_store_id ?? null,
      merchantId: json.vytal_merchant_id ?? null,
      createdAt: json.created_at ?? null,
    }
  } catch {
    return null
  }
}

/** Thrown for every non-2xx answer, already translated. */
export class VytalError extends Error {
  constructor(status, code, message, detail) {
    super(message)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

/**
 * German for each status the merchant API produces. A 401 here does not mean
 * "sign in" the way it does everywhere else in this app — it means our store
 * token is wrong, which is our problem and not the person's, so it says that.
 */
const MESSAGE = {
  400: 'Die Anfrage passt nicht zu dem, was Vytal erwartet.',
  401: 'Der Vytal-Store-Token wird nicht akzeptiert.',
  403: 'Dieser Store darf das nicht.',
  404: 'Das kennt Vytal nicht.',
  409: 'Das steht bei Vytal schon anders im Buch.',
  429: 'Zu viele Anfragen an Vytal. Gleich noch einmal.',
  500: 'Vytal hat einen Fehler gemeldet.',
  503: 'Die Vytal-API ist gerade nicht erreichbar.',
}

const CODE = {
  400: 'bad_request',
  401: 'bad_token',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  500: 'upstream_error',
  503: 'upstream_not_ready',
}

/**
 * One call against the merchant API.
 *
 * @param {string} path   including the leading slash; note that GetStoreStock
 *                        sits at /Merchant/… with no /api/3 prefix, which is
 *                        how the documentation spells it.
 */
export async function call(path, { method = 'GET', body } = {}) {
  if (!JWT) {
    throw new VytalError(
      503,
      'no_key',
      'Auf dem Server ist kein Vytal-Token hinterlegt (VYTAL_JWT).',
    )
  }

  const headers = { Authorization: `Bearer ${JWT}`, Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new VytalError(
      502,
      'upstream_unreachable',
      'Die Vytal-API antwortet gerade nicht.',
      String(cause),
    )
  }

  const text = await response.text()
  const data = text === '' ? null : safeJson(text)

  if (!response.ok) {
    throw new VytalError(
      response.status,
      data?.error ?? CODE[response.status] ?? 'upstream_error',
      data?.message ?? MESSAGE[response.status] ?? `Vytal antwortet mit ${response.status}.`,
      data ?? text.slice(0, 400),
    )
  }
  return data
}

const safeJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
   The calls we make. Field names stay exactly as Vytal spells them
   until the route shapes them for the app.
   ------------------------------------------------------------------ */

/**
 * Mints the anonymous Vytal user for one of ours. Documented as "should be
 * called only once per user" — `integrations/vytal/users.js` is what makes
 * that true; this is only the wire call.
 */
export const createAnonUser = (reference) =>
  call(`/api/3/ReferencedAnonUser/Create?userId=${encodeURIComponent(reference)}`, {
    method: 'POST',
  })

/**
 * Validates a scanned code and describes what was scanned.
 *
 * This is why the app may not parse QR codes itself: Vytal has "many
 * different legacy codes" in circulation, so the only thing that knows
 * whether a string is a container is Vytal. The app sends the raw decode.
 */
export const checkCode = (code) =>
  call(`/api/3/Container/CheckCode?code=${encodeURIComponent(code)}`)

/** Hand containers to a person. `transactionId` makes the call idempotent. */
export const checkout = (userId, containerQrCodes, transactionId) =>
  call('/api/3/Containers/Checkout', {
    method: 'POST',
    body: { userId, containerQrCodes, transactionId },
  })

/**
 * Take containers back.
 *
 * No `userId` and no store in the payload — deliberately. The token says
 * which store received it, and Vytal already knows who was holding it.
 */
export const containerReturn = (codes, transactionId) =>
  call('/api/3/Container/ContainerReturn', {
    method: 'POST',
    body: { codes, transactionId },
  })

/** Active, returned and sold containers for one Vytal user. */
export function userContainers(vytalUserId, { limit = 100, skip = 0 } = {}) {
  const q = new URLSearchParams({
    userId: vytalUserId,
    showCounts: 'true',
    showActive: 'true',
    showReturned: 'true',
    showSold: 'true',
    skip: String(skip),
    limit: String(limit),
    sortBy: 'CheckoutTime',
    orderBy: 'Descending',
    currency: 'EUR',
  })
  return call(`/api/3/ContainerHistory/GetUserContainers?${q}`)
}

/**
 * CO₂ this person saved on containers *our* store issued.
 *
 * Store-scoped by design, which is the one caveat the screen has to carry:
 * it is not the person's whole Vytal history, only the part that went
 * through ReMain.
 */
export const co2ForUser = (vytalUserId) =>
  call(
    `/api/3/Sustainability/GetUserCo2SavingsForStore?userId=${encodeURIComponent(vytalUserId)}`,
  )

/** What this store currently has on the shelf. */
export const storeStock = () => call('/Merchant/GetStoreStock')
