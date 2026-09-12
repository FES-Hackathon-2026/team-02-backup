/**
 * foodsharing Hackathon-API — server-side client.
 *
 * `routes/food.js` proxies reads straight to the browser and that stays the
 * way the app looks around. This module exists for the other half: the calls
 * whose result has to be *believed* by our own ledger.
 *
 * A pickup is the only moment in the whole product where an outside system
 * confirms our word. If the browser did the pickup and then told the server
 * "credit me", the server would be trusting a claim. So the server makes the
 * call itself, reads the `pickup_id` and `picked_up_at` out of the response,
 * and only then writes to the ledger. That is what lets the receipt say
 * `bestätigt` without qualification.
 *
 * The key never leaves this process — see server/.env, FS_API_KEY.
 */
const BASE = process.env.FS_API_BASE ?? 'https://app-foodsharing-hackathon.azurewebsites.net'
const KEY = process.env.FS_API_KEY ?? ''

export const hasKey = () => KEY !== ''

/** Thrown for every non-2xx answer, already translated. */
export class FoodsharingError extends Error {
  constructor(status, code, message, detail) {
    super(message)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

/**
 * The German sentence for each status the API actually produces.
 * Taken from API-GUIDE.md §8 — these are the documented meanings, not
 * guesses, which is why the app can show them instead of a raw code.
 */
const MESSAGE = {
  400: 'Das ist dein eigener Korb — den kannst du nicht selbst abholen.',
  401: 'Der foodsharing-Schlüssel wird nicht akzeptiert.',
  403: 'Dafür fehlt die foodsharing-Verifikation.',
  404: 'Das gibt es bei foodsharing nicht (mehr).',
  409: 'Schon vergeben, schon abgeholt oder abgelaufen.',
  422: 'Die Anfrage passt nicht zu dem, was die Schnittstelle erwartet.',
  503: 'Die foodsharing-API ist gerade nicht bereit.',
}

const CODE = {
  400: 'own_basket',
  401: 'bad_key',
  403: 'not_verified',
  404: 'gone',
  409: 'taken',
  422: 'invalid',
  503: 'upstream_not_ready',
}

/**
 * One call. `as` is the foodsharing test user acting — the team has two, and
 * which one acts decides whether a Geschäftsrettung is allowed.
 */
export async function call(path, { method = 'GET', body, as } = {}) {
  if (!KEY) {
    throw new FoodsharingError(
      503,
      'no_key',
      'Auf dem Server ist kein foodsharing-Schlüssel hinterlegt (FS_API_KEY).',
    )
  }

  const headers = { 'X-API-Key': KEY, Accept: 'application/json' }
  if (as !== undefined && as !== null) headers['X-User-ID'] = String(as)
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    })
  } catch (cause) {
    throw new FoodsharingError(
      502,
      'upstream_unreachable',
      'Die foodsharing-API antwortet gerade nicht.',
      String(cause),
    )
  }

  const text = await response.text()
  const data = text === '' ? null : safeJson(text)

  if (!response.ok) {
    // FastAPI puts everything under `detail`; a verification refusal carries
    // the whole verification object there, which the screen shows verbatim.
    const detail = data?.detail ?? data ?? null
    throw new FoodsharingError(
      response.status,
      detail?.error ?? CODE[response.status] ?? 'upstream_error',
      MESSAGE[response.status] ?? `foodsharing antwortet mit ${response.status}.`,
      detail,
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
   The calls we make. Thin on purpose: field names stay exactly as the
   partner spells them until the route shapes them for the app, so a
   diff against SCHEMA.md is a diff against one file.
   ------------------------------------------------------------------ */

export const users = () => call('/users')

export const me = (as) => call('/users/me', { as })

export const history = (as, limit = 50) =>
  call(`/users/me/pickups?limit=${limit}`, { as })

export const foodSharePoints = (lat, lon, distanceKm = 8) =>
  call(`/food-share-points?lat=${lat}&lon=${lon}&distance_km=${distanceKm}`)

export const basketsNearby = (lat, lon, distanceKm = 20) =>
  call(`/baskets/nearby?lat=${lat}&lon=${lon}&distance_km=${distanceKm}`)

export const basket = (basketId) => call(`/baskets/${basketId}`)

export const businesses = () => call('/businesses')

export const requestBasket = (basketId, as, message) =>
  call(`/baskets/${basketId}/requests`, {
    method: 'POST',
    as,
    body: message ? { message } : {},
  })

/** Fairteiler or Korb — exactly one source, per PickupCreate. */
export const pickup = (source, as) => call('/pickups', { method: 'POST', as, body: source })

/** Geschäftsrettung — needs a verified acting user, takes no body. */
export const businessPickup = (businessId, as) =>
  call(`/businesses/${businessId}/pickups`, { method: 'POST', as })
