import { addDays, formatDe, hash, holidayName, isHoliday, shiftToWorkingDay, today, weekday, weekdayShort } from './dates.js'

/**
 * FES Abfuhrkalender — the collection calendar, rebuilt.
 *
 * The real one lives at <https://frankfurtplus.de/abfallkalender> and is keyed
 * by address, not by Stadtteil: FES knows which round a single house is on.
 * It also publishes /abfallkalender/{address}/ical and /{address}/html, which
 * is the seam this file is shaped to fit — see INTEGRATION.md.
 *
 * Without that key the honest fallback is one round per Stadtteil, derived
 * from the district id so it is stable across restarts. The CYCLES are the
 * real Frankfurt ones; the WEEKDAY and the phase of the cycle are invented,
 * and every response says so.
 */

export const SOURCE = 'simulated'

/**
 * The five fractions the app shows. `cycleDays` is how often FES collects;
 * `annahme` is the sentence the app prints when someone asks where the date
 * comes from.
 */
const FRAKTIONEN = [
  {
    id: 'rest',
    name: 'Restmüll',
    cycleDays: 7,
    window: 'ab 06:00 Uhr',
    annahme: 'Restmüll wird in Frankfurt wöchentlich geleert; der Wochentag ist hier nachgebaut.',
  },
  {
    id: 'bio',
    name: 'Biotonne',
    cycleDays: 7,
    window: 'ab 06:00 Uhr',
    annahme: 'Biotonne wöchentlich — im Sommer die eng getaktete Fraktion, hier ganzjährig.',
  },
  {
    id: 'papier',
    name: 'Altpapier',
    cycleDays: 28,
    window: 'ab 06:00 Uhr',
    annahme: 'Altpapier vierwöchentlich, wie in weiten Teilen des Stadtgebiets.',
  },
  {
    id: 'gelb',
    name: 'Gelbe Tonne',
    cycleDays: 14,
    window: 'ab 06:00 Uhr',
    annahme: 'Gelbe Tonne 14-täglich; die Sammlung ist eine Aufgabe des Dualen Systems.',
  },
]

export const fraktionen = () => FRAKTIONEN.map(({ id, name, cycleDays, annahme }) => ({ id, name, cycleDays, annahme }))

export const fraktion = (id) => FRAKTIONEN.find((f) => f.id === id) ?? null

/**
 * The anchor for one fraction in one district: a weekday (Mon–Sat, because
 * FES does collect on Saturdays) and, for the longer cycles, which week of
 * the cycle this district sits in. Both derived from a hash, both stable.
 */
function anchor(districtId, f) {
  const seed = hash(`${f.id}:${districtId}`)
  const targetWeekday = 1 + (seed % 6)
  const offsetDays = f.cycleDays > 7 ? (Math.floor(seed / 7) % (f.cycleDays / 7)) * 7 : 0

  // Walk back to a fixed epoch Monday so the phase never depends on "now".
  const epoch = '2026-01-05' // a Monday
  return addDays(epoch, (targetWeekday - 1) + offsetDays)
}

/** The next `count` dates for one fraction, holidays shifted forward. */
function nextDates(districtId, f, from, count) {
  const start = anchor(districtId, f)
  const out = []

  // Jump straight to the first occurrence on or after `from`.
  const elapsed = Math.max(0, Math.ceil((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000))
  let n = Math.ceil(elapsed / f.cycleDays)

  while (out.length < count) {
    const planned = addDays(start, n * f.cycleDays)
    n++
    if (planned < from) continue

    const date = shiftToWorkingDay(planned)
    out.push({
      id: `${f.id}-${date}`,
      fraktion: f.id,
      titel: f.name,
      date,
      label: formatDe(date),
      weekday: weekdayShort(date),
      window: f.window,
      cycleDays: f.cycleDays,
      shifted: date === planned ? null : `verschoben wegen ${holidayName(planned) ?? 'Sonntag'}`,
      source: SOURCE,
    })
  }
  return out
}

/**
 * Every upcoming collection date for a district, one list, sorted.
 *
 * Sperrmüll is deliberately NOT in here: it is not a cycle, it is something
 * a person booked. The route merges those in from the `pickups` table and
 * marks them "eingetragen" rather than pretending FES published them.
 *
 * @param {string} districtId
 * @param {{from?: string, perFraktion?: number}} [options]
 */
export function dates(districtId, { from = today(), perFraktion = 4 } = {}) {
  const list = FRAKTIONEN.flatMap((f) => nextDates(districtId, f, from, perFraktion)).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.fraktion.localeCompare(b.fraktion),
  )

  return {
    districtId,
    dates: list,
    fraktionen: fraktionen(),
    source: SOURCE,
    assumptions: [
      'Ein Rhythmus pro Stadtteil. Der echte Kalender von FES hängt an der Adresse, nicht am Stadtteil.',
      'Feiertage in Hessen sind echt — an ihnen und sonntags fährt FES nicht, die Tour rutscht auf den nächsten Werktag.',
      ...FRAKTIONEN.map((f) => f.annahme),
    ],
  }
}

/** The next date for one fraction — what the Wissen screen needs. */
export function nextDate(districtId, fraktionId, from = today()) {
  const f = fraktion(fraktionId)
  if (!f) return null
  return nextDates(districtId, f, from, 1)[0] ?? null
}

/** Exposed for the route, which wants to label a booked pickup the same way. */
export { weekday, isHoliday }
