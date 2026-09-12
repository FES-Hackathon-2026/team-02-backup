import { addDays, formatDe, hash, holidayName, isHoliday, today, weekday, weekdayShort } from './dates.js'

/**
 * FES Sperrmüll — the bulky-waste service, rebuilt.
 *
 * FES gave the hackathon no dataset and no endpoint for this block, and
 * rebuilding it was explicitly allowed. So this file is a stand-in with the
 * shape of the real thing: four methods, no database, no side effects. The
 * route above it persists and rewards; this only answers the way FES would.
 *
 * What is REAL here, taken from the live service at
 * <https://frankfurtplus.de/sperrmuell-anmeldung/adresse> (fes-frankfurt.de/
 * sperrmuell redirects there):
 *
 *   · the flow      Adresse -> Standort -> Gegenstände -> Kontakt -> Bestätigung,
 *                   plus verschieben / stornieren / reklamieren per Auftrag
 *   · the seams     GET  /api/sperrmuell/termine      (free dates)
 *                   POST /api/sperrmuell/anmeldung    (booking)
 *                   POST /sperrmuell-anmeldung/stornierung/{appointment}
 *   · the split     Elektrokleingeräte and Schadstoffe are separate FES
 *                   services, not part of a Sperrmüll round, and Grünschnitt
 *                   has its own booking flow (/gruenschnitt-anmeldung)
 *
 * What is INVENTED and therefore carries source 'simulated': which weekday a
 * district is served on, how many crews are free, the volume ceiling, and the
 * lead time. Every one of those is a single constant below, with the
 * assumption spelled out in German so the app can print it.
 *
 * INTEGRATION.md next to this file says what FES has to hand us to delete the
 * invented half.
 */

export const SOURCE = 'simulated'

/** One booking cannot exceed this. Assumption — FES does not publish it. */
export const MAX_VOLUME_M3 = 6

/** Days between booking and the earliest collection. Assumption. */
const LEAD_DAYS = 6

/** How far ahead dates are offered. */
const HORIZON_DAYS = 56

const ANNAHME = {
  weekday:
    'Der Wochentag je Stadtteil ist nachgebaut, nicht von FES übernommen — aber pro Stadtteil stabil.',
  lead: `Frühester Termin ${LEAD_DAYS} Tage nach der Anmeldung.`,
  volume: `Pro Anmeldung höchstens ${MAX_VOLUME_M3} m³ — bei FES entscheidet das die Fahrzeuggröße.`,
  capacity: 'Freie Plätze je Termin sind nachgebaut; FES rechnet mit echter Tourenplanung.',
}

/**
 * The categories a person picks from. Which of these FES actually collects at
 * the kerb and which have their own route is real; the numbers are not.
 */
const CATEGORIES = [
  {
    id: 'moebel',
    name: 'Möbel und Hausrat',
    examples: 'Sofa, Schrank, Tisch, Matratze, Teppich',
    collectable: true,
    typicalVolumeM3: 1.5,
    note: 'Alles muss von zwei Personen tragbar sein. Schränke bitte zerlegen.',
  },
  {
    id: 'holz',
    name: 'Holz und Bretter',
    examples: 'Regalböden, Lattenrost, Bretter',
    collectable: true,
    typicalVolumeM3: 0.8,
    note: 'Bündeln, höchstens 2 m lang. Kein behandeltes Bauholz.',
  },
  {
    id: 'metall',
    name: 'Metall und Schrott',
    examples: 'Heizkörper, Fahrradrahmen, Regalgestell',
    collectable: true,
    typicalVolumeM3: 0.6,
    note: 'Wird getrennt verladen und geht in die Verwertung.',
  },
  {
    id: 'elektro-gross',
    name: 'Elektro-Großgeräte',
    examples: 'Kühlschrank, Waschmaschine, Herd, Fernseher',
    collectable: true,
    separateLoading: true,
    maxPieces: 4,
    typicalVolumeM3: 1,
    note: 'Getrennt vom übrigen Sperrmüll — Kühlgeräte dürfen nicht gequetscht werden.',
  },
  {
    id: 'elektro-klein',
    name: 'Elektro-Kleingeräte',
    examples: 'Toaster, Föhn, Kabel, Handy, Akkuschrauber',
    collectable: false,
    alternative: {
      what: 'Mobile Elektrokleingeräte-Sammlung oder Wertstoffhof',
      why: 'Kleingeräte gehen bei einer Sperrmülltour verloren oder werden beschädigt.',
      url: 'https://frankfurtplus.de/mobile-dienste/mobile-elektrokleingerate-sammlung',
      placeKind: 'wertstoffhof',
    },
  },
  {
    id: 'schadstoff',
    name: 'Schadstoffe',
    examples: 'Farbe, Lack, Batterien, Leuchtstoffröhren, Chemie',
    collectable: false,
    alternative: {
      what: 'Schadstoffsammlung oder Wertstoffhof',
      why: 'Schadstoffe dürfen nie auf den Gehweg — sie gehören in eine Annahmestelle.',
      url: 'https://frankfurtplus.de/mobile-dienste/schadstoffsammlung',
      placeKind: 'wertstoffhof',
    },
  },
  {
    id: 'gruenschnitt',
    name: 'Grünschnitt',
    examples: 'Äste, Strauchschnitt, Laub',
    collectable: false,
    alternative: {
      what: 'Eigene FES-Anmeldung für Grünschnitt',
      why: 'Grünschnitt fährt eine eigene Tour und wird kompostiert, nicht verbrannt.',
      url: 'https://frankfurtplus.de/gruenschnitt-anmeldung/adresse',
      placeKind: 'wertstoffhof',
    },
  },
  {
    id: 'bauschutt',
    name: 'Bauschutt und Sanitär',
    examples: 'Fliesen, Waschbecken, Beton, Bauholz',
    collectable: false,
    alternative: {
      what: 'Wertstoffhof, kostenpflichtig',
      why: 'Bauschutt ist kein Hausrat und zählt nicht als Sperrmüll.',
      placeKind: 'wertstoffhof',
    },
  },
]

/**
 * Everything a person can be offered, with the rules attached. The client
 * renders `collectable: false` as a signpost, not as a dead end.
 */
export function categories() {
  return {
    // Each category carries the scan vocabulary that maps onto it, so the
    // booking screen can pre-select from ?category= without keeping its own
    // copy of the table below.
    categories: CATEGORIES.map((c) => ({
      ...c,
      aliases: Object.entries(ALIASES)
        .filter(([, target]) => target === c.id)
        .map(([from]) => from),
    })),
    maxVolumeM3: MAX_VOLUME_M3,
    leadDays: LEAD_DAYS,
    assumptions: [ANNAHME.volume, ANNAHME.lead],
    source: SOURCE,
  }
}

/**
 * Which scan categories map onto which booking category.
 *
 * Phase 4 classifies with its own vocabulary (moebel, elektro, fahrrad, …)
 * and links here without translating. Rather than make that phase change its
 * file, the translation lives on this side — a booking screen that opens
 * pre-filled is worth more than a tidy shared enum.
 */
const ALIASES = {
  elektro: 'elektro-gross',
  fahrrad: 'metall',
  sperrmuell: 'moebel',
  matratze: 'moebel',
  hausrat: 'moebel',
}

export const category = (id) =>
  CATEGORIES.find((c) => c.id === id) ??
  CATEGORIES.find((c) => c.id === ALIASES[id]) ??
  null

/**
 * Which weekday a district is served on. Derived from the district id, so it
 * never moves — Monday to Friday, because a Saturday Sperrmüll round would be
 * a claim about FES rosters we have no basis for.
 */
function collectionWeekday(districtId) {
  return 1 + (hash(`sperrmuell:${districtId}`) % 5)
}

/**
 * Free dates for a district.
 *
 * A big load needs the large vehicle, which is out less often — so above
 * 3 m³ only every second round is offered. That is a modelled constraint,
 * not an FES fact, and the response says so.
 */
export function slots(districtId, volumeM3 = 1, from = today()) {
  const wanted = Number(volumeM3) || 0
  if (wanted > MAX_VOLUME_M3) {
    return {
      slots: [],
      districtId,
      blocked: {
        code: 'volume_too_large',
        message: `Über ${MAX_VOLUME_M3} m³ braucht es einen Container statt einer Sperrmüllabfuhr.`,
      },
      source: SOURCE,
      assumptions: [ANNAHME.volume],
    }
  }

  const target = collectionWeekday(districtId)
  const earliest = addDays(from, LEAD_DAYS)
  const large = wanted > 3

  const out = []
  let round = 0

  for (let i = 0; i <= HORIZON_DAYS && out.length < 8; i++) {
    const day = addDays(earliest, i)
    if (weekday(day) !== target) continue
    round++

    if (isHoliday(day)) {
      out.push({
        date: day,
        label: formatDe(day),
        weekday: weekdayShort(day),
        available: false,
        reason: `${holidayName(day)} — an diesem Tag fährt FES nicht.`,
      })
      continue
    }
    if (large && round % 2 === 0) continue

    // Stable per date, so reloading the screen does not reshuffle the city.
    const free = hash(`${districtId}:${day}:${large ? 'l' : 's'}`) % 7
    out.push({
      date: day,
      label: formatDe(day),
      weekday: weekdayShort(day),
      available: free > 0,
      window: '06:00–15:00 Uhr',
      freeSlots: free,
      pressure: free === 0 ? 'belegt' : free <= 2 ? 'knapp' : 'frei',
      vehicle: large ? 'Großfahrzeug' : 'Standardfahrzeug',
      reason: free === 0 ? 'An diesem Tag ist die Tour schon voll.' : undefined,
    })
  }

  return {
    slots: out,
    districtId,
    leadDays: LEAD_DAYS,
    source: SOURCE,
    assumptions: [ANNAHME.weekday, ANNAHME.lead, ANNAHME.capacity].concat(
      large ? ['Über 3 m³ fährt nur jede zweite Tour — dafür braucht es das Großfahrzeug.'] : [],
    ),
  }
}

/** FES-shaped reference: a letter block and six digits, like an Auftragsnummer. */
function reference(seed) {
  return `FES-${String(hash(seed) % 1_000_000).padStart(6, '0')}`
}

/**
 * Accept a booking.
 *
 * Pure: it checks the rules FES would check and hands back the confirmed
 * slot. It writes nothing — the `pickups` row and the reward are the route's
 * job, which is what keeps the swap to the real endpoint a one-file change.
 */
export function book({ address, districtId, categoryId, volumeM3, slotDate, from = today() }) {
  const cat = category(categoryId)
  if (!cat) return { ok: false, code: 'unknown_category', message: 'Diese Kategorie gibt es nicht.' }

  if (!cat.collectable) {
    return {
      ok: false,
      code: 'not_collectable',
      message: `${cat.name}: keine Abholung am Straßenrand. Richtiger Weg: ${cat.alternative.what}.`,
      alternative: cat.alternative,
    }
  }

  const volume = Number(volumeM3)
  if (!Number.isFinite(volume) || volume <= 0) {
    return { ok: false, code: 'bad_volume', message: 'Bitte ein Volumen in m³ angeben.' }
  }
  if (volume > MAX_VOLUME_M3) {
    return {
      ok: false,
      code: 'volume_too_large',
      message: `Über ${MAX_VOLUME_M3} m³ braucht es einen Container statt einer Sperrmüllabfuhr.`,
    }
  }
  if (typeof address !== 'string' || address.trim().length < 5) {
    return { ok: false, code: 'bad_address', message: 'Bitte Straße und Hausnummer angeben.' }
  }

  // The date has to be one that was actually offered — otherwise a client
  // could book a Sunday and the calendar would start lying.
  const offered = slots(districtId, volume, from).slots.find(
    (s) => s.date === slotDate && s.available,
  )
  if (!offered) {
    return {
      ok: false,
      code: 'slot_unavailable',
      message: 'Dieser Termin ist nicht frei. Bitte einen anderen wählen.',
    }
  }

  return {
    ok: true,
    reference: reference(`${districtId}|${address.trim()}|${slotDate}|${categoryId}`),
    slotDate,
    window: offered.window,
    vehicle: offered.vehicle,
    category: cat.id,
    categoryName: cat.name,
    volumeM3: volume,
    instructions: [
      'Am Vorabend ab 18:00 Uhr an den Straßenrand stellen — nicht früher.',
      cat.note ?? 'Nichts abstellen, was den Gehweg versperrt.',
      'Die Abfuhr beginnt um 06:00 Uhr.',
    ],
    source: SOURCE,
  }
}

/** Days before the slot in which a booking can still be withdrawn. */
const CANCEL_DEADLINE_DAYS = 1

/**
 * Withdraw a booking. FES has this as
 * POST /sperrmuell-anmeldung/stornierung/{appointment}; here it only decides
 * whether the withdrawal is still allowed.
 */
export function cancel(id, { slotDate, from = today() } = {}) {
  if (!id) return { ok: false, code: 'unknown_pickup', message: 'Kein Termin angegeben.' }

  if (slotDate) {
    const deadline = addDays(slotDate, -CANCEL_DEADLINE_DAYS)
    if (from > deadline) {
      return {
        ok: false,
        code: 'too_late',
        message: `Stornieren geht bis zum ${formatDe(deadline)}. Danach ist die Tour geplant.`,
      }
    }
  }

  return { ok: true, id, status: 'cancelled', source: SOURCE }
}
