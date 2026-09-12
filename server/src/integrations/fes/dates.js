/**
 * Date arithmetic shared by the two FES adapters.
 *
 * Everything is a plain YYYY-MM-DD string and every calculation runs in UTC.
 * A collection date has no time zone — it is a day on a paper calendar — and
 * treating it as a local Date is how you end up shifting the whole city's
 * Biotonne by one day every time the server moves.
 */

export const DAY = 86_400_000

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** YYYY-MM-DD for a Date, in UTC. */
export const iso = (date) => date.toISOString().slice(0, 10)

/** Midnight UTC of a YYYY-MM-DD string. */
export const parse = (day) => new Date(`${day}T00:00:00Z`)

export const addDays = (day, n) => iso(new Date(parse(day).getTime() + n * DAY))

/** 0 = Sunday … 6 = Saturday, same numbering as Date#getUTCDay. */
export const weekday = (day) => parse(day).getUTCDay()

export const weekdayName = (day) => WEEKDAYS[weekday(day)]
export const weekdayShort = (day) => WEEKDAYS_SHORT[weekday(day)]

export const today = () => iso(new Date())

/** Whole days between two YYYY-MM-DD strings. */
export const daysBetween = (from, to) => Math.round((parse(to) - parse(from)) / DAY)

/**
 * Easter Sunday, anonymous Gregorian algorithm. Five of the ten Hessian
 * public holidays hang off it, and a hard-coded list would quietly rot.
 */
function easter(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Gesetzliche Feiertage in Hessen for one year. Real, not simulated — they
 * follow from the Hessisches Feiertagsgesetz, and FES does not collect on
 * them, which is why a rebuilt calendar has to know them too.
 */
export function holidays(year) {
  const ostern = easter(year)
  return new Map([
    [`${year}-01-01`, 'Neujahr'],
    [addDays(ostern, -2), 'Karfreitag'],
    [addDays(ostern, 1), 'Ostermontag'],
    [`${year}-05-01`, 'Tag der Arbeit'],
    [addDays(ostern, 39), 'Christi Himmelfahrt'],
    [addDays(ostern, 50), 'Pfingstmontag'],
    [addDays(ostern, 60), 'Fronleichnam'],
    [`${year}-10-03`, 'Tag der Deutschen Einheit'],
    [`${year}-12-25`, '1. Weihnachtstag'],
    [`${year}-12-26`, '2. Weihnachtstag'],
  ])
}

const cache = new Map()

/** The holiday's name, or null. */
export function holidayName(day) {
  const year = Number(day.slice(0, 4))
  if (!cache.has(year)) cache.set(year, holidays(year))
  return cache.get(year).get(day) ?? null
}

export const isHoliday = (day) => holidayName(day) !== null

/**
 * FES shifts a round that falls on a Sunday or a public holiday to the next
 * working day. Saturday is a normal collection day in Frankfurt, so it stays.
 */
export function shiftToWorkingDay(day) {
  let out = day
  let guard = 0
  while ((weekday(out) === 0 || isHoliday(out)) && guard++ < 10) out = addDays(out, 1)
  return out
}

/**
 * A stable number from a string, so every district gets its own — but always
 * the same — collection weekday. Restarting the server must not move
 * anybody's Biotonne.
 */
export function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** German long form, e.g. "Do, 24.09.2026". */
export function formatDe(day) {
  const [y, m, d] = day.split('-')
  return `${weekdayShort(day)}, ${d}.${m}.${y}`
}
