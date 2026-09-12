import Anthropic from '@anthropic-ai/sdk'

import { RESULT_SCHEMA, parseModelJson } from './contract.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'

/**
 * Claude, the online provider.
 *
 * This is the one that actually looks at the photo. The mock next door picks
 * a fixture by hashing the image bytes — it never sees the picture at all —
 * so it can tell you a chair is a car battery. Everything user-facing in
 * ReMain hangs off the category, so that is not a small difference: it is the
 * difference between the product working and the product pretending.
 *
 * The answer comes back through a strict tool call rather than as free text.
 * The schema is contract.js's RESULT_SCHEMA, the same one the route promises,
 * so "the model replied" and "the reply fits" stop being two separate hopes.
 * normalize() still runs afterwards — strict guarantees the shape, not that
 * the volume is sane or that the category is one we can route.
 */

const DEFAULT_MODEL = 'claude-opus-5'

/** Six seconds is the promise on screen; the call gets ten before it is cut. */
const TIMEOUT_MS = 10_000

export const claudeModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
export const claudeConfigured = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

export class ProviderError extends Error {
  constructor(message, cause) {
    super(message)
    this.cause = cause
  }
}

/* Anthropic's image blocks take a bare subtype list. The upload route already
   refuses anything outside it, so this is a guard, not a conversion. */
const BILDTYPEN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * strict: true requires a closed schema — every property listed in `required`
 * and no extras. RESULT_SCHEMA leaves the two hazard fields optional because
 * normalize() treats them as optional; here they are required and the model
 * is told to send an empty array and false when there is nothing to report.
 */
const STRICT_SCHEMA = {
  ...RESULT_SCHEMA,
  required: Object.keys(RESULT_SCHEMA.properties),
  additionalProperties: false,
}

const TOOL_NAME = 'einordnen'

/** Built once: a new object per request would churn the prompt cache. */
const TOOLS = [
  {
    name: TOOL_NAME,
    description:
      'Trägt die Einordnung des Fotos ein. Genau einmal aufrufen, mit allen Feldern.',
    strict: true,
    input_schema: STRICT_SCHEMA,
  },
]

let client = null
const getClient = () => {
  // Built lazily so importing this module never throws in a mock-only run.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 })
  return client
}

/**
 * @param {Buffer} bytes
 * @param {object} options
 * @param {string} options.mime
 * @param {string} options.mode
 * @param {number} [options.lat]
 * @param {number} [options.lon]
 * @returns {Promise<object>} the model's JSON — shape-checked, not yet validated
 */
export async function classifyWithClaude(bytes, { mime, mode, lat, lon }) {
  if (!claudeConfigured()) {
    throw new ProviderError('ANTHROPIC_API_KEY fehlt in server/.env.')
  }
  if (!BILDTYPEN.has(mime)) {
    throw new ProviderError(`Claude nimmt ${mime} nicht als Bild an.`)
  }

  let response
  try {
    response = await getClient().messages.create({
      model: claudeModel(),
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      // A classification is a look, not a deliberation: low effort keeps the
      // answer inside the six seconds the camera screen is counting out loud.
      output_config: { effort: 'low' },
      tools: TOOLS,
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } },
            { type: 'text', text: userPrompt({ mode, lat, lon }) },
          ],
        },
      ],
    })
  } catch (err) {
    // Named individually because each one has a different fix, and the person
    // who has to fix it is standing next to the laptop.
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ProviderError('Der ANTHROPIC_API_KEY wurde abgelehnt.', err)
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ProviderError('Das Anthropic-Limit ist erreicht.', err)
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new ProviderError(`Das Modell "${claudeModel()}" gibt es dort nicht.`, err)
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new ProviderError(`Claude hat in ${TIMEOUT_MS / 1000} s nicht geantwortet.`, err)
    }
    if (err instanceof Anthropic.APIError) {
      throw new ProviderError(`Claude antwortete mit ${err.status}: ${err.message}`, err)
    }
    throw new ProviderError('Claude war nicht erreichbar.', err)
  }

  // A safety decline is a real outcome, not a crash: say so and let the caller
  // fall back, rather than handing normalize() an empty object.
  if (response.stop_reason === 'refusal') {
    throw new ProviderError(
      `Claude hat die Einordnung abgelehnt${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`,
    )
  }

  const call = response.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME)
  if (call) return call.input

  // tool_choice makes this all but unreachable; if the shape ever changes,
  // a text answer is still worth reading rather than throwing away.
  const text = response.content.find((b) => b.type === 'text')
  if (text) {
    try {
      return parseModelJson(text.text)
    } catch (err) {
      throw new ProviderError('Die Antwort von Claude war kein verwertbares JSON.', err)
    }
  }

  throw new ProviderError('Claude hat keine Einordnung zurückgegeben.')
}
