/**
 * The CO2 and reward factors this phase uses, and where they come from.
 *
 * Phase 3 owns `server/src/engine/assumptions.js`. When it lands, everything
 * here reads from it and this file keeps only the two constants that are
 * genuinely about timetables rather than about impact.
 *
 * Until then the fallback below repeats — value for value, name for name —
 * the ASSUMPTIONS block that already lives in `app/src/lib/impact.ts`, which
 * is the file phase 3 is porting. That is deliberately a bridge and not a
 * second opinion: no number here was invented by phase 8, and the moment
 * engine/assumptions.js exports ASSUMPTIONS the fallback stops being read.
 */

/* eslint-disable no-empty */
let engine = null
try {
  engine = await import('../../engine/assumptions.js')
} catch {
  // phase 3 has not landed yet
}

/** Mirrors app/src/lib/impact.ts — do not edit here, edit there (or in phase 3). */
const FALLBACK = {
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
  pointsPerKgCo2: 10,
}

export const ASSUMPTIONS = engine?.ASSUMPTIONS ?? FALLBACK

/** true while phase 3's file is still missing — the API says so in its response. */
export const usingFallbackAssumptions = engine?.ASSUMPTIONS === undefined

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

/**
 * The one reward rule this phase carries. The screen never awards anything —
 * `engine/award.js` stays the only place points come into existence — but it
 * has to be able to say in advance what the journey does to the credit, and
 * for the car the answer is nothing.
 *
 * Stated openly rather than hidden in arithmetic: driving to a sustainability
 * action is not scored. The CO2 of the drive is shown next to it so the number
 * can be checked, and the alternative that keeps the full credit is named.
 */
export const CAR_EARNS_NOTHING = {
  xp: 0,
  text: '0 XP für die Aktion',
  /** @param {string} co2 the journey's CO2, already formatted */
  reason: (co2) =>
    'Regel: Wer mit dem Auto zu einer Aktion fährt, bekommt dafür keine Punkte. Sonst würde ' +
    `ReMain eine Fahrt bezahlen, die ${co2} kg CO₂e ausstößt. Die Fahrt steht trotzdem hier — ` +
    'verschwiegen wäre sie ja nicht weg. Zu Fuß, mit dem Rad oder mit dem ÖPNV bleibt die Gutschrift.',
}

/** Round to two decimals for kg, one for km. */
export const kg = (v) => Math.round(v * 100) / 100
export const km = (v) => Math.round(v * 10) / 10
export const minutes = (seconds) => Math.max(1, Math.round(seconds / 60))
