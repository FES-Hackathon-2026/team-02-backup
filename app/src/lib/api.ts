/**
 * Thin typed client for the foodsharing hackathon API.
 *
 * Two things this deliberately does NOT do:
 *  - throw on 4xx. The brief wants rejections shown to the user with their
 *    reason, so every call returns the status and lets callers decide.
 *  - hide the request. Each call is recorded in a log the UI can display,
 *    because "the proof comes from the server" is the core of the pitch.
 */

import { API_BASE, getApiKey } from './config'
import type {
  Basket,
  Business,
  FoodSharePoint,
  Pickup,
  PickupSource,
  SamplePickup,
  User,
  Verification,
} from './types'

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  /** human-readable reason, already flattened out of FastAPI's `detail` */
  error: string | null
}

export interface LogEntry {
  method: string
  path: string
  status: number
  ms: number
  at: string
  userId: number | null
}

const log: LogEntry[] = []
const listeners = new Set<() => void>()

export function getLog(): readonly LogEntry[] {
  return log
}

export function subscribeToLog(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function record(entry: LogEntry): void {
  log.unshift(entry)
  if (log.length > 100) log.pop()
  listeners.forEach((fn) => fn())
}

function flattenError(status: number, body: unknown): string | null {
  if (status >= 200 && status < 300) return null
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const d = detail as { error?: string; message?: string }
    const parts = [d.error, d.message].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return `HTTP ${status}`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  /** send X-User-ID; omit for endpoints that ignore it */
  userId?: number | null
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, userId = null, signal } = opts

  const headers: Record<string, string> = {}
  const key = getApiKey()
  if (key) headers['X-API-Key'] = key
  if (userId !== null) headers['X-User-ID'] = String(userId)
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const started = performance.now()
  let status = 0
  let parsed: unknown = null

  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    status = res.status
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
  } catch (err) {
    record({
      method,
      path,
      status: 0,
      ms: Math.round(performance.now() - started),
      at: new Date().toISOString(),
      userId,
    })
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, data: null, error: `Network error: ${message}` }
  }

  record({
    method,
    path,
    status,
    ms: Math.round(performance.now() - started),
    at: new Date().toISOString(),
    userId,
  })

  const ok = status >= 200 && status < 300
  return { ok, status, data: ok ? (parsed as T) : null, error: flattenError(status, parsed) }
}

/* ---------------------------------------------------------------- reads */

export const listUsers = () => request<User[]>('/users')

export const getMe = (userId: number) => request<User>('/users/me', { userId })

export const listFoodSharePoints = (near?: { lat: number; lon: number; distanceKm?: number }) => {
  if (!near) return request<FoodSharePoint[]>('/food-share-points')
  const q = new URLSearchParams({
    lat: String(near.lat),
    lon: String(near.lon),
    distance_km: String(near.distanceKm ?? 10),
  })
  return request<FoodSharePoint[]>(`/food-share-points?${q}`)
}

export const listBusinesses = () => request<Business[]>('/businesses')

/** Only free, unexpired baskets. lat/lon are required by the API. */
export const listNearbyBaskets = (lat: number, lon: number, distanceKm = 5) => {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    distance_km: String(distanceKm),
  })
  return request<Basket[]>(`/baskets/nearby?${q}`)
}

export const getBasket = (basketId: number) => request<Basket>(`/baskets/${basketId}`)

export const listMyPickups = (userId: number, limit = 100) =>
  request<Pickup[]>(`/users/me/pickups?limit=${limit}`, { userId })

export const listSamplePickups = (opts: { limit?: number; source?: PickupSource } = {}) => {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 200) })
  if (opts.source) q.set('source', opts.source)
  return request<SamplePickup[]>(`/pickups/sample?${q}`)
}

/* --------------------------------------------------------------- writes */

export const offerBasket = (
  userId: number,
  basket: {
    title: string
    lat: number
    lon: number
    description?: string
    food_types?: string[]
    expires_in_hours?: number
  },
) => request<Basket>('/baskets', { method: 'POST', body: basket, userId })

/** Reserves the basket for this user — the API locks out everyone else. */
export const requestBasket = (userId: number, basketId: number, message?: string) =>
  request<{ requester_id: number; status: string; requested_at: string }>(
    `/baskets/${basketId}/requests`,
    { method: 'POST', body: message ? { message } : {}, userId },
  )

export const setRequestStatus = (
  userId: number,
  basketId: number,
  requesterId: number,
  status: 'accepted' | 'rejected' | 'cancelled' | 'picked_up',
) =>
  request(`/baskets/${basketId}/requests/${requesterId}/status`, {
    method: 'PATCH',
    body: { status },
    userId,
  })

/** Exactly one source must be given, otherwise the API answers 422. */
export const completePickup = (
  userId: number,
  source: { basket_id: number } | { food_share_point_id: number },
) => request<Pickup>('/pickups', { method: 'POST', body: source, userId })

/** Requires is_verified — otherwise 403 with the reason in `error`. */
export const rescueFromBusiness = (userId: number, businessId: number) =>
  request<Pickup>(`/businesses/${businessId}/pickups`, { method: 'POST', userId })

export const getVerification = (userId: number) =>
  request<Verification>(`/users/${userId}/verification`)

/** Test-only shortcut the sandbox exposes to simulate the real onboarding. */
export const patchVerification = (
  userId: number,
  patch: Partial<Pick<Verification, 'quiz_passed' | 'trial_pickups_completed' | 'mentor_approved'>>,
) => request<Verification>(`/users/${userId}/verification`, { method: 'PATCH', body: patch })
