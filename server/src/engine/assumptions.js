/**
 * Every number we chose ourselves, in exactly one file.
 *
 * The brief asks that confirmed data, what a person typed and what we
 * computed are never mixed up. That is only keepable if the computed side
 * has a single visible origin — so every factor the engine uses lives here,
 * each with what it means, where the order of magnitude comes from, and the
 * day we wrote it down. The receipt prints this list verbatim, which is why
 * the texts are German and the sources are honest about what is ours.
 *
 * `origin`
 *   'published'  an order of magnitude from public reporting, named below
 *   'own'        our rule. Nobody published it; we decided it and say so.
 *
 * Nothing in here ever comes from an interface. Anything derived from it is
 * labelled „Schätzung" in the app, never „bestätigt".
 */

/** The day these values were written down and last checked. */
const TAKEN = '2026-09-12'

export const FACTORS = {
  foodCo2PerKg: {
    value: 1.9,
    unit: 'kg CO₂e je kg',
    label: 'Gerettete Lebensmittel',
    note: 'Gemischter Warenkorb. Ein Kilo geretteter Lebensmittel vermeidet rund 1,9 kg CO₂e.',
    source: 'Größenordnung nach Umweltbundesamt zu vermeidbaren Lebensmittelabfällen',
    origin: 'published',
    taken: TAKEN,
  },
  foodBasketKg: {
    value: 3.5,
    unit: 'kg je Abholung',
    label: 'Größe einer Rettung',
    note: 'Solange niemand die Menge meldet, rechnen wir mit einem mittleren Korb von 3,5 kg — bewusst niedrig.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  carCo2PerKm: {
    value: 0.154,
    unit: 'kg CO₂e je km',
    label: 'Pkw',
    note: 'Durchschnittliche Pkw-Flotte in Deutschland, eine Person im Auto.',
    source: 'Größenordnung nach Umweltbundesamt (rund 150 g je Personenkilometer)',
    origin: 'published',
    taken: TAKEN,
  },
  transitCo2PerKm: {
    value: 0.078,
    unit: 'kg CO₂e je km',
    label: 'ÖPNV',
    note: 'Bus und Bahn im Nahverkehr, über den Tag gemittelt.',
    source: 'Größenordnung nach Umweltbundesamt (rund 80 g je Personenkilometer)',
    origin: 'published',
    taken: TAKEN,
  },
  bikeCo2PerKm: {
    value: 0,
    unit: 'kg CO₂e je km',
    label: 'Rad und zu Fuß',
    note: 'Wir rechnen mit null. Herstellung und Nahrung sind hier bewusst nicht eingepreist.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  detourFactor: {
    value: 1.3,
    unit: '×',
    label: 'Umwegfaktor',
    note: 'Luftlinie mal 1,3 ergibt die tatsächlich gefahrene Strecke. Wir kennen die Route nicht.',
    source: 'Eigene Festlegung, üblicher Korridor 1,2 bis 1,4',
    origin: 'own',
    taken: TAKEN,
  },
  roundTrip: {
    value: 2,
    unit: '×',
    label: 'Hin und zurück',
    note: 'Ein eigener Weg wird zweimal gefahren. Liegt das Ziel auf einem Weg, der ohnehin ansteht, zählt nur der Umweg — einfach.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  walkThresholdKm: {
    value: 1.5,
    unit: 'km',
    label: 'Fußweg-Grenze',
    note: 'Unter 1,5 km Luftlinie nehmen wir an, dass jemand läuft — also 0 kg CO₂e für die Anfahrt.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  walkKmh: {
    value: 4.5,
    unit: 'km/h',
    label: 'Gehgeschwindigkeit',
    note: 'Nur um einen Umweg in Minuten auszudrücken.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  cupCo2: {
    value: 0.033,
    unit: 'kg CO₂e je Behälter',
    label: 'Mehrwegbehälter statt Einweg',
    note: 'Ein vermiedener Einwegbecher. Erst ab mehreren Umläufen positiv — das ist eingerechnet.',
    source: 'Größenordnung aus Ökobilanzen zu Einwegbechern',
    origin: 'published',
    taken: TAKEN,
  },
  reuseCo2PerItem: {
    value: 12,
    unit: 'kg CO₂e je Gerät',
    label: 'Weitergegebenes Gerät',
    note: 'Bewusst niedrig angesetzt: nur ein Teil der Herstellung wird vermieden, weil das Gerät irgendwann doch ersetzt wird.',
    source: 'Eigene, absichtlich konservative Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
}

/**
 * The reward rules. Separate from the factors above because these are not
 * measurements of the world — they are the deal we offer, and the receipt
 * says so in those words.
 */
export const RULES = {
  pointsPerKgCo2: {
    value: 10,
    unit: 'XP je kg CO₂e',
    label: 'Umrechnung CO₂ in XP',
    note: 'Ein Kilo vermiedenes CO₂e entspricht zehn XP. Anfahrt wird mit demselben Kurs abgezogen.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  xpPerCoin: {
    value: 10,
    unit: 'XP je Münze',
    label: 'Münzen',
    note: 'Zehn XP sind eine Münze. Münzen sind nicht kaufbar.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  scoredActionsPerDay: {
    value: 3,
    unit: 'Aktionen je Tag',
    label: 'Tageslimit',
    note: 'Höchstens drei bewertete Aktionen am Tag. Danach wird weiter alles aufgezeichnet, aber nichts mehr gutgeschrieben. Belohnt wird hilfreiche Regelmäßigkeit, nicht Menge.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
  repeatMultiplier: {
    value: 0.5,
    unit: '×',
    label: 'Wiederholungsdämpfer',
    note: 'Ab der dritten Aktion am selben Ort am selben Tag zählt nur noch die Hälfte.',
    source: 'Eigene Festlegung',
    origin: 'own',
    taken: TAKEN,
  },
}

/** Plain values, for code: `A.detourFactor` instead of `FACTORS.detourFactor.value`. */
export const A = Object.freeze(
  Object.fromEntries(
    [...Object.entries(FACTORS), ...Object.entries(RULES)].map(([key, f]) => [key, f.value]),
  ),
)

/** Everything, flat and ordered, for the receipt and the rules screen. */
export function assumptionList() {
  return [
    ...Object.entries(FACTORS).map(([id, f]) => ({ id, group: 'factor', ...f })),
    ...Object.entries(RULES).map(([id, f]) => ({ id, group: 'rule', ...f })),
  ]
}

/** One assumption by id, shaped for a receipt line. */
export const assumption = (id) => {
  const f = FACTORS[id] ?? RULES[id]
  return f ? { id, ...f } : null
}

/* ------------------------------------------------------------------
   German number formatting. The formula is built on the server so that
   the client never has to reproduce a rounding rule — the receipt shows
   the same string the engine reasoned with.
   ------------------------------------------------------------------ */

/** 0.078 -> "0,078". Decimal comma, fixed digits, no thousands separator. */
export function n(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  const s =
    Math.abs(value) < 10 ** -digits && value !== 0 ? value.toPrecision(2) : value.toFixed(digits)
  // Typographic minus, not a hyphen: this text is read, not parsed.
  return String(s).replace('.', ',').replace(/^-/, '−')
}

/** Distances the way a person says them: 57 m, 3,6 km. */
export function km(value) {
  if (!Number.isFinite(value)) return '—'
  return value < 1 ? `${Math.round(value * 1000)} m` : `${nShort(value, 1)} km`
}

/** Trims trailing zeroes: 1.30 -> "1,3", 2.00 -> "2". */
export function nShort(value, digits = 2) {
  const s = n(value, digits)
  return s.includes(',') ? s.replace(/0+$/, '').replace(/,$/, '') : s
}
