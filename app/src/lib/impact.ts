/**
 * Impact and reward rules.
 *
 * Everything in ASSUMPTIONS is OUR choice, not data from any interface. The
 * brief requires that such values are documented and visibly separated from
 * confirmed data, so they live here alone and the UI labels anything derived
 * from them as an estimate.
 *
 * The one idea worth keeping straight: NET, not gross. Food rescued minus the
 * travel the rescue causes. If the travel costs more than the food saves, the
 * action earns nothing — and we say why.
 */

export const ASSUMPTIONS = {
  /** kg CO2e avoided per kg of rescued food (mixed basket) */
  foodCo2PerKg: 1.9,
  /** kg CO2e per km, private car */
  carCo2PerKg: 0.154,
  /** kg CO2e per km, local public transport */
  transitCo2PerKm: 0.078,
  /** straight-line distance -> actual route length */
  detourFactor: 1.3,
  /** a dedicated trip is there AND back */
  roundTrip: 2,
  /** walking speed used to express a detour in minutes */
  walkKmh: 4.5,

  /* reward rules */
  pointsPerKgCo2: 10,
  unverifiedWeight: 0.8,
  urgentHours: 6,
  urgentMultiplier: 1.25,
  repeatMultiplier: 0.5,
  scoredActionsPerDay: 3,
  pointsForOffering: 30,
} as const

export type TravelMode = 'walk' | 'bike' | 'transit' | 'car'

export const TRAVEL_MODES: Record<TravelMode, { co2PerKm: number; speedKmh: number }> = {
  walk: { co2PerKm: 0, speedKmh: 4.5 },
  bike: { co2PerKm: 0, speedKmh: 14 },
  transit: { co2PerKm: ASSUMPTIONS.transitCo2PerKm, speedKmh: 22 },
  car: { co2PerKm: ASSUMPTIONS.carCo2PerKg, speedKmh: 22 },
}

export interface LatLon {
  lat: number
  lon: number
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Extra distance a stop costs on an existing route from -> to.
 * This is what makes "on my way" work: a rescue on your commute is nearly
 * free, a rescue that needs a dedicated trip is not.
 */
export function detourKm(route: { from: LatLon; to: LatLon }, target: LatLon): number {
  const direct = haversineKm(route.from, route.to)
  const via = haversineKm(route.from, target) + haversineKm(target, route.to)
  return Math.max(0, via - direct)
}

export interface Impact {
  /** km that the calculation charged for */
  routeKm: number
  /** kg CO2e credited for the rescued food */
  foodCo2: number
  /** kg CO2e charged for getting there */
  travelCo2: number
  /** foodCo2 - travelCo2 */
  netCo2: number
  /** true when only a detour was charged rather than a whole dedicated trip */
  marginal: boolean
  /** detour expressed in walking minutes, when marginal */
  detourMinutes: number | null
}

export function calcImpact(args: {
  kg: number
  mode: TravelMode
  /** straight-line distance for a dedicated trip */
  distanceKm?: number
  /** extra distance when the target sits on an existing route */
  detourKm?: number
}): Impact {
  const { kg, mode } = args
  const marginal = args.detourKm !== undefined

  // On a route we charge the detour once: the trip happens anyway.
  // For a dedicated trip we charge there and back.
  const routeKm = marginal
    ? args.detourKm! * ASSUMPTIONS.detourFactor
    : (args.distanceKm ?? 0) * ASSUMPTIONS.detourFactor * ASSUMPTIONS.roundTrip

  const foodCo2 = kg * ASSUMPTIONS.foodCo2PerKg
  const travelCo2 = routeKm * TRAVEL_MODES[mode].co2PerKm

  return {
    routeKm,
    foodCo2,
    travelCo2,
    netCo2: foodCo2 - travelCo2,
    marginal,
    detourMinutes: marginal ? (args.detourKm! / ASSUMPTIONS.walkKmh) * 60 : null,
  }
}

export interface Reward {
  points: number
  /** true when the action is recorded but earns nothing */
  blocked: boolean
  /** plain-language trace of how the number was reached */
  reasons: string[]
}

export function calcReward(
  impact: Impact,
  ctx: {
    isVerified: boolean
    verificationStatus?: string
    /** basket expiring within ASSUMPTIONS.urgentHours */
    urgent?: boolean
    /** how many times this user already rescued here today */
    repeatsToday?: number
    /** how many scored actions the user already has today */
    scoredToday?: number
  },
): Reward {
  const A = ASSUMPTIONS

  if (impact.netCo2 <= 0) {
    return {
      points: 0,
      blocked: true,
      reasons: [
        `Travel (${impact.travelCo2.toFixed(2)} kg) costs more than the rescue saves ` +
          `(${impact.foodCo2.toFixed(2)} kg) — no points.`,
        `By bike or on foot this rescue would be worth ${impact.foodCo2.toFixed(2)} kg.`,
      ],
    }
  }

  const reasons: string[] = []
  let points = impact.netCo2 * A.pointsPerKgCo2
  reasons.push(
    `${impact.netCo2.toFixed(2)} kg × ${A.pointsPerKgCo2} = ${Math.round(points)} points base value`,
  )

  if (ctx.isVerified) {
    reasons.push('× 1.0 — user is verified (API)')
  } else {
    points *= A.unverifiedWeight
    reasons.push(`× ${A.unverifiedWeight} — verification level "${ctx.verificationStatus ?? '?'}" (API)`)
  }

  if (ctx.urgent) {
    points *= A.urgentMultiplier
    reasons.push(`× ${A.urgentMultiplier} — expires in under ${A.urgentHours} h (API: expires_at)`)
  }

  const repeats = ctx.repeatsToday ?? 0
  if (repeats >= 2) {
    points *= A.repeatMultiplier
    reasons.push(`× ${A.repeatMultiplier} — rescue number ${repeats + 1} at the same place today`)
  }

  if ((ctx.scoredToday ?? 0) >= A.scoredActionsPerDay) {
    points = 0
    reasons.push(`Daily limit of ${A.scoredActionsPerDay} scored actions reached — 0 points.`)
  }

  return { points: Math.round(points), blocked: false, reasons }
}

/**
 * Ranking score for the discovery list.
 * Net impact per unit of effort, with real urgency (expires_at) pushed up.
 * Effort is minutes: detour minutes on a route, travel minutes otherwise.
 */
export function relevanceScore(args: {
  netCo2: number
  effortMinutes: number
  hoursUntilExpiry?: number | null
  isOwn?: boolean
  needsVerificationButUnverified?: boolean
}): number {
  if (args.isOwn) return 0
  let score = Math.max(args.netCo2, 0) / (1 + args.effortMinutes / 8)
  const h = args.hoursUntilExpiry
  if (h !== null && h !== undefined) {
    score *= h < 2 ? 2.2 : h < ASSUMPTIONS.urgentHours ? 1.5 : 1
  }
  if (args.needsVerificationButUnverified) score *= 0.15
  return score
}
