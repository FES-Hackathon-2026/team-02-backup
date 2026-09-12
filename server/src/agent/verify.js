import jpeg from 'jpeg-js'

import { distanceKm, one } from '../db.js'
import { groqConfigured, groqModel } from './groq.js'
import { provider } from './index.js'

/**
 * Phase 7 — the proof behind a cleared quest.
 *
 * Four signals go in, one verdict comes out, and the arithmetic in between
 * is written down rather than delegated. That is the whole argument of this
 * file: **the rules decide, the model advises.** A model looking at two
 * photographs is one opinion worth one point out of six; the three signals
 * the server computes itself carry the other five.
 *
 * The four:
 *
 *   1 Bildvergleich  perceptual hash (dHash) of before and after — same
 *                    place, and did it visibly change?
 *   2 Standort       how far the after-photo was taken from the reported point
 *   3 Zeitabstand    how long between übernehmen and einreichen
 *   4 Modellvergleich the vision model's own reading, in plain German
 *
 * Two of them can veto on their own — the same photo sent twice, and a
 * position far from the quest. Nothing else is decisive alone, and the model
 * is never decisive at all.
 *
 * Provenance, in the product's own vocabulary:
 *   `bestätigt`    the browser's Geolocation API, the server clock, and the
 *                  hash when the server computed it from the stored bytes
 *   `deine Angabe` a hash the browser computed and sent along
 *   `Schätzung`    the model's reading
 *   `simuliert`    no model was reachable, so nothing was read
 */

/* ------------------------------------------------------------------
   1 — dHash, server-side.

   jpeg-js is pure JavaScript: no native build, no install that can fail
   on the machine the demo runs on. It only speaks JPEG, which is exactly
   what the app produces — Scan.tsx re-encodes every photo through a
   canvas as image/jpeg. Anything else (a PNG dragged in from a desktop)
   simply leaves this signal unknown rather than guessed.
   ------------------------------------------------------------------ */

/** dHash grid: 9 columns so that 8 comparisons per row give 64 bits. */
const HASH_W = 9
const HASH_H = 8

const hashCache = new Map()
const HASH_CACHE_MAX = 200

/**
 * A 64-bit difference hash as 16 hex characters.
 *
 * Box-samples the decoded image down to 9×8 grey values, then records for
 * each pair of neighbours whether the left one is brighter. That makes it
 * survive re-compression, exposure and a little camera shake, and makes it
 * change when the scene itself changes — which is the property we need.
 *
 * @param {Buffer} bytes
 * @param {string} mime
 * @returns {string|null} hex hash, or null when the image could not be read
 */
export function dHash(bytes, mime) {
  if (mime !== 'image/jpeg') return null

  let img
  try {
    img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 64 })
  } catch {
    return null
  }
  if (!img?.width || !img?.height) return null

  const { width, height, data } = img
  const grey = new Float64Array(HASH_W * HASH_H)

  for (let cy = 0; cy < HASH_H; cy++) {
    const y0 = Math.floor((cy * height) / HASH_H)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / HASH_H))

    for (let cx = 0; cx < HASH_W; cx++) {
      const x0 = Math.floor((cx * width) / HASH_W)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / HASH_W))

      let sum = 0
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          // Rec. 601 luma — the same weighting every other dHash uses, so
          // a hash computed here is comparable with one computed elsewhere.
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          count++
        }
      }
      grey[cy * HASH_W + cx] = count === 0 ? 0 : sum / count
    }
  }

  let hex = ''
  for (let cy = 0; cy < HASH_H; cy++) {
    let nibble = 0
    let bits = 0
    for (let cx = 0; cx < HASH_W - 1; cx++) {
      const left = grey[cy * HASH_W + cx]
      const right = grey[cy * HASH_W + cx + 1]
      nibble = (nibble << 1) | (left > right ? 1 : 0)
      if (++bits === 4) {
        hex += nibble.toString(16)
        nibble = 0
        bits = 0
      }
    }
  }
  return hex
}

/** The hash of a stored photo, computed once and remembered. */
export function hashOfPhoto(photoId) {
  if (hashCache.has(photoId)) return hashCache.get(photoId)

  const photo = one('SELECT mime, bytes FROM photos WHERE id = ?', photoId)
  const hash = photo ? dHash(photo.bytes, photo.mime) : null

  hashCache.set(photoId, hash)
  if (hashCache.size > HASH_CACHE_MAX) hashCache.delete(hashCache.keys().next().value)
  return hash
}

/** How many of the 64 bits differ. 0 = identical, ~32 = unrelated. */
export function hamming(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return null
  let bits = 0
  for (let i = 0; i < a.length; i++) {
    const x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    if (Number.isNaN(x)) return null
    // 4 bits at a time; the table is shorter than a popcount loop.
    bits += [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4][x]
  }
  return bits
}

/* ------------------------------------------------------------------
   The thresholds, in one place, because every one of them ends up on a
   screen as a sentence a person may disagree with.
   ------------------------------------------------------------------ */

export const T = Object.freeze({
  /** below this the two pictures are the same picture */
  hashIdentical: 2,
  /** up to here: same scene, visibly changed — what a clean-up looks like */
  hashSameScene: 22,
  /** above here the pictures show different places */
  hashDifferent: 30,

  /** metres from the reported point that count as "at the spot" */
  nearM: 60,
  /** beyond this the submission is somewhere else entirely */
  farM: 250,

  /** nobody walks there and clears it in less than a minute */
  minSeconds: 60,
  /** the claim window; past it the evidence is no longer about this claim */
  maxSeconds: 2 * 60 * 60,

  /** of six points: what releases a credit without asking anyone */
  releaseScore: 5,
  /** below this, the signals contradict each other */
  contradictScore: 1,
})

const WEIGHT = Object.freeze({ hash: 2, position: 2, time: 1, model: 1 })
export const MAX_SCORE = WEIGHT.hash + WEIGHT.position + WEIGHT.time + WEIGHT.model

const m = (km) => Math.round(km * 1000)
const minutes = (s) => `${Math.round(s / 60)} Min.`
const dauer = (s) => (s < 120 ? `${Math.round(s)} Sekunden` : minutes(s))

/* ------------------------------------------------------------------
   4 — the model. One opinion, one point, and it says so on screen.

   Phase 4 owns agent/index.js and exposes only classify(); comparing two
   photographs is a different question, so it lives here and reuses phase
   4's provider configuration rather than duplicating it. That is the
   seam: this file reads `provider()`, `groqModel()` and `groqConfigured()`
   and writes nothing in agent/.
   ------------------------------------------------------------------ */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 8000

const COMPARE_SYSTEM = `Du vergleichst zwei Fotos derselben Meldung in Frankfurt am Main: ein Vorher-Bild einer Verschmutzung und ein Nachher-Bild, das beweisen soll, dass aufgeräumt wurde.

Antworte ausschließlich mit JSON in genau dieser Form:
{"same_place": true|false|null, "cleaned": true|false|null, "confidence": 0.0-1.0, "reasoning": "ein bis zwei Sätze auf Deutsch"}

same_place: zeigen beide Bilder denselben Ort? Achte auf Bordsteine, Hauswände, Pflaster, Bäume, Schilder — nicht auf den Müll.
cleaned: ist das, was auf dem Vorher-Bild lag, auf dem Nachher-Bild verschwunden?
Setze null, wenn du es ehrlich nicht erkennen kannst. Ein ehrliches null ist besser als ein geratenes true.
reasoning: woran du es festmachst, in klarem Deutsch, ohne Fachbegriffe.`

async function askModel({ before, after, title }) {
  if (provider() !== 'groq' || !groqConfigured()) {
    return {
      available: false,
      reason:
        provider() === 'groq'
          ? 'GROQ_API_KEY fehlt — es hat kein Modell auf die Bilder geschaut.'
          : 'Kein Modell konfiguriert (LLM_PROVIDER=mock) — es hat niemand auf die Bilder geschaut.',
    }
  }

  const url = (p) => `data:${p.mime};base64,${p.bytes.toString('base64')}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModel(),
        temperature: 0.1,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: COMPARE_SYSTEM },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Meldung: „${title ?? 'Verschmutzung'}“. Erstes Bild = vorher, zweites Bild = nachher.`,
              },
              { type: 'image_url', image_url: { url: url(before) } },
              { type: 'image_url', image_url: { url: url(after) } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        available: false,
        reason:
          res.status === 429
            ? 'Das Limit der kostenlosen Groq-Stufe ist erreicht — das Modell hat nicht geantwortet.'
            : `Groq antwortete mit ${res.status}${detail.includes('model_not_found') ? ' — GROQ_VISION_MODEL prüfen' : ''}.`,
      }
    }

    const body = await res.json()
    const parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? '{}')
    const bool = (v) => (v === true ? true : v === false ? false : null)

    return {
      available: true,
      model: groqModel(),
      samePlace: bool(parsed.same_place),
      cleaned: bool(parsed.cleaned),
      confidence: Number.isFinite(Number(parsed.confidence))
        ? Math.min(1, Math.max(0, Number(parsed.confidence)))
        : null,
      reasoning:
        typeof parsed.reasoning === 'string' && parsed.reasoning.trim() !== ''
          ? parsed.reasoning.trim().slice(0, 400)
          : null,
    }
  } catch (err) {
    return {
      available: false,
      reason:
        err.name === 'AbortError'
          ? `Das Modell hat in ${TIMEOUT_MS / 1000} s nicht geantwortet.`
          : 'Das Modell war nicht erreichbar.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------
   The four signals
   ------------------------------------------------------------------ */

function hashSignal({ beforeHash, afterHash, clientHash, serverSide }) {
  const base = {
    id: 'hash',
    label: 'Bildvergleich',
    weight: WEIGHT.hash,
    method: 'dHash 8×8, Hamming-Abstand von 64 Bit',
  }

  if (beforeHash === null || afterHash === null) {
    return {
      ...base,
      verdict: 'unknown',
      tier: 'simulated',
      source: 'nicht berechenbar',
      value: '—',
      detail:
        'Mindestens eines der beiden Bilder ließ sich nicht lesen (nur JPEG wird verglichen). Dieses Signal zählt nicht mit.',
    }
  }

  const d = hamming(beforeHash, afterHash)
  const tier = serverSide ? 'confirmed' : 'input'
  const source = serverSide
    ? 'auf dem Server aus beiden Fotos berechnet'
    : 'vom Gerät mitgeschickt — nicht überprüfbar'

  const shaped = {
    ...base,
    tier,
    source,
    value: `Abstand ${d} von 64`,
    distance: d,
    beforeHash,
    afterHash,
    clientHash: clientHash ?? null,
  }

  if (d <= T.hashIdentical) {
    return {
      ...shaped,
      verdict: 'fail',
      veto: true,
      detail:
        'Die beiden Bilder sind praktisch identisch. Das ist dasselbe Foto, kein Vorher und Nachher.',
    }
  }
  if (d <= T.hashSameScene) {
    return {
      ...shaped,
      verdict: 'pass',
      detail:
        `Derselbe Ort, sichtbar verändert: Bordstein, Wand und Pflaster stimmen überein, der Inhalt nicht. ` +
        `Genau das hinterlässt ein Aufräumen (Schwelle: ${T.hashIdentical + 1} bis ${T.hashSameScene}).`,
    }
  }
  if (d <= T.hashDifferent) {
    return {
      ...shaped,
      verdict: 'unknown',
      detail:
        'Ähnlich, aber nicht eindeutig — vielleicht eine andere Blickrichtung, vielleicht ein anderer Ort. Das Signal enthält sich.',
    }
  }
  return {
    ...shaped,
    verdict: 'fail',
    detail: `Die Bilder zeigen offenbar verschiedene Orte (über ${T.hashDifferent} von 64 Bit Unterschied).`,
  }
}

function positionSignal({ quest, photo }) {
  const base = {
    id: 'position',
    label: 'Standort',
    weight: WEIGHT.position,
    method: 'Luftlinie zwischen Meldepunkt und Nachher-Foto',
  }

  const has = Number.isFinite(photo?.lat) && Number.isFinite(photo?.lon)
  if (!has) {
    return {
      ...base,
      verdict: 'unknown',
      tier: 'simulated',
      source: 'kein Standort freigegeben',
      value: '—',
      detail:
        'Zum Nachher-Foto kam kein Standort mit. Ohne ihn lässt sich nicht prüfen, ob es am gemeldeten Punkt entstanden ist.',
    }
  }

  const metres = m(distanceKm({ lat: quest.lat, lon: quest.lon }, { lat: photo.lat, lon: photo.lon }))
  const shaped = {
    ...base,
    tier: 'confirmed',
    source: 'Standortdienst des Geräts, Abstand auf dem Server gerechnet',
    value: `${metres} m vom Meldepunkt`,
    metres,
  }

  if (metres <= T.nearM) {
    return {
      ...shaped,
      verdict: 'pass',
      detail: `Das Foto entstand ${metres} m vom gemeldeten Punkt — innerhalb der ${T.nearM} m, die als „am Ort“ gelten.`,
    }
  }
  if (metres <= T.farM) {
    return {
      ...shaped,
      verdict: 'unknown',
      detail:
        `${metres} m daneben: in der Nähe, aber nicht am Punkt. In der Stadt ist das noch GPS-Streuung, ` +
        'deshalb zählt es weder dafür noch dagegen.',
    }
  }
  return {
    ...shaped,
    verdict: 'fail',
    veto: true,
    detail: `${metres} m entfernt — das ist ein anderer Ort als der gemeldete (Grenze: ${T.farM} m).`,
  }
}

function timeSignal({ seconds, claimedAt }) {
  const base = {
    id: 'time',
    label: 'Zeitabstand',
    weight: WEIGHT.time,
    method: 'Serveruhr: Übernahme bis Einreichung',
    tier: 'confirmed',
    source: 'Uhr des Servers — vom Gerät nicht beeinflussbar',
    value: dauer(seconds),
    seconds,
    claimedAt,
  }

  if (seconds < T.minSeconds) {
    return {
      ...base,
      verdict: 'fail',
      detail: `Nur ${dauer(seconds)} zwischen Übernehmen und Nachweis. In der Zeit ist niemand hingegangen und hat aufgeräumt.`,
    }
  }
  if (seconds > T.maxSeconds) {
    return {
      ...base,
      verdict: 'fail',
      detail: `${minutes(seconds)} nach der Übernahme — das Vorrecht von zwei Stunden war da längst abgelaufen.`,
    }
  }
  return {
    ...base,
    verdict: 'pass',
    detail: `${dauer(seconds)} zwischen Übernehmen und Nachweis — plausibel für Hingehen, Aufräumen, Fotografieren.`,
  }
}

function modelSignal(answer) {
  const base = {
    id: 'model',
    label: 'Modellvergleich',
    weight: WEIGHT.model,
    method: 'Sehmodell, beide Bilder nebeneinander',
  }

  if (!answer.available) {
    return {
      ...base,
      verdict: 'unknown',
      tier: 'simulated',
      source: 'kein Modell befragt',
      value: '—',
      detail: `${answer.reason} Die drei Regel-Signale entscheiden dann allein.`,
    }
  }

  const shaped = {
    ...base,
    tier: 'estimated',
    source: `${answer.model} — eine Einschätzung, kein Beweis`,
    model: answer.model,
    samePlace: answer.samePlace,
    cleaned: answer.cleaned,
    confidence: answer.confidence,
    reasoning: answer.reasoning,
    value:
      answer.samePlace === true && answer.cleaned === true
        ? 'gleicher Ort, aufgeräumt'
        : answer.samePlace === false
          ? 'anderer Ort'
          : answer.cleaned === false
            ? 'nicht aufgeräumt'
            : 'unentschieden',
  }

  const say = answer.reasoning ? `„${answer.reasoning}“` : null

  if (answer.samePlace === false) {
    return { ...shaped, verdict: 'fail', detail: say ?? 'Das Modell sieht zwei verschiedene Orte.' }
  }
  if (answer.cleaned === false) {
    return {
      ...shaped,
      verdict: 'fail',
      detail: say ?? 'Das Modell sieht die Verschmutzung auf dem Nachher-Bild noch.',
    }
  }
  if (answer.samePlace === true && answer.cleaned === true) {
    return {
      ...shaped,
      verdict: 'pass',
      detail: say ?? 'Das Modell sieht denselben Ort, aufgeräumt.',
    }
  }
  return {
    ...shaped,
    verdict: 'unknown',
    detail: say ?? 'Das Modell konnte sich nicht festlegen und sagt das auch.',
  }
}

/* ------------------------------------------------------------------
   The verdict
   ------------------------------------------------------------------ */

const pointsOf = (s) => (s.verdict === 'pass' ? s.weight : s.verdict === 'fail' ? -s.weight : 0)

/**
 * Weigh the four signals and decide.
 *
 * @param {object} input
 * @param {object} input.quest            the quests row
 * @param {{id, mime, bytes, lat, lon}} input.beforePhoto
 * @param {{id, mime, bytes, lat, lon}} input.afterPhoto
 * @param {number} input.seconds          since the claim, from the server clock
 * @param {string} input.claimedAt
 * @param {string} [input.clientHash]     browser-computed dHash, if one came
 * @returns {Promise<object>} verdict, score, signals, and the sentence chain
 */
export async function verify({
  quest,
  beforePhoto,
  afterPhoto,
  seconds,
  claimedAt,
  clientHash,
  log,
}) {
  const beforeHash = beforePhoto ? dHash(beforePhoto.bytes, beforePhoto.mime) : null
  const afterHash = afterPhoto ? dHash(afterPhoto.bytes, afterPhoto.mime) : null

  // The server hash wins whenever it exists. A hash the browser computed is
  // forgeable, so it is only ever the fallback and is tagged as the person's
  // own statement — it must never be able to carry a verdict alone.
  const serverSide = beforeHash !== null && afterHash !== null
  const usableAfter = serverSide ? afterHash : (clientHash ?? null)

  const model = await askModel({
    before: beforePhoto,
    after: afterPhoto,
    title: quest.title,
  }).catch((err) => {
    log?.warn({ err: err.message }, 'quest verify: model comparison failed')
    return { available: false, reason: 'Das Modell war nicht erreichbar.' }
  })

  const signals = [
    hashSignal({
      beforeHash,
      afterHash: usableAfter,
      clientHash,
      serverSide,
    }),
    positionSignal({ quest, photo: afterPhoto }),
    timeSignal({ seconds, claimedAt }),
    modelSignal(model),
  ].map((s) => ({ ...s, points: pointsOf(s) }))

  const score = signals.reduce((sum, s) => sum + s.points, 0)
  const veto = signals.find((s) => s.veto === true) ?? null

  const verdict = veto
    ? 'unmatched'
    : score >= T.releaseScore
      ? 'plausible'
      : score >= T.contradictScore
        ? 'pending'
        : 'unmatched'

  const steps = [
    ...signals.map(
      (s) =>
        `${s.label}: ${s.verdict === 'pass' ? '+' : s.verdict === 'fail' ? '−' : '±'}${Math.abs(s.points)} — ${s.value}`,
    ),
    `Summe ${score} von ${MAX_SCORE}`,
    veto
      ? `${veto.label} schlägt alles andere — ${verdict}`
      : `Schwelle ${T.releaseScore} für sofortige Gutschrift — ${verdict}`,
  ]

  return {
    verdict,
    score,
    maxScore: MAX_SCORE,
    confidence: Math.max(0, Math.min(1, score / MAX_SCORE)),
    signals,
    veto: veto ? { id: veto.id, label: veto.label, detail: veto.detail } : null,
    steps,
    rule:
      `Vier Signale, ${MAX_SCORE} mögliche Punkte. Ab ${T.releaseScore} Punkten wird ohne Rückfrage gutgeschrieben, ` +
      `darunter entscheiden zwei Leute aus der Nachbarschaft. Zwei Signale können allein ablehnen: ` +
      `dasselbe Foto zweimal, und ein Standort über ${T.farM} m daneben. ` +
      'Das Modell zählt einen von sechs Punkten — es berät, es entscheidet nicht.',
    decidedBy: 'rules',
    model: model.available
      ? { asked: true, model: model.model, reasoning: model.reasoning, confidence: model.confidence }
      : { asked: false, reason: model.reason },
  }
}

/** What a submission needs for its receipt, without re-running anything. */
export const verdictLabel = (verdict) =>
  verdict === 'plausible'
    ? 'plausibel'
    : verdict === 'unmatched'
      ? 'nicht bestätigt'
      : 'Gegenprüfung läuft'
