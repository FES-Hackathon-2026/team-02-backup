import { all as abcAll } from '../integrations/fes/abfall-abc.js'

/**
 * Fessie: a small model that answers, with the rules in its hand.
 *
 * The exact lookup in abfall-abc is fast and impossible to argue with, but it
 * misses anything phrased sideways — "so ein Ding mit Akku drin" — and a
 * "kein Eintrag" for that reads as broken rather than careful. So a model
 * answers instead.
 *
 * What keeps it honest is not the prompt, it is the CONTEXT: every FES rule
 * we have is handed to the model in full, and it is told to answer from those
 * and to say so plainly when the answer is not among them. The bins,
 * exclusions and legal bases it quotes are therefore ours, not the model's
 * recollection of German waste law.
 *
 * It also returns which entry it leaned on, so the screen can offer the whole
 * rule — the generated sentence is a summary, and the real text is one tap
 * behind it.
 *
 * Everything fails soft: no key, no network, a bad model id, malformed JSON —
 * all return null, and null falls back to the honest "look it up yourself"
 * the assistant already had.
 */

const BASE = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'openai/gpt-oss-20b'

export const assistantModel = () => process.env.GROQ_TEXT_MODEL || DEFAULT_MODEL
export const assistantConfigured = () => Boolean(process.env.GROQ_API_KEY)

/** What the app can do, so the answer can point at a screen. */
const FEATURES = `Was ReMain kann: Gegenstand fotografieren und einordnen lassen (Scannen);
Sperrmüll-Abholung anmelden; Dinge verschenken oder reparieren lassen (Markt);
gerettete Lebensmittel finden (Essen); Mehrweg-Behälter leihen und zurückgeben;
Abfuhrtermine im Stadtteil sehen (Kalender); Müll melden und wegräumen (Quests).`

let digest = null
/** Every rule we hold, compact enough to fit in a prompt and complete enough to answer from. */
function rules() {
  digest ??= abcAll()
    .map((e) => {
      const not = e.notAllowed?.length ? ` Nicht: ${e.notAllowed.join(' ')}` : ''
      return `[${e.id}] ${e.name} → ${e.bin}. ${e.why}${not}`
    })
    .join('\n')
  return digest
}

let ids = null
const knownIds = () => (ids ??= new Set(abcAll().map((e) => e.id)))

/**
 * Live context, so the assistant can answer "wann" and "was gibt es gerade"
 * instead of only "wohin". Both are short summaries rather than full
 * payloads: the model needs enough to answer a question, not the data set.
 */
function contextBlock(ctx) {
  const NL = '\n'
  const parts = []

  // Say whose data this is. Labelled only "ABFUHRTERMINE in Bockenheim", the
  // model read "wann wird bei MIR abgeholt" as a question about a person it
  // knew nothing about and answered "ich weiß nicht, wo du wohnst" — while
  // holding that person's dates.
  if (ctx?.district) {
    parts.push(`Die fragende Person wohnt in ${ctx.district}. "Bei mir" heißt dort.`)
  }

  if (ctx?.calendar?.length) {
    const lines = ctx.calendar.map((d) => `- ${d.titel}: ${d.label}`).join(NL)
    parts.push(`IHRE NÄCHSTEN ABFUHRTERMINE:${NL}${lines}`)
  }

  if (ctx?.market?.length) {
    const lines = ctx.market
      .map((m) => `- ${m.title} (${m.defect}) in ${m.district}`)
      .join(NL)
    parts.push(`AKTUELL IM MARKT, kostenlos abzugeben:${NL}${lines}`)
  }

  return parts.length === 0 ? '' : `${NL}${NL}${parts.join(NL + NL)}`
}

function systemPrompt(ctx) {
  return `Du bist Fessie, der Assistent der Frankfurter App ReMain. Du hilfst bei Abfall, Reparatur und Wiederverwendung in Frankfurt am Main.

ENTSORGUNGSREGELN (die einzige Quelle für Tonnen, Höfe und Verbote):
${rules()}

${FEATURES}${contextBlock(ctx)}

Antworte ausschließlich mit JSON:
{"answer": "<kurze Antwort auf Deutsch>", "entry": "<Schlüssel aus den Regeln oder null>"}

Regeln für deine Antwort:
- Höchstens zwei Sätze. Per Du. Einfache Sprache.
- Geht es um Entsorgung, nimm die Tonne und die Begründung AUS der Liste oben. Erfinde niemals eine Tonne, eine Gebühr oder eine Frist.
- Setze "entry" auf den Schlüssel, aus dem du geantwortet hast, sonst null.
- Weißt du es nicht, sage das und schlage vor, den Gegenstand zu fotografieren.
- Bei Farbe, Batterie, Öl, Spraydose oder Chemikalie gilt immer schadstoff.
- Fragen nach Terminen oder nach dem Markt beantwortest du NUR aus den Listen oben. Steht dort nichts, sage das.
- Fragen ohne Bezug zu Abfall, Reparatur oder der App beantwortest du nicht: sage freundlich, wofür du da bist.`
}

/**
 * @param {string} question
 * @param {{district?: string, calendar?: object[], market?: object[]}} [ctx]
 * @param {object} [log] fastify logger
 * @returns {Promise<{answer: string, entry: string|null}|null>}
 */
export async function ask(question, ctx, log) {
  if (!assistantConfigured()) return null
  if (typeof question !== 'string' || question.trim().length < 2) return null

  let response
  try {
    response = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: assistantModel(),
        // Deterministic: the same question must not sort into a different bin
        // on a second try.
        temperature: 0,
        // gpt-oss is a reasoning model: it spends tokens thinking before it
        // writes anything. At 220 the budget ran out mid-thought and Groq
        // answered 400 json_validate_failed with an EMPTY generation — which
        // looks like a prompt problem and is not one.
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(ctx) },
          { role: 'user', content: question.slice(0, 400) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (cause) {
    log?.warn({ err: String(cause) }, 'assistant: groq unreachable')
    return null
  }

  if (!response.ok) {
    log?.warn({ status: response.status }, 'assistant: groq refused')
    return null
  }

  try {
    const body = await response.json()
    const parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? '')
    const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''
    if (answer === '') return null
    // The entry is only carried through if it is one of ours — a link to an
    // invented id would 404, which is a worse failure than no link.
    const entry = knownIds().has(parsed?.entry) ? parsed.entry : null
    return { answer: answer.slice(0, 400), entry }
  } catch {
    return null
  }
}
