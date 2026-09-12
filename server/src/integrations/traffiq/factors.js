/** Transit and reward previews use the same factors as the ledger engine. */
import { A } from '../../engine/assumptions.js'

// Preserve the transit adapter's historic property name at this one boundary.
export const ASSUMPTIONS = { ...A, carCo2PerKg: A.carCo2PerKm }
export const usingFallbackAssumptions = false

/**
 * Speeds and emissions per travel mode. The speeds mirror TRAVEL_MODES in
 * app/src/lib/impact.ts; transit is never estimated from a speed here, it is
 * read out of the GTFS schedule, so its speed is only a last resort.
 */
export const MODES = {
  walk: { label: 'Zu Fuß', co2PerKm: 0, speedKmh: ASSUMPTIONS.walkKmh, icon: 'users' },
  bike: { label: 'Rad', co2PerKm: 0, speedKmh: 14, icon: 'route' },
  transit: { label: 'ÖPNV', co2PerKm: ASSUMPTIONS.transitCo2PerKm, speedKmh: 22, icon: 'truck' },
  car: { label: 'Auto', co2PerKm: ASSUMPTIONS.carCo2PerKg, speedKmh: 22, icon: 'truck' },
}

/* ------------------------------------------------------------------
   Two constants that belong to timetables, not to impact, so they stay
   here rather than in engine/assumptions.js.
   ------------------------------------------------------------------ */

/**
 * Minimum time to change between two lines at the same station. The feed has
 * no transfers.txt — the data catalogue lists it among the missing tables —
 * so this is our number and is printed wherever a change is shown.
 */
export const TRANSFER_SECONDS = 180

/** How far someone is assumed to be willing to walk to a stop. */
export const ACCESS_WALK_KM = 1.0

/** Round to two decimals for kg, one for km. */
export const kg = (v) => Math.round(v * 100) / 100
export const km = (v) => Math.round(v * 10) / 10
export const minutes = (seconds) => Math.max(1, Math.round(seconds / 60))
