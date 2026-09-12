import { all } from '../db.js'
import { ask, assistantConfigured, assistantModel } from '../agent/assistant.js'
import * as abc from '../integrations/fes/abfall-abc.js'
import * as calendar from '../integrations/fes/calendar.js'
import { requireUser } from '../session.js'

/**
 * Fessie's one endpoint.
 *
 * Two stages, cheapest first:
 *
 *   lookup   the exact matcher in abfall-abc. Free, instant, deterministic,
 *            and right for "batterie" or "altes sofa" — which is most of
 *            what gets typed. No model call happens at all for these.
 *   model    everything else. The rules, the app's features and this
 *            person's actual collection dates and market listings go in as
 *            context, so the answer is grounded in our data rather than the
 *            model's memory of German waste law.
 *
 * `source` says which one answered, and the client shows them differently:
 * an exact rule is not the same claim as a sentence a model wrote, even a
 * well-grounded one.
 */

/** Enough to answer "wann" and "was gibt es" — not the whole data set. */
function liveContext(user) {
  const district = all('SELECT name FROM districts WHERE id = ?', user.district_id)[0]?.name

  let dates = []
  try {
    dates = (calendar.dates(user.district_id, { perFraktion: 1 })?.dates ?? []).slice(0, 6)
  } catch {
    /* the calendar is a rebuilt service; no dates is a fine answer */
  }

  // Open offers only, newest first, and few: the model needs a sample to
  // answer "was gibt es gerade", not an inventory.
  const market = all(
    `SELECT m.title, m.defect, d.name AS district
       FROM market_items m
       LEFT JOIN districts d ON d.id = m.district_id
      WHERE m.status = 'open'
      ORDER BY m.created_at DESC
      LIMIT 8`,
  )

  return { district, calendar: dates, market }
}

export default async function assistantRoutes(app) {
  /** What the assistant can do here, so the client can hide what is missing. */
  app.get('/api/assistant/status', async () => ({
    model: assistantConfigured() ? assistantModel() : null,
    lookup: true,
  }))

  app.post('/api/assistant', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const question = String(request.body?.question ?? '').trim()
    const language = request.body?.language === 'en' ? 'en' : 'de'
    if (question.length < 2) {
      return reply.code(422).send({
        error: 'empty_question',
        message: 'Bitte stell eine Frage.',
      })
    }

    // Stage one: the exact matcher — but only for something that IS a term.
    //
    // On a sentence it is too eager: "wann wird bei mir der Biomüll abgeholt"
    // matched Restmüll and answered with a bin, when the question was about a
    // date. It grabs the first waste word it recognises and cannot tell wo
    // from wann. Three words or fewer is a lookup; a sentence goes to the
    // model, which holds the same rules plus the dates and the market.
    const terse = question.split(/\s+/).length <= 3
    const hit = terse ? abc.lookup(question) : null
    if (hit) {
      // The PARTS, not a sentence. Each of these exists in the client's
      // dictionary; the sentence they compose into does not, so composing
      // here would hand the client something it cannot translate.
      return {
        answer: `${hit.name}: ${hit.bin}. ${hit.why}`,
        parts: { name: hit.name, bin: hit.bin, why: hit.why },
        entry: { id: hit.id, name: hit.name },
        source: 'lookup',
      }
    }

    // Stage two: the model, holding our rules and this person's data.
    const answered = await ask(question, liveContext(user), request.log, language)
    if (answered) {
      const entry = answered.entry ? abc.lookup(answered.entry) : null
      return {
        answer: answered.answer,
        entry: entry ? { id: entry.id, name: entry.name } : null,
        source: 'model',
      }
    }

    // Both failed. Say so rather than inventing something.
    return {
      answer: assistantConfigured()
        ? 'Das weiß ich gerade nicht. Fotografiere den Gegenstand — das erkennt mehr als ich.'
        : 'Dazu habe ich keinen Eintrag. Fotografiere den Gegenstand — das erkennt mehr als ich.',
      entry: null,
      source: 'none',
    }
  })
}
