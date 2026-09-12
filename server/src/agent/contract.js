import {
  CATEGORIES,
  CATEGORY_IDS,
  DANGER_TERMS,
  HAZARD_SAFETY,
  HAZARD_TERMS,
  HAZARD_SOURCE,
  MODES,
  ROUTE_IDS,
  fmt,
  isHazard,
  rankRoutes,
  routeFor,
} from './taxonomy.js'

/**
 * The border between "something a language model said" and "something the
 * app shows a person".
 *
 * Nothing crosses it unchecked. A vision model that is asked for JSON will
 * still occasionally answer with a fenced block, an English category, a
 * confidence of 87 instead of 0.87, or a volume of 400 because it thought in
 * litres. All of that is fixed here, in code, where it can be read — and
 * anything genuinely unusable falls back to a defensible default rather than
 * to an exception on stage.
 */

/** Handed to the model verbatim, and the same shape the route promises. */
export const RESULT_SCHEMA = {
  type: 'object',
  required: [
    'category',
    'subtype',
    'confidence',
    'estimated_volume_m3',
    'reusable_probability',
    'reasoning',
    'suggested_route',
  ],
  properties: {
    category: { type: 'string', enum: CATEGORY_IDS },
    subtype: { type: 'string', description: 'Konkretes Objekt auf Deutsch, z. B. "Holzstuhl"' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    estimated_volume_m3: { type: 'number', minimum: 0.005, maximum: 8 },
    reusable_probability: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string', description: 'Ein kurzer deutscher Satz' },
    },
    suggested_route: { type: 'string', enum: ROUTE_IDS },
    hazard_signals: {
      type: 'array',
      items: { type: 'string' },
      description: 'Warnsymbol, Farbdose, Batterie … — leer, wenn nichts darauf hindeutet',
    },
    immediate_danger: {
      type: 'boolean',
      description: 'läuft aus, dampft, brennt, jemand ist verletzt',
    },
  },
}

/* ------------------------------------------------------------------
   Coercion helpers
   ------------------------------------------------------------------ */

const asciiFold = (s) =>
  s
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z]/g, '')

/**
 * Words a model reaches for instead of our key. Deliberately short: the
 * point is to catch the common English and plural forms, not to build a
 * synonym dictionary that quietly turns into the real taxonomy.
 */
const ALIASES = {
  furniture: 'moebel',
  chair: 'moebel',
  sofa: 'moebel',
  couch: 'moebel',
  table: 'moebel',
  mattress: 'moebel',
  stuhl: 'moebel',
  sperrmuell: 'moebel',
  electronics: 'elektro',
  appliance: 'elektro',
  eschrott: 'elektro',
  elektroschrott: 'elektro',
  elektrogerat: 'elektro',
  bicycle: 'fahrrad',
  bike: 'fahrrad',
  textiles: 'textil',
  clothing: 'textil',
  kleidung: 'textil',
  packaging: 'verpackung',
  plastic: 'verpackung',
  plastik: 'verpackung',
  gelbetonne: 'verpackung',
  glass: 'glas',
  altglas: 'glas',
  paper: 'papier',
  cardboard: 'papier',
  pappe: 'papier',
  karton: 'papier',
  organic: 'bio',
  biowaste: 'bio',
  biomuell: 'bio',
  green: 'gruenschnitt',
  garden: 'gruenschnitt',
  gartenabfall: 'gruenschnitt',
  rubble: 'bauschutt',
  construction: 'bauschutt',
  hazardous: 'schadstoff',
  battery: 'schadstoff',
  chemical: 'schadstoff',
  sondermuell: 'schadstoff',
  residual: 'restmuell',
  general: 'restmuell',
  trash: 'restmuell',
  litter: 'restmuell',
  muell: 'restmuell',
  waste: 'restmuell',
  other: 'sonstiges',
  unknown: 'sonstiges',
}

/** A label, an English word or our own key — all three land on a key. */
function toCategory(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const folded = asciiFold(value)
  if (CATEGORY_IDS.includes(folded)) return folded

  for (const id of CATEGORY_IDS) {
    if (asciiFold(CATEGORIES[id].label) === folded) return id
  }
  if (ALIASES[folded]) return ALIASES[folded]

  // Last resort: the subtype examples. "kuhlschrank" -> elektro.
  for (const id of CATEGORY_IDS) {
    if (CATEGORIES[id].subtypes.some((s) => asciiFold(s) === folded)) return id
  }
  return null
}

/** 0.87, "0.87", 87 and "87 %" all mean the same thing. */
function toUnit(value, fallback) {
  const n = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  const scaled = n > 1 ? n / 100 : n
  return Math.min(1, Math.max(0, Number(scaled.toFixed(2))))
}

/** Volume, with the litre mix-up caught: 400 means 0.4 m³, not 400 m³. */
function toVolume(value, fallback) {
  let n = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (n > 8) n = n / 1000
  return Number(Math.min(8, Math.max(0.005, n)).toFixed(3))
}

function toReasoning(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3)
    .map((s) => (s.length > 220 ? `${s.slice(0, 217)}…` : s))
    // Three, not four. Two more lines are appended by code below — the
    // hazard override and the routing rule — and the final cap is five.
    // At four the routing explanation, the one line that is not a guess,
    // was the one that fell off the end.
    .slice(0, 3)
}

/**
 * The whole-frame sweep the prompt asks for first.
 *
 * Kept short and deduplicated. This is not a second classification — it is
 * the evidence that the model looked past the middle of the picture, and it
 * is what makes an under-counted volume visible to the person instead of
 * silently wrong.
 */
function toVisibleObjects(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const seen = new Set()
  const out = []
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const clean = entry.replace(/\s+/g, ' ').trim()
    if (clean === '' || clean.length > 40) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length === 8) break
  }
  return out
}

const asSubtype = (value, category) => {
  if (typeof value !== 'string') return CATEGORIES[category].label
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean === '' || clean.length > 60) return CATEGORIES[category].label
  return clean
}

export const asMode = (value) => (MODES.includes(value) ? value : 'sperrmuell')

/* ------------------------------------------------------------------
   Hazard detection.

   Runs over everything the model wrote, not only its category, because a
   model that answers "restmuell" and then describes a burst tin of paint
   has still told us what it saw. Word by word, so the signal that comes
   back out is the word the model actually used and can be shown as-is.
   ------------------------------------------------------------------ */
/**
 * German inflects, so "ausgelaufene" has to match "ausgelaufen" and
 * "Farbeimern" has to match "farbeimer". Long terms therefore match by
 * prefix; short ones only exactly, because a four-letter prefix catches
 * words that have nothing to do with the hazard.
 */
const matches = (word, terms) =>
  terms.some((t) => (t.length >= 5 ? word.startsWith(t) : word === t))

function scanForTerms(text, terms) {
  const words = String(text).split(/[^\p{L}\d]+/u).filter(Boolean)
  const hits = []

  for (let i = 0; i < words.length; i += 1) {
    if (matches(asciiFold(words[i]), terms)) {
      hits.push(words[i])
      continue
    }
    // Two-word terms: "unbekannte Flüssigkeit", "läuft aus".
    if (i + 1 < words.length && matches(asciiFold(words[i] + words[i + 1]), terms)) {
      hits.push(`${words[i]} ${words[i + 1]}`)
    }
  }
  return [...new Set(hits)]
}

/**
 * @returns {{signals: string[], danger: string[]}}
 */
/** Short labels, not sentences — "Öl" has to survive. */
const toSignals = (value) =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .filter((v) => typeof v === 'string')
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter((v) => v.length > 1 && v.length <= 40)
    .slice(0, 6)

/**
 * The safety block, built in exactly one place so a correction cannot
 * produce a subtly different version of it than a classification did.
 */
export function hazardBlock({ signals = [], dangerSignals = [], immediateDanger = false }) {
  return {
    headline: 'Gefahrstoff erkannt',
    lead: 'Nicht anfassen. Abstand halten. Melden oder zur offiziellen Schadstoffsammlung bringen.',
    safety: HAZARD_SAFETY,
    /** what triggered it, in the words it was written in */
    signals,
    immediateDanger: immediateDanger || dangerSignals.length > 0,
    dangerSignals,
    emergency: {
      number: '112',
      when: 'Nur bei akuter Gefahr: etwas läuft aus, es dampft oder brennt, jemand ist verletzt.',
    },
    source: HAZARD_SOURCE,
  }
}

/**
 * @returns {{signals: string[], danger: string[]}}
 */
export function hazardSignals({ subtype, reasoning, category }) {
  const text = [subtype, category, ...reasoning].filter(Boolean).join(' ')
  return {
    signals: scanForTerms(text, HAZARD_TERMS),
    danger: scanForTerms(text, DANGER_TERMS),
  }
}

/* ------------------------------------------------------------------
   The one entry point
   ------------------------------------------------------------------ */

/**
 * Turns whatever a provider returned into the response the route promises.
 *
 * @param {object} raw      the provider's parsed JSON, trusted for nothing
 * @param {object} ctx
 * @param {string} ctx.mode
 * @returns {object} the validated result, always complete
 */
export function normalize(raw, { mode }) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const pick = (...names) => names.map((n) => source[n]).find((v) => v !== undefined)

  const guessed = toCategory(pick('category', 'kategorie'))
  const category = guessed ?? 'sonstiges'
  const cat = CATEGORIES[category]

  // A category we had to guess at is not worth the model's own confidence.
  const rawConfidence = toUnit(pick('confidence', 'konfidenz'), 0.6)
  const confidence = guessed === null ? Math.min(rawConfidence, 0.4) : rawConfidence

  const estimatedVolumeM3 = toVolume(
    pick('estimated_volume_m3', 'estimatedVolumeM3', 'volume_m3', 'volumen'),
    cat.volumeM3,
  )
  const reusableProbability = toUnit(
    pick('reusable_probability', 'reusableProbability', 'reuse_probability'),
    cat.reuse,
  )

  const visibleObjects = toVisibleObjects(pick('visible_objects', 'visibleObjects', 'objekte'))

  const reasoning = toReasoning(pick('reasoning', 'begruendung', 'reasons'))
  if (reasoning.length === 0) {
    reasoning.push(
      `Als ${cat.label} eingeordnet${guessed === null ? ', allerdings ohne klare Antwort des Modells' : ''}.`,
    )
  }

  /* The safety override. Anything that smells of a hazard goes down the
     hazard path, even when the model put it in another category — and it
     is said out loud, because a person who disagrees can still correct it. */
  const subtype = asSubtype(pick('subtype', 'subtyp', 'object', 'objekt'), category)
  const found = hazardSignals({ subtype, reasoning, category: String(pick('category') ?? '') })
  const claimed = pick('hazard_signals', 'hazardSignals')
  const signals = [...new Set([...found.signals, ...toSignals(claimed)])].slice(0, 6)

  const dangerous =
    found.danger.length > 0 || pick('immediate_danger', 'immediateDanger') === true

  let finalCategory = category
  if (signals.length > 0 && !isHazard(category)) {
    finalCategory = 'schadstoff'
    reasoning.push(
      `Wegen „${signals.slice(0, 3).join(', ')}" auf den Gefahrstoff-Weg gesetzt — im Zweifel gilt die sichere Einordnung.`,
    )
  }
  const finalCat = CATEGORIES[finalCategory]
  const hazard = isHazard(finalCategory)

  const decided = routeFor({
    mode,
    category: finalCategory,
    reusableProbability,
    estimatedVolumeM3,
  })
  // Said out loud whenever the picture held more than one thing, because
  // the volume above is their sum and a person checking a collection size
  // has no other way to see what was counted.
  if (visibleObjects.length > 1) {
    reasoning.push(`Im Bild erkannt: ${visibleObjects.join(', ')} — das Volumen zählt sie zusammen.`)
  }

  // The routing rule is always spelled out, whatever the model said — it is
  // the one line in here that comes from code and not from a guess.
  reasoning.push(decided.why)

  const suggested = pick('suggested_route', 'suggestedRoute')
  const modelRoute = typeof suggested === 'string' ? suggested.trim().toLowerCase() : null

  return {
    category: finalCategory,
    categoryLabel: finalCat.label,
    subtype,
    confidence,
    estimatedVolumeM3,
    estimatedVolumeLabel: `${fmt(estimatedVolumeM3)} m³`,
    reusableProbability,
    // Trim from the FRONT. Everything code appended — the hazard override,
    // the sweep, the routing rule — sits at the end, and those are the lines
    // that must never be the ones dropped.
    reasoning: reasoning.slice(-5),
    /** Every disposable object the model reported seeing, main one included. */
    visibleObjects,
    suggestedRoute: decided.route,
    /** What the model wanted, kept only when it disagrees — shown as a hint. */
    modelSuggestedRoute: ROUTE_IDS.includes(modelRoute) ? modelRoute : null,
    routes: rankRoutes({
      mode,
      category: finalCategory,
      reusableProbability,
      estimatedVolumeM3,
      primary: decided.route,
    }),
    bin: finalCat.bin,
    /**
     * Present only when it matters. Its absence is what the normal screen
     * checks, so a hazard can never be rendered as an ordinary result.
     */
    hazard: hazard
      ? hazardBlock({ signals, dangerSignals: found.danger, immediateDanger: dangerous })
      : null,
  }
}

/** Pulls the JSON object out of an answer that may be fenced or chatty. */
export function parseModelJson(text) {
  if (typeof text !== 'string') throw new Error('Das Modell hat nichts geliefert.')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Die Antwort des Modells war kein JSON.')
  return JSON.parse(body.slice(start, end + 1))
}
