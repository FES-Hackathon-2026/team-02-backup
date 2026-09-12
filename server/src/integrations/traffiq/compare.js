/**
 * The four ways to get to an action, side by side.
 *
 * Everything the screen shows is built here, including the sentence that
 * explains each number. The rule is that no figure leaves this file without
 * the arithmetic that produced it: `formula` is the printable version of the
 * exact expression a line above computed, so nobody has to trust the result.
 *
 * This file awards nothing. `engine/award.js` remains the only place XP and
 * coins come into existence; what is returned here is a forecast of what the
 * journey does to the credit, so a person can choose before they set off.
 */

import { distanceKm } from '../../db.js'
import {
  ASSUMPTIONS,
  MODES,
  kg,
  km,
  minutes,
} from './factors.js'
import * as gtfs from './gtfs.js'

const nf = (v, digits = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/**
 * Travel CO2 for a distance, there and back.
 *
 * Round trip on purpose: you come home again, and the engine's net rule
 * charges the whole journey an action causes, not half of it. The factor is
 * printed alongside so the doubling is never a surprise.
 */
function travelCo2(straightKm, mode) {
  const routeKm = straightKm * ASSUMPTIONS.detourFactor * ASSUMPTIONS.roundTrip
  const co2 = routeKm * MODES[mode].co2PerKm
  return { routeKm, co2 }
}

function option({ mode, straightKm, seconds, detail, note, legs }) {
  const { routeKm, co2 } = travelCo2(straightKm, mode)
  const m = MODES[mode]
  /** what you actually travel to get there — half of what the CO2 is charged on */
  const oneWayKm = straightKm * ASSUMPTIONS.detourFactor

  const formula =
    m.co2PerKm === 0
      ? `${nf(straightKm, 1)} km × ${nf(ASSUMPTIONS.detourFactor, 1)} Umwegfaktor × ${ASSUMPTIONS.roundTrip} (hin und zurück) × 0 kg/km = 0 kg CO₂e`
      : `${nf(straightKm, 1)} km × ${nf(ASSUMPTIONS.detourFactor, 1)} Umwegfaktor × ${ASSUMPTIONS.roundTrip} (hin und zurück) × ${nf(m.co2PerKm, 3)} kg/km = ${nf(co2)} kg CO₂e`

  /**
   * What the journey does to the action's credit.
   *
   * Travelling never earns anything in either direction — it can only cost.
   * `deducted` is the net rule from the plan: the CO2 of getting there comes
   * off the action's XP. The same deduction applies to every transport mode.
   */
  const deducted = Math.round(co2 * ASSUMPTIONS.pointsPerKgCo2)

  const xp = deducted === 0
        ? {
            effect: 'full',
            deducted: 0,
            text: 'volle Gutschrift',
            reason: 'Kein CO₂e auf dem Weg, also wird auch nichts abgezogen. Die Aktion zählt voll.',
          }
        : {
            effect: 'reduced',
            deducted,
            text: `−${deducted} XP`,
            reason:
              `${nf(co2)} kg CO₂e × ${ASSUMPTIONS.pointsPerKgCo2} XP/kg = ${deducted} XP werden von der ` +
              'Gutschrift der Aktion abgezogen — die Anfahrt zählt netto, nicht brutto.',
          }

  return {
    mode,
    label: m.label,
    icon: m.icon,
    minutes: minutes(seconds),
    seconds,
    /** the way there, matching `minutes` */
    km: km(oneWayKm),
    /** what the CO2 was charged on: there and back */
    co2Km: km(routeKm),
    co2Kg: kg(co2),
    co2Note: 'Hin- und Rückweg, denn die Aktion verursacht beide.',
    formula,
    detail,
    note: note ?? null,
    legs: legs ?? null,
    xp,
    // Every number in this object is computed from a printed assumption.
    tier: 'estimated',
  }
}

/**
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @param {number} [at] seconds into the operating day
 * @param {number|null} [baseXp] the XP the action itself is worth, when known
 */
export function compare({ from, to, at = gtfs.secondsOfDay(), baseXp = null }) {
  const straightKm = distanceKm(from, to)

  const walkSeconds = Math.round(
    ((straightKm * ASSUMPTIONS.detourFactor) / MODES.walk.speedKmh) * 3600,
  )
  const bikeSeconds = Math.round(
    ((straightKm * ASSUMPTIONS.detourFactor) / MODES.bike.speedKmh) * 3600,
  )
  const carSeconds = Math.round(
    ((straightKm * ASSUMPTIONS.detourFactor) / MODES.car.speedKmh) * 3600,
  )

  const options = []

  /* --- ÖPNV, out of the schedule --- */
  const trip = gtfs.plan({ from, to, at })
  if (trip !== null) {
    const rides = trip.legs.filter((l) => l.kind === 'ride')
    options.push(
      option({
        mode: 'transit',
        // only the ridden kilometres emit; walking to and from the stop does not.
        // trip.rideKm already carries the detour factor, so it is taken back out
        // here and applied once inside option() like every other mode.
        straightKm: trip.rideKm / ASSUMPTIONS.detourFactor,
        seconds: trip.arriveAt - at,
        detail:
          rides.map((r) => `${r.line} → ${r.headsign}`).join(' · ') +
          (trip.changes > 0 ? ` · ${trip.changes}× umsteigen` : ' · ohne Umstieg'),
        note:
          `${minutes(trip.walkSeconds)} Min zu Fuß, ${minutes(trip.waitSeconds)} Min warten, ` +
          `${minutes(trip.rideSeconds)} Min Fahrt. Abfahrt ${rides[0].departTime} ab ${rides[0].from}.`,
        legs: trip.legs,
      }),
    )
  }

  /* --- bike --- */
  options.push(
    option({
      mode: 'bike',
      straightKm,
      seconds: bikeSeconds,
      detail: `${nf(straightKm * ASSUMPTIONS.detourFactor, 1)} km bei ${MODES.bike.speedKmh} km/h`,
      note: 'Keine Emissionen auf dem Weg — die Aktion behält ihre volle Gutschrift.',
    }),
  )

  /* --- on foot --- */
  options.push(
    option({
      mode: 'walk',
      straightKm,
      seconds: walkSeconds,
      detail: `${nf(straightKm * ASSUMPTIONS.detourFactor, 1)} km bei ${nf(MODES.walk.speedKmh, 1)} km/h`,
      note:
        walkSeconds > 45 * 60
          ? 'Weit zu Fuß — nur ehrlichkeitshalber mit aufgeführt.'
          : 'Keine Emissionen auf dem Weg — die Aktion behält ihre volle Gutschrift.',
    }),
  )

  /* --- car, shown openly and scored at zero --- */
  options.push(
    option({
      mode: 'car',
      straightKm,
      seconds: carSeconds,
      detail: `${nf(straightKm * ASSUMPTIONS.detourFactor, 1)} km, Parken nicht eingerechnet`,
      note: 'Fahrzeit ohne Parkplatzsuche — in der Innenstadt eher zu optimistisch.',
    }),
  )

  /* --- the difference each option makes against the car --- */
  const car = options.find((o) => o.mode === 'car')
  for (const o of options) {
    o.savedVsCarKg = kg(car.co2Kg - o.co2Kg)
    o.savedVsCarText =
      o.mode === 'car'
        ? 'Das ist der Vergleichswert.'
        : `${nf(o.savedVsCarKg)} kg CO₂e weniger als mit dem Auto`

    // With the action's own XP known, the deduction becomes a real number
    // rather than an abstraction. It is a forecast: the credit itself is only
    // ever created by engine/award.js, after the proof.
    if (baseXp !== null) {
      o.xp.baseXp = baseXp
      o.xp.resultXp = Math.max(0, baseXp - o.xp.deducted)
      if (o.xp.resultXp === 0) o.xp.effect = 'none'
      o.xp.text =
        o.xp.effect === 'none'
          ? `0 von ${baseXp} XP`
          : `${o.xp.resultXp} von ${baseXp} XP`
    }
  }

  options.sort((a, b) => a.co2Kg - b.co2Kg || a.seconds - b.seconds)

  return {
    from,
    to,
    directKm: km(straightKm),
    at,
    atTime: gtfs.clock(at),
    options,
    best: options[0].mode,
    schedule: trip === null ? null : {
      serviceDate: gtfs.stats.serviceDate,
      note:
        'Fahrplan aus dem gelieferten RMV-Export, Betriebstag ' +
        `${gtfs.stats.serviceDate?.replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')} (Montag). ` +
        'Gültigkeit des Datensatzes: 12.07.–13.12.2025. Kein Echtzeitbetrieb, keine Verspätungen.',
      // Said out loud rather than hidden: quer durch die Stadt kann die echte
      // Auskunft schneller sein, weil sie zweimal umsteigen darf.
      limitation: 'Die Suche steigt höchstens einmal um. Für lange Wege quer durch Frankfurt ist das eine Obergrenze, keine Bestzeit.',
      tier: 'confirmed',
    },
    assumptions: {
      source: 'Offengelegte ReMain-Annahmen (siehe Nachweis)',
      detourFactor: ASSUMPTIONS.detourFactor,
      roundTrip: ASSUMPTIONS.roundTrip,
      carCo2PerKm: ASSUMPTIONS.carCo2PerKg,
      transitCo2PerKm: ASSUMPTIONS.transitCo2PerKm,
      pointsPerKgCo2: ASSUMPTIONS.pointsPerKgCo2,
      note:
        'Alle CO₂-Werte sind Schätzungen aus diesen offengelegten Faktoren, keine Messwerte. ' +
        'Die Fahrzeit im ÖPNV stammt dagegen aus dem echten Fahrplan.',
    },
    xpNote:
      'Die Punktwirkung ist eine Vorschau. Gutgeschrieben wird erst nach dem Nachweis, ' +
      'und zwar ausschließlich von der Engine — dieser Bildschirm vergibt nichts.',
  }
}
