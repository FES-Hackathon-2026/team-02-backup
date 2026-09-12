import { parseModelJson } from './contract.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'

/**
 * Groq, the online provider.
 *
 * Groq is here because the free tier is fast enough that a person does not
 * feel the wait, and because it speaks the OpenAI chat shape — so replacing
 * it later is a base URL and a model id, not a rewrite.
 *
 * Model ids on Groq change often. GROQ_VISION_MODEL is therefore a setting
 * and not a constant; check https://console.groq.com/docs/vision before a
 * demo — that page, not /docs/models, is the one that lists which ids can
 * actually take an image.
 *
 * Checked 2026-09-12: the vision-capable ids are qwen/qwen3.8-27b and
 * qwen/qwen3.6-27b. The Llama 4 family that used to stand here (scout,
 * maverick) is no longer listed, so the old default would have failed on
 * stage with a 404.
 */
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'

/** Six seconds is the promise; the call gets eight before it is abandoned. */
const TIMEOUT_MS = 8000

export const groqModel = () => process.env.GROQ_VISION_MODEL || DEFAULT_MODEL
export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY)

export class ProviderError extends Error {
  constructor(message, cause) {
    super(message)
    this.cause = cause
  }
}

/**
 * @param {Buffer} bytes
 * @param {object} options
 * @param {string} options.mime
 * @param {string} options.mode
 * @param {number} [options.lat]
 * @param {number} [options.lon]
 * @returns {Promise<object>} the model's parsed JSON — still unvalidated
 */
export async function classifyWithGroq(bytes, { mime, mode, lat, lon }) {
  if (!groqConfigured()) {
    throw new ProviderError('GROQ_API_KEY fehlt in server/.env.')
  }

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModel(),
        // Low but not zero: the reasoning should read like a sentence, not
        // like the same six words every time.
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt({ mode, lat, lon }) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    throw new ProviderError(
      err.name === 'AbortError'
        ? `Groq hat in ${TIMEOUT_MS / 1000} s nicht geantwortet.`
        : 'Groq war nicht erreichbar.',
      err,
    )
  }
  clearTimeout(timer)

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // The model id is the failure everyone hits first, so name it directly.
    const hint =
      res.status === 404 || detail.includes('model_not_found')
        ? ` — das Modell "${groqModel()}" gibt es dort nicht mehr, GROQ_VISION_MODEL prüfen.`
        : res.status === 429
          ? ' — das Limit der kostenlosen Stufe ist erreicht.'
          : ''
    throw new ProviderError(`Groq antwortete mit ${res.status}${hint}`, detail.slice(0, 300))
  }

  const body = await res.json()
  const content = body?.choices?.[0]?.message?.content
  try {
    return parseModelJson(content)
  } catch (err) {
    throw new ProviderError('Die Antwort von Groq war kein verwertbares JSON.', err)
  }
}
