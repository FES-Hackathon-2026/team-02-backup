import { VytalError } from './client.js'

/**
 * Vytal's public store directory.
 *
 * A different service from the merchant API and a different set of rules:
 * GraphQL at colugo.vytal.org, the literal string `ANONYMOUS` as the
 * Authorization header, and no token — store locations are public data.
 * It is the one part of this integration that needs no secret at all.
 *
 * Two queries, because they answer different questions. `storeSearch` takes
 * coordinates and returns stores around them in no particular order;
 * `nearestVytalStores` takes a geohash and returns them sorted, each with a
 * distance. The app wants the distance, so `nearby()` uses the second and
 * `search()` keeps the first for text queries.
 *
 * Note what this list is NOT: it is not where a ReMain user can hand a
 * container back. Our token belongs to one store, and a return books into
 * that store. These are real Vytal partners shown as what they are — the
 * places the container came from and the wider network it belongs to.
 */
const ENDPOINT = process.env.VYTAL_GRAPHQL_BASE ?? 'https://colugo.vytal.org/'

/** Store types that exist to take containers back rather than hand them out. */
export const RETURN_POINT_TYPES = [
  'RETURN_BOX',
  'SERVICED_RETURN_BOX_PAID',
  'SERVICED_RETURN_BOX_UNPAID',
]

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/**
 * Geohash of a position — what `nearestVytalStores` takes instead of a pair
 * of coordinates. The standard algorithm, written out rather than pulled in:
 * it is twenty lines and one dependency fewer to audit.
 */
export function geohash(lat, lon, precision = 9) {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  let hash = ''
  let bits = 0
  let bit = 0
  let even = true

  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2
      if (lon >= mid) {
        bits = bits * 2 + 1
        lonMin = mid
      } else {
        bits *= 2
        lonMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (lat >= mid) {
        bits = bits * 2 + 1
        latMin = mid
      } else {
        bits *= 2
        latMax = mid
      }
    }
    even = !even
    if (++bit === 5) {
      hash += BASE32[bits]
      bit = 0
      bits = 0
    }
  }
  return hash
}

/**
 * One GraphQL call.
 *
 * The error convention here is the interesting part: failures come back as
 * HTTP 200 with an `errors` array, so a plain `response.ok` check would sail
 * straight past `STORE_NOT_FOUND` and hand the app `data: null`.
 */
async function graphql(query, variables) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'ANONYMOUS' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new VytalError(
      502,
      'upstream_unreachable',
      'Das Vytal-Filialverzeichnis antwortet gerade nicht.',
      String(cause),
    )
  }

  if (!response.ok) {
    throw new VytalError(
      response.status,
      'store_directory_error',
      `Das Vytal-Filialverzeichnis antwortet mit ${response.status}.`,
    )
  }

  const body = await response.json().catch(() => null)
  if (body?.errors?.length) {
    throw new VytalError(
      502,
      String(body.errors[0]),
      'Das Vytal-Filialverzeichnis hat die Anfrage abgelehnt.',
      body.errors,
    )
  }
  return body?.data ?? null
}

const NEAREST = `query ($geokey: String!, $proximity: Int!, $filter: VytalStoreFilter) {
  nearestVytalStores(geokey: $geokey, proximity: $proximity, filter: $filter) {
    id name
    lonlat { latitude longitude }
    distance { distance unit }
    address { streetname streetno zip city }
  }
}`

const SEARCH = `query ($query: String!, $user_location: LonLatIn, $limit: Int, $offset: Int, $filter: VytalStoreFilter) {
  storeSearch(query: $query, user_location: $user_location, limit: $limit, offset: $offset, filter: $filter) {
    id name
    lonlat { latitude longitude }
    store {
      type location_name
      address { streetname streetno zip city }
      banner can_deliver can_preorder
      opening_hours_multi { day time }
    }
  }
}`

/** Metres, from whatever unit the directory used. */
function metres(distance) {
  if (!distance) return null
  const value = Number(distance.distance)
  if (!Number.isFinite(value)) return null
  return distance.unit === 'km' ? value * 1000 : value
}

const address = (a) =>
  a ? [[a.streetname, a.streetno].filter(Boolean).join(' '), [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null

/** Stores near a point, nearest first, each with a distance. */
export async function nearby({ lat, lon, radiusM = 5000, limit = 20, types } = {}) {
  const data = await graphql(NEAREST, {
    geokey: geohash(lat, lon),
    proximity: Math.round(radiusM),
    filter: { limit, ...(types?.length ? { types } : {}) },
  })

  return (data?.nearestVytalStores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lonlat?.latitude ?? null,
    lon: s.lonlat?.longitude ?? null,
    address: address(s.address),
    distanceM: metres(s.distance),
  }))
}

/** Stores by name, optionally around a point. Used by the search field. */
export async function search({ query = '', lat, lon, limit = 20, offset = 0, types } = {}) {
  const data = await graphql(SEARCH, {
    query,
    user_location: lat === undefined || lon === undefined ? null : { latitude: lat, longitude: lon },
    limit,
    offset,
    filter: types?.length ? { types } : {},
  })

  return (data?.storeSearch ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lonlat?.latitude ?? null,
    lon: s.lonlat?.longitude ?? null,
    type: s.store?.type ?? null,
    locationName: s.store?.location_name ?? null,
    address: address(s.store?.address),
    banner: s.store?.banner ?? null,
    openingHours: s.store?.opening_hours_multi ?? [],
  }))
}

/** Just the places that take containers back. */
export const returnPoints = (opts) => nearby({ ...opts, types: RETURN_POINT_TYPES })
