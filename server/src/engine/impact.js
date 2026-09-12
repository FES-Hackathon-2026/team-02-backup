/**
 * Net impact, never gross.
 *
 * Ported from `app/src/lib/impact.ts`, which is now a dead letter: the
 * server is the authority, because a number the client computed is a number
 * the client could have computed differently.
 *
 * The one idea worth keeping straight: the travel an action causes is
 * subtracted from what the action saves. A rescue that needs a car ride
 * across town can cost more than it saves, and when it does we say so
 * instead of paying for it.
 *
 * Two honesty rules hold everywhere below:
 *   - we claim a CO2 saving only where we have a factor we can defend.
 *     Cleaning a corner or booking a collection saves something real, but
 *     not something we can put a kilogram on, so we claim zero and say why.
 *   - we still charge the travel for those actions. Asymmetric on purpose:
 *     the uncertain half is the one we leave out.
 */
import { A, FACTORS, km, n, nShort } from './assumptions.js'

/** How we price a kilometre, per mode. */
export const MODES = {
  walk: { id: 'walk', label: 'zu Fuß', co2PerKm: A.bikeCo2PerKm, speedKmh: A.walkKmh },
  bike: { id: 'bike', label: 'Rad', co2PerKm: A.bikeCo2PerKm, speedKmh: 14 },
  transit: { id: 'transit', label: 'ÖPNV', co2PerKm: A.transitCo2PerKm, speedKmh: 22 },
  car: { id: 'car', label: 'Pkw', co2PerKm: A.carCo2PerKm, speedKmh: 22 },
}

/**
 * What we assume when nobody told us how they travelled.
 *
 * Short trips are walked; anything further is charged as OPNV. Never as a
 * car — assuming the worst mode would let us invent a penalty the person
 * never earned.
 */
export function assumedMode(straightKm) {
  return straightKm <= A.walkThresholdKm ? 'walk' : 'transit'
}

/**
 * Kilometres we charge for.
 *
 * A dedicated trip is straight-line x Umwegfaktor x 2. A stop on a route
 * that happens anyway costs only the detour, once — that is what makes
 * "liegt auf deinem Weg" worth something.
 */
export function travelKm({ straightKm = 0, detourKm }) {
  const marginal = detourKm !== undefined && detourKm !== null
  return marginal ? detourKm * A.detourFactor : straightKm * A.detourFactor * A.roundTrip
}

/**
 * The CO2 an action saves, by kind. `null` means: we do not claim a saving
 * for this kind of action, and the receipt says that in words.
 */
export function savingFor(kind, facts = {}) {
  switch (kind) {
    case 'food': {
      // Nobody weighs a rescue. Without a stated amount we use the disclosed
      // average basket and label the whole line as an estimate.
      const kg = facts.kg > 0 ? facts.kg : A.foodBasketKg
      const how = facts.kg > 0 ? 'gerettete Lebensmittel' : 'gerettete Lebensmittel (mittlerer Korb)'
      return {
        co2: kg * A.foodCo2PerKg,
        basis: `${nShort(kg, 1)} kg ${how} × ${nShort(A.foodCo2PerKg, 1)} kg CO₂e je kg`,
        factor: 'foodCo2PerKg',
      }
    }
    case 'vytal': {
      const uses = facts.uses ?? 1
      return {
        co2: uses * A.cupCo2,
        basis: `${uses} × vermiedener Einwegbehälter × ${n(A.cupCo2, 3)} kg CO₂e`,
        factor: 'cupCo2',
      }
    }
    case 'market':
      // Halved on purpose: a handover has two sides and both are credited.
      // Counting the whole saving twice would inflate the city total.
      return {
        co2: A.reuseCo2PerItem / 2,
        basis:
          `ein weitergegebenes Gerät × ${nShort(A.reuseCo2PerItem, 0)} kg CO₂e, ` +
          'je zur Hälfte auf beide Seiten der Übergabe',
        factor: 'reuseCo2PerItem',
      }
    default:
      // quest, pickup, review: real value, but not a kilogram we can defend.
      return null
  }
}

/**
 * Does this kind of action make someone travel?
 *
 * Charging a trip that nobody took would be as dishonest as ignoring one
 * that happened. FES drives to you, a peer review happens on the sofa, a
 * Vytal container goes back where you already are — none of those cost a
 * kilometre. Going to a quest or to a rescue does, and in the marketplace
 * only the person collecting the item travels; the owner stays home.
 */
export function causesTravel(kind, userId, subject) {
  switch (kind) {
    case 'quest':
    case 'food':
      return true
    case 'market':
      return subject?.ref?.user_id !== undefined && subject.ref.user_id !== userId
    default:
      return false
  }
}

/**
 * @param {object} args
 * @param {string} args.kind
 * @param {number} [args.straightKm]  straight-line distance to the place
 * @param {number} [args.detourKm]    extra distance when it sits on an existing route
 * @param {string} [args.mode]        stated mode; otherwise assumed from the distance
 * @param {object} [args.facts]       kg, uses — whatever the kind needs
 */
export function calcImpact({ kind, straightKm, detourKm, mode, facts = {} }) {
  const marginal = detourKm !== undefined && detourKm !== null
  const distance = marginal ? detourKm : (straightKm ?? 0)
  const usedMode = mode && MODES[mode] ? mode : assumedMode(distance)
  const km = travelKm({ straightKm: straightKm ?? 0, detourKm })
  const travelCo2 = km * MODES[usedMode].co2PerKm

  const saving = savingFor(kind, facts)
  const savedCo2 = saving ? saving.co2 : null

  return {
    savedCo2,
    savedBasis: saving ? saving.basis : null,
    savedFactor: saving ? saving.factor : null,
    straightKm: straightKm ?? null,
    routeKm: km,
    mode: usedMode,
    modeLabel: MODES[usedMode].label,
    modeAssumed: !(mode && MODES[mode]),
    marginal,
    detourMinutes: marginal ? (detourKm / A.walkKmh) * 60 : null,
    travelCo2,
    netCo2: savedCo2 === null ? null : savedCo2 - travelCo2,
    negative: savedCo2 !== null && savedCo2 - travelCo2 <= 0,
  }
}

/**
 * The formula, written out the way it is shown on the receipt.
 *
 * Built here rather than in the client so that the sentence and the number
 * can never drift apart: the engine prints the arithmetic it actually did.
 */
export function formulaText(impact) {
  if (!impact) return 'Für diese Aktion war nichts zu rechnen.'
  const parts = []

  if (impact.routeKm > 0) {
    const chain = impact.marginal
      ? `${km(impact.routeKm / A.detourFactor)} Umweg × ${nShort(A.detourFactor, 1)} (Umwegfaktor)`
      : `${km(impact.straightKm ?? 0)} Luftlinie × ${nShort(A.detourFactor, 1)} (Umwegfaktor) × ${nShort(A.roundTrip, 0)} (hin und zurück)`

    const assumed = impact.modeAssumed
      ? impact.mode === 'walk'
        ? `, weil unter ${nShort(A.walkThresholdKm, 1)} km ein Fußweg angenommen wird`
        : ', Verkehrsmittel angenommen statt gemeldet'
      : ''

    parts.push(
      `${chain} = ${nShort(impact.routeKm, 2)} km × ${nShort(MODES[impact.mode].co2PerKm, 3)} kg/km ` +
        `(${impact.modeLabel}) = ${n(impact.travelCo2, 2)} kg CO₂e für die Anfahrt${assumed}`,
    )
  } else {
    parts.push(
      impact.travelReason === 'unknown'
        ? 'Keine Anfahrt verrechnet — zu diesem Vorgang liegt uns kein Ort vor'
        : 'Keine Anfahrt verrechnet — für diese Aktion fährt niemand eigens los',
    )
  }

  if (impact.savedCo2 !== null) {
    parts.push(`${impact.savedBasis} = ${n(impact.savedCo2, 2)} kg CO₂e gespart`)
    parts.push(
      `Netto ${n(impact.savedCo2, 2)} − ${n(impact.travelCo2, 2)} = ${n(impact.netCo2, 2)} kg CO₂e`,
    )
  } else {
    parts.push(
      'Für diese Art Aktion behaupten wir keine CO₂-Ersparnis — der Nutzen ist echt, ' +
        'aber nicht seriös in Kilogramm zu fassen' +
        (impact.travelCo2 > 0 ? '. Die Anfahrt ziehen wir trotzdem ab' : ''),
    )
  }

  return parts.join('. ') + '.'
}

/** The factors a given impact actually leaned on, for the receipt. */
export function factorsUsed(impact) {
  const ids = []
  if (impact.routeKm > 0) {
    ids.push('detourFactor')
    if (!impact.marginal) ids.push('roundTrip')
    if (impact.mode === 'transit') ids.push('transitCo2PerKm')
    if (impact.mode === 'car') ids.push('carCo2PerKm')
    if (impact.mode === 'walk' || impact.mode === 'bike') ids.push('walkThresholdKm')
  }
  if (impact.savedFactor) ids.push(impact.savedFactor)
  return [...new Set(ids)].map((id) => ({ id, ...FACTORS[id] }))
}
