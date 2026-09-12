import { one } from '../db.js'
import { A, assumptionList, assumption, km, n, nShort } from '../engine/assumptions.js'
import { impactOf } from '../engine/award.js'
import { dayBefore, placeKeyOf, subjectOf } from '../engine/context.js'
import { causesTravel, factorsUsed, formulaText } from '../engine/impact.js'
import { KINDS, baseXpFor, ruleList, score, tierOf } from '../engine/rewards.js'
import { requireUser } from '../session.js'

/**
 * The receipt — the screen this whole product is an argument for.
 *
 * Every credit can be opened and read back: which facts came from an
 * interface, which the person typed, which we computed, and from which
 * assumption. The rules are re-run here from the stored rows rather than
 * read out of a log, which is the stronger claim: the number is not merely
 * remembered, it is reproducible.
 *
 *   GET /api/receipt/:actionId
 *     -> { action, confirmed: Line[], stated: Line[], estimated: Line[],
 *          simulated: Line[], formula, credit: { xp, coins, steps } }
 *
 * The fourth block is the one addition to the sketch: a booking that came
 * back from a service WE rebuilt is neither a confirmation nor an estimate,
 * and putting it under "bestätigt" would be exactly the blurring this
 * product promises not to do.
 *
 * Line = { label, value, source } — `source` names where the value is from.
 */

const when = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

const line = (label, value, source) =>
  value === null || value === undefined || value === ''
    ? null
    : { label, value: String(value), source: source ?? null }

const clean = (rows) => rows.filter(Boolean)

export default async function receiptRoutes(app) {
  app.get('/api/receipt/:actionId', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const actionId = Number(request.params.actionId)
    if (!Number.isInteger(actionId)) {
      return reply
        .code(400)
        .send({ error: 'bad_id', message: 'Diese Nachweis-Nummer gibt es nicht.' })
    }

    const action = one('SELECT * FROM actions WHERE id = ?', actionId)
    if (!action) {
      return reply
        .code(404)
        .send({ error: 'unknown_action', message: 'Zu dieser Aktion gibt es keinen Nachweis.' })
    }
    if (action.user_id !== user.id) {
      return reply.code(403).send({
        error: 'not_yours',
        message: 'Ein Nachweis gehört der Person, die die Aktion gemacht hat.',
      })
    }

    const entry = one(
      `SELECT COALESCE(SUM(xp), 0) AS xp, COALESCE(SUM(coins), 0) AS coins,
              MIN(reason) AS reason, MIN(event_key) AS event_key
         FROM ledger_entries WHERE action_id = ?`,
      actionId,
    ) ?? { xp: 0, coins: 0, reason: null, event_key: null }

    const owner = one('SELECT * FROM users WHERE id = ?', action.user_id)
    const subject = subjectOf({
      kind: action.kind,
      refTable: action.ref_table,
      refId: action.ref_id,
      user: owner,
    })

    /* ----------------------------------------------------------------
       Re-run the rules exactly as they ran then: the day is read as of
       this action's own timestamp, so a receipt opened next week still
       shows the cap and the damper that actually applied.
       ---------------------------------------------------------------- */
    const impact = impactOf({ kind: action.kind, userId: action.user_id, subject })
    const history = dayBefore(
      action.user_id,
      action.created_at,
      placeKeyOf(action.kind, action.ref_table, action.ref_id, subject.ref),
    )

    const base = baseXpFor(action.kind, subject)
    let decision = score({
      kind: action.kind,
      tier: action.tier,
      baseXp: base,
      impact,
      day: history,
    })

    // The ledger is the truth and the chain is the explanation. If a caller
    // used a base value we cannot reconstruct, solve for the one that lands
    // on the recorded number instead of printing a chain that contradicts it.
    const reproducible = decision.xp === entry.xp
    if (!reproducible) {
      const solved = solveBase(action, impact, history, entry.xp, base)
      decision = score({
        kind: action.kind,
        tier: action.tier,
        baseXp: solved,
        impact,
        day: history,
      })
    }

    const lines = [
      ...decision.lines.slice(0, -1),
      { label: 'Gutschrift', value: `${entry.xp} XP · ${entry.coins} Münzen` },
    ]

    const blocks = provenance({ action, subject, impact, history, entry, owner })

    return {
      action: {
        id: action.id,
        kind: action.kind,
        kindLabel: KINDS[action.kind] ?? action.kind,
        title: subject.title ?? KINDS[action.kind] ?? action.kind,
        status: action.status,
        tier: action.tier,
        tierLabel: tierOf(action.tier).label,
        createdAt: action.created_at,
        whenLabel: when.format(new Date(action.created_at)),
        reason: entry.reason,
        district: subject.district?.name ?? null,
      },
      confirmed: blocks.confirmed,
      stated: blocks.stated,
      estimated: blocks.estimated,
      simulated: blocks.simulated,
      formula: formulaText(impact),
      credit: {
        xp: entry.xp,
        coins: entry.coins,
        blocked: decision.blocked || entry.xp === 0,
        hint: decision.hint,
        steps: lines.map((l) => `${l.label}: ${l.value}`),
        lines,
      },
      /** Did re-running the rules land on the recorded number? It should. */
      reproducible,
      assumptions: { used: factorsUsed(impact), all: assumptionList() },
      rules: ruleList(),
      note:
        'Alles unter Schätzung ist aus den genannten Annahmen gerechnet — keine davon ' +
        'kommt aus einer Schnittstelle.',
    }
  })
}

/**
 * The three — four — provenance blocks, built from rows rather than from
 * anything the client sent. A field that is not in the database does not
 * appear; a receipt that shows half the story beats one that invents the
 * other half.
 */
function provenance({ action, subject, impact, history, entry, owner }) {
  const confirmed = []
  const stated = []
  const estimated = []
  const simulated = []

  const t = tierOf(action.tier)
  const ref = subject.ref

  confirmed.push(
    line('Aktion', `${KINDS[action.kind] ?? action.kind} #${action.id}`, 'ReMain-Server'),
    line('Zeitpunkt', when.format(new Date(action.created_at)), 'ReMain-Server'),
    line('Nachweisstufe', `${t.label} — ${t.why}`, 'ReMain-Server'),
    line('Person', owner?.name ?? null, 'ReMain-Server'),
  )
  if (entry.event_key) {
    confirmed.push(line('Ereignis-ID der Schnittstelle', entry.event_key, 'Partner-Schnittstelle'))
  }

  switch (action.kind) {
    case 'bonus': {
      confirmed.push(line('Bonus', ref?.title, 'ReMain-Regeln'), line('Grundlage', ref?.details, 'Einmalig auf dem Server geprüft'))
      break
    }
    case 'quest': {
      const quest = subject.quest
      if (quest) {
        confirmed.push(
          line('Quest-ID', quest.id, 'ReMain-Server'),
          line('Gemeldet am', dayFmt.format(new Date(quest.created_at)), 'ReMain-Server'),
          line('Status', quest.status, 'ReMain-Server'),
          line('Stadtteil', subject.district?.name ?? null, 'Stadtteile Frankfurt'),
          line(
            'Position',
            `${quest.lat.toFixed(4)}, ${quest.lon.toFixed(4)}`,
            'Gerät der meldenden Person',
          ),
        )
        stated.push(line('Titel der Meldung', quest.title), line('Notiz', quest.note))
      }
      if (action.ref_table === 'quest_submissions' && ref) {
        const reviews = one('SELECT COUNT(*) AS n FROM peer_reviews WHERE submission_id = ?', ref.id)
        confirmed.push(
          line('Gegenprüfung', reviews?.n ? `${reviews.n} × anonym` : 'noch keine', 'ReMain-Server'),
          line('Urteil', ref.verdict, 'ReMain-Prüfung'),
        )
        if (ref.confidence !== null && ref.confidence !== undefined) {
          estimated.push(
            line('Bildvergleich', `${Math.round(ref.confidence * 100)} % Übereinstimmung`, 'Modell'),
          )
        }
        for (const s of signals(ref.reasons_json)) estimated.push(s)
      }
      break
    }

    case 'pickup': {
      if (ref) {
        // Booked through OUR stand-in for FES. That is not a confirmation.
        simulated.push(
          line('Abholtermin', ref.slot_date, 'FES (nachgebaut)'),
          line('Referenz', ref.reference, 'FES (nachgebaut)'),
          line('Status', ref.status, 'FES (nachgebaut)'),
        )
        stated.push(
          line('Adresse', ref.address),
          line('Kategorie', ref.category),
          line('Menge', ref.volume_m3 ? `ca. ${nShort(ref.volume_m3, 1)} m³` : null),
        )
        confirmed.push(line('Stadtteil', subject.district?.name ?? null, 'Stadtteile Frankfurt'))
      }
      break
    }

    case 'market': {
      if (ref) {
        confirmed.push(
          line('Artikel-ID', ref.id, 'ReMain-Server'),
          line(
            'Übergabe',
            ref.status === 'handed_over' ? 'von beiden Seiten bestätigt' : ref.status,
            'ReMain-Server',
          ),
          line('Stadtteil', subject.district?.name ?? null, 'Stadtteile Frankfurt'),
        )
        stated.push(
          line('Gerät', ref.title),
          line('Defekt', ref.defect),
          line('Zustand', ref.condition),
        )
      }
      break
    }

    case 'review': {
      confirmed.push(
        line('Geprüfte Einreichung', action.ref_id, 'ReMain-Server'),
        line('Gewicht', 'anonym, zählt nur mit einer zweiten Prüfung', 'ReMain-Regel'),
      )
      break
    }

    case 'food': {
      confirmed.push(
        line('Abholung', action.ref_id, 'foodsharing-API'),
        line('Quelle', 'foodsharing Hackathon-API', 'foodsharing-API'),
      )
      if (subject.facts.kg) stated.push(line('Menge', `${nShort(subject.facts.kg, 1)} kg`))
      break
    }

    case 'vytal': {
      confirmed.push(
        line('Ereignis', action.ref_id, 'Vytal'),
        line('Vorgang', 'Behälter zurückgegeben', 'Vytal'),
      )
      break
    }

    default:
      break
  }

  if (subject.facts.mode) stated.push(line('Verkehrsmittel', impact.modeLabel, 'deine Angabe beim Start des Hinwegs'))

  /* The computed side, the same for every kind. */
  const travels = causesTravel(action.kind, action.user_id, subject)
  if (travels && subject.home && (subject.straightKm ?? 0) > 0) {
    estimated.push(
      line(
        'Weg gerechnet ab',
        `Mittelpunkt ${subject.home.name}`,
        'Annahme — deinen Startpunkt kennen wir nicht',
      ),
      line('Luftlinie', km(subject.straightKm ?? 0), 'aus den Koordinaten'),
      line(
        'Strecke',
        `${km(impact.routeKm)} (${impact.marginal ? 'Umweg' : 'hin und zurück'})`,
        `Umwegfaktor ${nShort(A.detourFactor, 1)}`,
      ),
      ...(impact.modeAssumed ? [line('Verkehrsmittel', `${impact.modeLabel} (angenommen)`, 'Annahme aus der Entfernung')] : []),
      line('CO₂e Anfahrt', `${n(impact.travelCo2, 2)} kg`, sourceForMode(impact)),
    )
  } else {
    estimated.push(
      line(
        'Anfahrt',
        travels
          ? 'nicht berechnet — zu diesem Vorgang liegt uns kein Ort vor'
          : 'nicht berechnet — für diese Aktion fährt niemand eigens los',
        'ReMain-Regel',
      ),
    )
  }

  if (impact.savedCo2 !== null) {
    estimated.push(
      line('CO₂e vermieden', `${n(impact.savedCo2, 2)} kg`, assumption(impact.savedFactor)?.source),
      line('Netto', `${n(impact.netCo2, 2)} kg CO₂e`, 'vermieden minus Anfahrt'),
    )
  } else {
    estimated.push(
      line(
        'CO₂e vermieden',
        'wird nicht behauptet',
        'für diese Art Aktion gibt es keinen Faktor, den wir verteidigen könnten',
      ),
    )
  }

  estimated.push(
    line(
      'Heute schon bewertet',
      `${history.scoredBefore} von ${A.scoredActionsPerDay} vor dieser Aktion`,
      'aus dem Belohnungsbuch',
    ),
  )
  if (history.samePlaceBefore > 0) {
    estimated.push(
      line(
        'Am selben Ort heute',
        `${history.samePlaceBefore} × vorher`,
        'aus dem Belohnungsbuch, Umkreis 110 m',
      ),
    )
  }

  return {
    confirmed: clean(confirmed),
    stated: clean(stated),
    estimated: clean(estimated),
    simulated: clean(simulated),
  }
}

/** The per-km factor a travel line leaned on, named. */
const sourceForMode = (impact) =>
  impact.mode === 'transit'
    ? assumption('transitCo2PerKm')?.source
    : impact.mode === 'car'
      ? assumption('carCo2PerKm')?.source
      : assumption('walkThresholdKm')?.note

/** Phase 7 writes its four signals as JSON; show them when they are there. */
function signals(json) {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    const list = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([k, v]) => ({ label: k, value: v }))
    return clean(
      list
        .slice(0, 6)
        .map((s) =>
          line(
            s.label ?? 'Signal',
            typeof s.value === 'object' ? JSON.stringify(s.value) : s.value,
            s.source ?? 'Prüfsignal',
          ),
        ),
    )
  } catch {
    return []
  }
}

/**
 * Find the base value that reproduces the recorded credit.
 *
 * Only needed when a caller passed a base the engine cannot derive from the
 * stored rows. Closed form first, then a few corrections — the chain is
 * piecewise linear, so that is always enough.
 */
function solveBase(action, impact, history, targetXp, fallback) {
  const t = tierOf(action.tier)
  const penalty = impact?.travelCo2 > 0 ? Math.round(impact.travelCo2 * A.pointsPerKgCo2) : 0
  const weight = t.weight * (history.samePlaceBefore >= 2 ? A.repeatMultiplier : 1)
  if (weight === 0 || targetXp === 0) return fallback

  let guess = Math.round((targetXp + penalty) / weight)
  for (let i = 0; i < 3; i++) {
    const got = score({ kind: action.kind, tier: action.tier, baseXp: guess, impact, day: history })
      .xp
    if (got === targetXp) return guess
    guess += Math.round((targetXp - got) / weight)
  }
  return guess
}
