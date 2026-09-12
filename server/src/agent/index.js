import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { all, ROOT, distanceKm, now } from '../db.js'
import { claudeConfigured, claudeModel, classifyWithClaude } from './claude.js'
import { asMode, hazardBlock, normalize } from './contract.js'
import { classifyWithGroq, groqConfigured, groqModel } from './groq.js'
import { classifyWithMock, fixtureKeys } from './mock.js'
import { CATEGORIES, HAZARD_XP, MODE_LABEL, isHazard, rankRoutes, routeFor } from './taxonomy.js'

/**
 * The scan agent: one photo in, one validated classification out.
 *
 * Two providers behind one function. Which one answered is part of the
 * result and is shown on screen, because "a model said so" and "a fixture
 * said so" are different claims and the product is built on not blurring
 * that line.
 */

/**
 * Which provider answers.
 *
 * LLM_PROVIDER still wins when it is set — that is the switch the demo
 * operator flips before walking on stage. With nothing set we no longer
 * default to fixtures: if a real key is present the person pointing a camera
 * at a chair should get an answer about that chair. Fixtures are what is left
 * when there is no key at all.
 */
export const provider = () => {
  const named = (process.env.LLM_PROVIDER || '').trim().toLowerCase()
  if (named) return named
  // Groq first: it is the one this project is set up to run on. Claude is
  // the better eye and takes over the moment LLM_PROVIDER says so.
  if (groqConfigured()) return 'groq'
  if (claudeConfigured()) return 'claude'
  return 'mock'
}

/** The providers that actually look at the photo, by name. */
const VISION = {
  claude: { run: classifyWithClaude, model: claudeModel },
  groq: { run: classifyWithGroq, model: groqModel },
}

/* ------------------------------------------------------------------
   A small cache, so a reload of /erkannt/:photoId does not pay for a
   second model call and — more importantly — cannot tell a different
   story than the first one did. In memory on purpose: it is a demo-day
   convenience, not state anybody should depend on.
   ------------------------------------------------------------------ */
const CACHE_MAX = 200
const cache = new Map()

export function remember(photoId, result) {
  cache.delete(photoId)
  cache.set(photoId, result)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return result
}

export const recall = (photoId) => cache.get(photoId) ?? null

/* ------------------------------------------------------------------
   Corrections. "Falsch erkannt?" is the most valuable thing a person can
   tell us, and there is nowhere in schema.sql to put it — that file is
   finished and shared. So it goes to an append-only log next to the
   database, which is enough to learn from and costs no one a migration.
   ------------------------------------------------------------------ */
const CORRECTIONS = process.env.SCAN_CORRECTIONS_FILE ?? join(ROOT, 'data', 'scan-corrections.jsonl')

export function logCorrection(entry) {
  const row = { at: now(), ...entry }
  try {
    mkdirSync(dirname(CORRECTIONS), { recursive: true })
    appendFileSync(CORRECTIONS, `${JSON.stringify(row)}\n`, 'utf8')
  } catch {
    // A correction that cannot be written must never break the screen the
    // person is looking at. The log line below still carries it.
  }
  return row
}

/* ------------------------------------------------------------------
   Where a hazardous find may legally be handed in.

   Real places from OpenStreetMap, already seeded — the Wertstoffhöfe FES
   actually runs. "Offizielle Abgabestelle finden" therefore names a street
   and an opening time rather than sending someone to a web page, and the
   app never has to invent an address.
   ------------------------------------------------------------------ */
function nearestDropoff(lat, lon) {
  const rows = all("SELECT * FROM places WHERE kind = 'wertstoffhof' ORDER BY is_fes DESC")
  if (rows.length === 0) return null

  const row =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? rows
          .map((r) => ({ ...r, km: distanceKm({ lat, lon }, r) }))
          .sort((a, b) => a.km - b.km)[0]
      : rows[0]

  return {
    id: row.id,
    name: row.name,
    addr: row.addr,
    openingHours: row.opening_hours,
    isFes: row.is_fes === 1,
    lat: row.lat,
    lon: row.lon,
    distanceKm: row.km === undefined ? null : Number(row.km.toFixed(2)),
    source: 'OpenStreetMap',
  }
}

/* ------------------------------------------------------------------
   Classification
   ------------------------------------------------------------------ */

/**
 * @param {object} input
 * @param {{id: string, mime: string, bytes: Buffer}} input.photo
 * @param {string} input.mode
 * @param {number} [input.lat]
 * @param {number} [input.lon]
 * @param {string} [input.fixture]   forces a mock fixture, for the demo
 * @param {object} [input.log]       fastify logger, optional
 */
export async function classify({ photo, mode: rawMode, lat, lon, fixture, log }) {
  const mode = asMode(rawMode)
  const started = Date.now()

  let raw
  let answered = 'mock'
  let model = 'fixtures'
  let fallback = null

  const chosen = VISION[provider()]
  if (chosen) {
    try {
      raw = await chosen.run(photo.bytes, { mime: photo.mime, mode, lat, lon })
      answered = provider()
      model = chosen.model()
    } catch (err) {
      // The whole point of the mock: an unreachable model degrades the
      // answer's provenance, never the demo.
      fallback = err.message
      log?.warn({ err: err.message }, `scan: ${provider()} failed, falling back to fixtures`)
    }
  }

  if (raw === undefined) {
    raw = classifyWithMock(photo.bytes, { mode, fixture })
  }

  const result = normalize(raw, { mode })

  // A hazardous find gets the nearest official hand-in point attached, so
  // the safe route is the one with the most concrete next step on it.
  if (result.hazard) {
    result.hazard.dropoff = nearestDropoff(lat, lon)
    result.hazard.reportXp = HAZARD_XP
    result.hazard.reported = false
  }

  return {
    ...result,
    photoId: photo.id,
    mode,
    modeLabel: MODE_LABEL[mode],
    /** Provenance of the answer itself, shown next to it on screen. */
    agent: {
      provider: answered,
      model,
      /** true when groq was configured but could not answer */
      fallback: fallback !== null,
      fallbackReason: fallback,
      /** The provider's own caveat, e.g. the offline fixture disclaimer. */
      note: typeof raw.note === 'string' ? raw.note : null,
      latencyMs: Date.now() - started,
      /** Never 'confirmed'. A classification is an estimate, always. */
      tier: answered === 'mock' ? 'simulated' : 'estimated',
    },
    corrected: false,
    at: now(),
  }
}

/**
 * Re-decides everything that depends on the category after a person has
 * corrected it. The confidence becomes 1 and the tier becomes the person's
 * own input — they looked at the thing, the model only looked at a picture.
 */
export function applyCorrection(result, { category, subtype, lat, lon }) {
  const cat = CATEGORIES[category]
  if (!cat) return null

  /* Correcting INTO a hazard opens the safety path; correcting OUT of one
     closes it. Carrying the old block over either way would leave a screen
     showing warnings for a chair, or a chair's buttons on a paint tin. */
  let hazard = null
  if (isHazard(category)) {
    hazard =
      result.hazard ?? hazardBlock({ signals: [`von dir als ${cat.label} eingestuft`] })
    hazard.dropoff = hazard.dropoff ?? nearestDropoff(lat, lon)
    hazard.reportXp = HAZARD_XP
    hazard.reported = hazard.reported ?? false
  }

  const estimatedVolumeM3 = result.estimatedVolumeM3
  const reusableProbability = cat.reuse
  const decided = routeFor({
    mode: result.mode,
    category,
    reusableProbability,
    estimatedVolumeM3,
  })

  return {
    ...result,
    category,
    categoryLabel: cat.label,
    subtype: subtype?.trim() || cat.label,
    confidence: 1,
    reusableProbability,
    reasoning: [`Von dir auf „${cat.label}" korrigiert.`, decided.why],
    suggestedRoute: decided.route,
    modelSuggestedRoute: result.suggestedRoute === decided.route ? null : result.suggestedRoute,
    routes: rankRoutes({
      mode: result.mode,
      category,
      reusableProbability,
      estimatedVolumeM3,
      primary: decided.route,
    }),
    bin: cat.bin,
    hazard,
    agent: { ...result.agent, tier: 'input' },
    corrected: true,
  }
}

/** What the demo operator needs to know before walking on stage. */
export const status = () => ({
  provider: provider(),
  model: VISION[provider()]?.model() ?? 'fixtures',
  claudeKeyPresent: claudeConfigured(),
  groqKeyPresent: groqConfigured(),
  offlineCapable: true,
  fixtures: fixtureKeys(),
})
