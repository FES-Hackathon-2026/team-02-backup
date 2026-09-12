/**
 * Which rescue is worth doing next.
 *
 * Sorting by distance answers the wrong question. The nearest Fairteiler may
 * hold nothing urgent while a basket three kilometres away expires in two
 * hours. So the list is ordered by **net effect per minute of effort**, and
 * every number it uses is printed next to it — this is a `Schätzung`, never a
 * measurement, and the app says so at every value.
 *
 *   score = (gerettetes CO₂e − Anfahrts-CO₂e) × Dringlichkeit / Aufwandsminuten
 *
 * What the partner does NOT tell us is the amount of food: the foodsharing API
 * has no weight field (see SCHEMA.md). So the mass is an openly stated
 * assumption per source type, not a reading. Everything downstream inherits
 * that — which is exactly why it may never be labelled `bestätigt`.
 *
 * Phase 3 owns `engine/assumptions.js`, the single place CO₂ factors are meant
 * to live. These four constants belong there once it exists; they are here so
 * phase 9 does not write into a file another session owns.
 */

/** Rough mass of one rescue, in kg. Order of magnitude, openly assumed. */
const KG = {
  food_share_point: 1.5,
  basket: 2.5,
  business: 8,
}

/** kg CO₂e avoided per kg of rescued food — mixed basket, team assumption. */
const CO2E_PER_KG = 2.1

/** Minutes of handling on top of the walk, per source type. */
const HANDLING_MIN = {
  food_share_point: 4,
  basket: 10,
  business: 25,
}

/** Speeds and the travel factor. Below 2 km on foot, above that by bike. */
const WALK_KMH = 4.6
const BIKE_KMH = 14
/** Beyond this we stop pretending it is a walk and subtract a tram ride. */
const TRANSIT_FROM_KM = 6
/** kg CO₂e per person-kilometre, local public transport — team assumption. */
const TRANSIT_CO2E_PER_KM = 0.055

/** German decimals everywhere a number is shown to a person. */
const de = (value, digits = 1) =>
  value.toLocaleString('de-DE', { maximumFractionDigits: digits })

export const ASSUMPTIONS = [
  `Menge je Abholung: Fairteiler ${de(KG.food_share_point)} kg, Korb ${de(KG.basket)} kg, Geschäftsrettung ${de(KG.business)} kg — Annahme, die Schnittstelle nennt keine Menge.`,
  `${de(CO2E_PER_KG)} kg CO₂e je kg geretteter Lebensmittel (Mischwarenkorb) — Annahme.`,
  `Weg: bis 2 km zu Fuß (${de(WALK_KMH)} km/h), darüber mit dem Rad (${de(BIKE_KMH)} km/h).`,
  `Ab ${de(TRANSIT_FROM_KM)} km wird eine Nahverkehrsfahrt angenommen und mit ${de(TRANSIT_CO2E_PER_KM, 3)} kg CO₂e je km abgezogen.`,
  'Dringlichkeit: läuft ein Korb in unter 3 h ab, zählt er 1,5-fach; unter 12 h 1,3-fach; unter 24 h 1,15-fach.',
]

const round = (n, digits = 2) => Number(n.toFixed(digits))

/** Minutes to get there, one way. */
function travelMinutes(km) {
  const speed = km <= 2 ? WALK_KMH : BIKE_KMH
  return (km / speed) * 60
}

/** Soon-to-expire baskets count for more. Returns 1 when nothing expires. */
export function urgency(expiresAt, at = Date.now()) {
  if (!expiresAt) return { factor: 1, hoursLeft: null }
  const hoursLeft = (new Date(expiresAt).getTime() - at) / 3_600_000
  if (!Number.isFinite(hoursLeft)) return { factor: 1, hoursLeft: null }
  const factor = hoursLeft <= 3 ? 1.5 : hoursLeft <= 12 ? 1.3 : hoursLeft <= 24 ? 1.15 : 1
  return { factor, hoursLeft: round(hoursLeft, 1) }
}

/**
 * Scores one candidate.
 *
 * @param {'food_share_point'|'basket'|'business'} source
 * @param {number|null} distanceKm  null when we do not know where the person is
 * @param {string|null} expiresAt
 */
export function score(source, distanceKm, expiresAt, at = Date.now()) {
  const km = distanceKm ?? 3
  const kg = KG[source] ?? 1.5
  const rescued = kg * CO2E_PER_KG
  const travelCo2e = km >= TRANSIT_FROM_KM ? km * TRANSIT_CO2E_PER_KM : 0
  const net = rescued - travelCo2e

  const minutes = travelMinutes(km) + (HANDLING_MIN[source] ?? 5)
  const { factor, hoursLeft } = urgency(expiresAt, at)

  return {
    kg,
    co2eRescued: round(rescued),
    co2eTravel: round(travelCo2e),
    co2eNet: round(net),
    minutes: Math.round(minutes),
    urgencyFactor: factor,
    hoursLeft,
    /** kg CO₂e per minute of effort — the sort key, nothing else. */
    score: round((net * factor) / minutes, 4),
    /** One sentence, German, ready to render under the title. */
    why: sentence(net, Math.round(minutes), factor, hoursLeft),
  }
}

function sentence(net, minutes, factor, hoursLeft) {
  const co2e = `≈ ${net.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg CO₂e`
  const effort = `${minutes} Min Aufwand`
  if (factor > 1 && hoursLeft !== null) {
    const rest =
      hoursLeft < 1
        ? 'läuft in unter einer Stunde ab'
        : `läuft in ${Math.round(hoursLeft)} h ab`
    return `${co2e} für ${effort} · ${rest}`
  }
  return `${co2e} für ${effort}`
}

/** Highest net effect per minute first. */
export const byRelevance = (a, b) => b.score - a.score
