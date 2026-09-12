import { all, distanceKm, id, now, one, run, tx } from '../db.js'
import { recall } from '../agent/index.js'
import { HAZARD_ROUTES, HAZARD_SAFETY, isHazard } from '../agent/taxonomy.js'
import { verdictLabel, verify } from '../agent/verify.js'
import { award } from '../engine/award.js'
import { BASE_XP } from '../engine/rewards.js'
import { requireUser } from '../session.js'

/**
 * Phase 7 — Quests, the writing half.
 *
 *   GET  /api/quests/mine          what I reported, took on, handed in, may check
 *   GET  /api/quests/:id/proof     one quest with its chain, signals and verdict
 *   POST /api/quests               melden
 *   POST /api/quests/:id/claim     übernehmen — two hours of precedence
 *   POST /api/quests/:id/release   das Vorrecht zurückgeben
 *   POST /api/quests/:id/submit    einreichen — four signals, the rules decide
 *   POST /api/quests/:id/review    gegenprüfen  (same handler as below)
 *   GET  /api/reviews/:submissionId  the one question a neighbour is asked
 *   POST /api/reviews/:submissionId  their answer
 *
 * GET /api/quests (the open list) stays in content.js.
 *
 * Three things this file is built around:
 *
 * **Hazards never become quests.** A find the scan agent flagged as
 * `schadstoff` cannot be reported here at all. FES tells clean-up volunteers
 * in so many words not to collect paint tins, oil cans or car batteries and
 * to send the location instead — so there is no path through these endpoints
 * that turns one into something a person can claim, and no call to action
 * anywhere in the flow that invites picking one up.
 *
 * **Nobody clears what they reported.** Report plus clear by one person is
 * 70 XP for moving a bag two metres. Refused at claim and again at submit.
 *
 * **The rules decide, the model advises.** agent/verify.js weighs four
 * signals into `plausible | unmatched | pending`; five of six points release
 * a credit on their own, anything less asks two people in the neighbourhood.
 *
 * --- one note on storage -------------------------------------------------
 * schema.sql is closed, and it has no column for "this submission is waiting
 * on its peer review". Like phase 6, that state lives in `actions`, which the
 * schema declares as the row per thing a person did:
 *
 *   ref_table 'quest_submissions', ref_id <submissionId>
 *   status pending -> confirmed | rejected
 *
 * The ledger is never touched from here. Points come from award() only.
 */

/* ------------------------------------------------------------------
   The numbers, all of them from the engine or from the phase brief —
   none invented here, and none pre-multiplied. award() applies the tier
   weight, the repeat damper, the travel deduction and the daily cap.
   ------------------------------------------------------------------ */

/** Reporting is worth something, but far less than clearing. */
const REPORT_XP = 10

/** Two hours of precedence, so three people do not walk to the same spot. */
const CLAIM_HOURS = 2

/** Two matching answers decide a peer review. */
const REVIEW_QUORUM = 2

const ANSWERS = new Set(['clean', 'not_clean', 'cannot_see'])

/**
 * May the person who reported a quest check the clean-up of it?
 *
 * Yes — and this is the one place the brief's shorthand ("nobody reviews
 * their own quest") needed a decision. The conflict of interest sits with
 * the person whose credit is at stake, and that is the submitter, never the
 * reporter: their report was paid at the moment they made it, and nothing
 * about the review changes their ledger. Excluding them as well would also
 * make a three-phone demo unable to reach a quorum, which is exactly the
 * flow this phase exists to show. Flip this to false for a stricter rule.
 */
const REPORTER_MAY_REVIEW = true

/* ------------------------------------------------------------------ */

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
/**
 * A number, or null.
 *
 * Written out rather than `Number.isFinite(Number(v))`, because that coerces
 * null, '' and false to 0 — and a photo with no position would have become a
 * quest at 0°/0°, which is in the Atlantic.
 */
const num = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const seconds = (from, to) => Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000)

function nearestDistrict(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  let best = null
  for (const d of all('SELECT id, lat, lon FROM districts')) {
    const km = distanceKm({ lat, lon }, d)
    if (!best || km < best.km) best = { id: d.id, km }
  }
  return best?.id ?? null
}

const QUEST_SELECT = `
  SELECT q.*, d.name AS district_name,
         r.name AS reporter_name, c.name AS claimer_name
    FROM quests q
    LEFT JOIN districts d ON d.id = q.district_id
    LEFT JOIN users r     ON r.id = q.created_by
    LEFT JOIN users c     ON c.id = q.claimed_by`

const loadQuest = (questId) => one(`${QUEST_SELECT} WHERE q.id = ?`, questId)

/**
 * When a claim was taken.
 *
 * `quests` stores only `claimed_until`, and schema.sql is closed — but this
 * file wrote that value, so subtracting the window gives the exact moment
 * back rather than an estimate. Both the chain and the time signal use it.
 */
const claimStart = (quest) =>
  quest.claimed_until === null
    ? null
    : new Date(Date.parse(quest.claimed_until) - CLAIM_HOURS * 3_600_000).toISOString()

/** A claim only holds while its two hours run. */
const claimHolds = (quest) =>
  quest.claimed_by !== null &&
  quest.claimed_until !== null &&
  Date.parse(quest.claimed_until) > Date.now()

function shape(quest) {
  const holds = claimHolds(quest)
  return {
    id: quest.id,
    title: quest.title,
    note: quest.note,
    category: quest.category,
    lat: quest.lat,
    lon: quest.lon,
    district: quest.district_name ?? null,
    districtId: quest.district_id,
    xp: quest.xp,
    status: quest.status,
    photoId: quest.photo_id,
    createdBy: quest.reporter_name ?? null,
    createdById: quest.created_by,
    claimedBy: holds ? quest.claimed_by : null,
    claimerName: holds ? (quest.claimer_name ?? null) : null,
    claimedUntil: holds ? quest.claimed_until : null,
    claimSecondsLeft: holds
      ? Math.round((Date.parse(quest.claimed_until) - Date.now()) / 1000)
      : null,
    createdAt: quest.created_at,
    openForDays: Math.max(0, Math.round((Date.now() - Date.parse(quest.created_at)) / 86_400_000)),
  }
}

/** The newest submission for a quest, whatever became of it. */
const latestSubmission = (questId) =>
  one(
    `SELECT s.*, u.name AS user_name
       FROM quest_submissions s
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.quest_id = ?
      ORDER BY s.created_at DESC, s.rowid DESC
      LIMIT 1`,
    questId,
  ) ?? null

const loadSubmission = (submissionId) =>
  one(
    `SELECT s.*, u.name AS user_name
       FROM quest_submissions s
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    submissionId,
  ) ?? null

const reviewsOf = (submissionId) =>
  all(
    'SELECT * FROM peer_reviews WHERE submission_id = ? ORDER BY created_at',
    submissionId,
  )

function tally(rows) {
  const counts = { clean: 0, not_clean: 0, cannot_see: 0 }
  for (const r of rows) counts[r.answer] = (counts[r.answer] ?? 0) + 1
  return counts
}

/** The pending row that stands in for "waiting on its peer review". */
const pendingAction = (submissionId) =>
  one(
    `SELECT * FROM actions
      WHERE ref_table = 'quest_submissions' AND ref_id = ?
      ORDER BY id DESC LIMIT 1`,
    submissionId,
  )

/**
 * The stored proof, with what the peer review made of it written onto the
 * end of its sentence chain.
 *
 * The four signals are never rewritten — what the rules found at the moment
 * of submission stays exactly as it was. The review only adds a line, so
 * every phone that opens the quest afterwards reads one chain of reasoning
 * rather than two half-stories that disagree.
 */
function closeProof(submission, step, releasedBy) {
  let proof
  try {
    proof = JSON.parse(submission.reasons_json ?? '{}')
  } catch {
    proof = {}
  }
  return JSON.stringify({
    ...proof,
    steps: [...(proof.steps ?? []), step],
    releasedBy,
    decidedBy: releasedBy === 'peer_review' ? 'peers' : (proof.decidedBy ?? 'rules'),
  })
}

/** The ledger row behind a credit, so a screen can link to its receipt. */
function creditFor(eventKey) {
  const row = one(
    'SELECT action_id, xp, coins FROM ledger_entries WHERE event_key = ?',
    eventKey,
  )
  return row ? { actionId: row.action_id, xp: row.xp, coins: row.coins } : null
}

const clearKey = (questId) => `quest:clear:${questId}`
const reportKey = (questId) => `quest:report:${questId}`
const reviewKey = (reviewId) => `review:${reviewId}`

/* ------------------------------------------------------------------
   Who may check a submission, and why not.
   ------------------------------------------------------------------ */

function reviewRight(quest, submission, rows, userId) {
  if (!submission) return { can: false, why: 'Zu dieser Quest liegt kein Nachweis vor.' }
  if (submission.user_id === userId) {
    return {
      can: false,
      why: 'Deinen eigenen Nachweis prüfst du nicht — daran hängt deine Gutschrift.',
    }
  }
  if (!REPORTER_MAY_REVIEW && quest.created_by === userId) {
    return { can: false, why: 'Du hast diese Quest gemeldet.' }
  }
  if (rows.some((r) => r.user_id === userId)) {
    return { can: false, why: 'Du hast hier schon geantwortet — einmal pro Nachweis.' }
  }
  if (submission.verdict !== 'pending' && submission.verdict !== 'unmatched') {
    return { can: false, why: 'Dieser Nachweis ist schon entschieden.' }
  }
  /* A refused submission can be redone with a better photo. Once it has
     been, answering the old one would release a credit for evidence nobody
     is looking at any more. */
  if (latestSubmission(quest.id)?.id !== submission.id) {
    return { can: false, why: 'Zu dieser Quest liegt inzwischen ein neuerer Nachweis vor.' }
  }
  return { can: true, why: null }
}

/**
 * The status chain, always all four, so the person sees where they are and
 * what is still missing rather than only the current word.
 */
function chainOf(quest, submission, decided) {
  const order = ['open', 'claimed', 'submitted', 'confirmed']
  const reached = order.indexOf(quest.status)
  return [
    { id: 'gemeldet', label: 'gemeldet', done: true, at: quest.created_at },
    {
      id: 'uebernommen',
      label: 'übernommen',
      done: reached >= 1 || submission !== null,
      at: claimStart(quest),
    },
    {
      id: 'eingereicht',
      label: 'eingereicht',
      done: submission !== null,
      at: submission?.created_at ?? null,
    },
    {
      id: 'bestaetigt',
      label: 'bestätigt',
      done: quest.status === 'confirmed',
      at: decided ?? null,
    },
  ]
}

/**
 * Everything a screen needs for one quest. `viewerId` decides what is shown,
 * never what is stored.
 *
 * The signals are deliberately withheld from somebody who is about to review
 * and has not answered yet: a reviewer who has just read "die Regeln sagen
 * plausibel" is no longer an independent second look.
 */
function detail(quest, viewerId) {
  const submission = latestSubmission(quest.id)
  const rows = submission ? reviewsOf(submission.id) : []
  const counts = tally(rows)
  const mine = rows.find((r) => r.user_id === viewerId) ?? null
  const right = submission ? reviewRight(quest, submission, rows, viewerId) : { can: false, why: null }

  const holds = claimHolds(quest)
  const role =
    quest.created_by === viewerId
      ? 'reporter'
      : submission?.user_id === viewerId
        ? 'submitter'
        : holds && quest.claimed_by === viewerId
          ? 'claimer'
          : 'visitor'

  const proof = submission ? JSON.parse(submission.reasons_json ?? '{}') : null
  const credit = creditFor(clearKey(quest.id))
  const action = submission ? pendingAction(submission.id) : null

  // Hidden while this person could still be an independent second opinion.
  const blind = right.can && mine === null

  return {
    quest: shape(quest),
    role,
    chain: chainOf(quest, submission, credit ? (action?.created_at ?? null) : null),
    canClaim:
      quest.created_by !== viewerId &&
      (quest.status === 'open' || (quest.status === 'claimed' && !holds)),
    claimBlockedWhy:
      quest.created_by === viewerId
        ? 'Deine eigene Meldung räumt jemand anderes weg — sonst wären Melden und Erledigen ein Klick.'
        : holds && quest.claimed_by !== viewerId
          ? `${quest.claimer_name ?? 'Jemand'} hat das gerade übernommen.`
          : null,
    submission: submission
      ? {
          id: submission.id,
          questId: quest.id,
          userId: submission.user_id,
          userName: submission.user_name,
          photoId: submission.photo_id,
          beforePhotoId: quest.photo_id,
          verdict: submission.verdict,
          verdictLabel: verdictLabel(submission.verdict),
          confidence: submission.confidence,
          createdAt: submission.created_at,
          blind,
          score: blind ? null : (proof?.score ?? null),
          maxScore: proof?.maxScore ?? null,
          signals: blind ? null : (proof?.signals ?? []),
          steps: blind ? null : (proof?.steps ?? []),
          veto: blind ? null : (proof?.veto ?? null),
          model: blind ? null : (proof?.model ?? null),
          rule: proof?.rule ?? null,
          decidedBy: 'rules',
        }
      : null,
    review: submission
      ? {
          question: 'Ist die Stelle auf dem zweiten Foto sauber?',
          quorum: REVIEW_QUORUM,
          answers: rows.length,
          counts,
          mine: mine?.answer ?? null,
          canReview: right.can,
          why: right.why,
          open: submission.verdict === 'pending' || submission.verdict === 'unmatched',
          outcome:
            counts.clean >= REVIEW_QUORUM
              ? 'released'
              : counts.not_clean >= REVIEW_QUORUM
                ? 'rejected'
                : null,
          note:
            'Anonym: gespeichert wird nur, dass geantwortet wurde, und was — nie, wer was gesagt hat, ' +
            'außer für die eine Regel „einmal pro Nachweis“.',
        }
      : null,
    credit,
    attribution: '© OpenStreetMap contributors (ODbL)',
  }
}

/* ------------------------------------------------------------------
   Hazards. The refusal, and the safe path offered in its place.
   ------------------------------------------------------------------ */

/**
 * A hazardous find never becomes a claimable quest.
 *
 * Two independent checks, because the in-memory scan cache can be gone
 * after a restart: what the agent decided about this photo, and what the
 * client claims the category is. Either one saying `schadstoff` is enough.
 */
function hazardRefusal({ photoId, category }) {
  const scan = photoId ? recall(photoId) : null
  const fromScan = scan?.hazard ?? null
  const fromClient = isHazard(category)

  if (!fromScan && !fromClient) return null

  return {
    error: 'hazard_not_a_quest',
    message:
      'Gefahrstoffe werden nicht als Quest gemeldet. Niemand soll dafür bezahlt werden, ' +
      'eine Farbdose oder eine Autobatterie anzufassen.',
    why:
      'FES sagt es Freiwilligen bei Sauberkeitsaktionen ausdrücklich: Farbeimer, Ölkanister und ' +
      'Autobatterien nicht einsammeln, sondern den Fundort melden. Das übernimmt geschultes Personal.',
    hazard: fromScan
      ? { ...fromScan, safety: fromScan.safety ?? HAZARD_SAFETY }
      : { headline: 'Gefahrstoff', safety: HAZARD_SAFETY, signals: [], dropoff: null },
    /** Never a clean-up route: hand-in, official report, documented find. */
    routes: HAZARD_ROUTES.map((r) => ({ ...r })),
    next: photoId ? `/erkannt/${photoId}` : '/wissen',
  }
}

/* ------------------------------------------------------------------ */

export default async function questsWriteRoutes(app) {
  /**
   * My side of the quests: what I reported, what I took on, what I handed
   * in, and what is waiting for a second pair of eyes near me.
   *
   * Registered as a static path, which find-my-way prefers over the
   * `/api/quests/:id` in content.js, so the two never collide.
   */
  app.get('/api/quests/mine', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const lat = num(request.query?.lat)
    const lon = num(request.query?.lon)
    const radiusKm = num(request.query?.r) ?? 30

    const near = (q) =>
      lat === null || lon === null
        ? { ...q, distanceKm: undefined }
        : { ...q, distanceKm: Number(distanceKm({ lat, lon }, q).toFixed(2)) }

    const reported = all(`${QUEST_SELECT} WHERE q.created_by = ? ORDER BY q.created_at DESC`, user.id)
      .map(shape)
      .map(near)

    const claimed = all(
      `${QUEST_SELECT} WHERE q.claimed_by = ? AND q.status IN ('claimed', 'submitted')
        ORDER BY q.created_at DESC`,
      user.id,
    )
      .map(shape)
      .map(near)

    /* Everything handed in and still undecided, minus my own and minus the
       ones I already answered. The UNIQUE constraint enforces the second
       rule in the database; this only keeps the list honest. */
    const open = all(
      `SELECT s.*, u.name AS user_name
         FROM quest_submissions s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.verdict IN ('pending', 'unmatched')
        ORDER BY s.created_at DESC
        LIMIT 40`,
    )

    const reviewable = []
    for (const s of open) {
      const quest = loadQuest(s.quest_id)
      if (!quest) continue
      const rows = reviewsOf(s.id)
      if (!reviewRight(quest, s, rows, user.id).can) continue

      const shaped = near(shape(quest))
      if (shaped.distanceKm !== undefined && shaped.distanceKm > radiusKm) continue

      reviewable.push({
        submissionId: s.id,
        quest: shaped,
        beforePhotoId: quest.photo_id,
        afterPhotoId: s.photo_id,
        answers: rows.length,
        quorum: REVIEW_QUORUM,
        submittedAt: s.created_at,
        xp: BASE_XP.review,
      })
    }

    reviewable.sort((a, b) => (a.quest.distanceKm ?? 99) - (b.quest.distanceKm ?? 99))

    return { reported, claimed, reviewable, reviewXp: BASE_XP.review, reportXp: REPORT_XP }
  })

  /** One quest with everything behind it. The proof screen lives on this. */
  app.get('/api/quests/:id/proof', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const quest = loadQuest(request.params.id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }
    return detail(quest, user.id)
  })

  /**
   * Melden.
   *
   * The photo normally comes straight from the scan, so the picture the
   * agent looked at is the picture the next person compares against — and
   * it is the "before" half of the proof later on.
   */
  app.post('/api/quests', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const body = request.body ?? {}
    const title = text(body.title, 80)
    const note = text(body.note, 200)
    const category = text(body.category, 20) || 'muell'

    /* Before anything else, and before anything is written: a hazardous
       find is not a quest and never becomes one. */
    const refusal = hazardRefusal({ photoId: body.photoId, category })
    if (refusal) return reply.code(422).send(refusal)

    if (title.length < 3) {
      return reply.code(422).send({
        error: 'title_too_short',
        message: 'Sag in ein paar Worten, was da liegt — „Müllsack an der Bushaltestelle“ reicht.',
      })
    }

    let photo = null
    if (body.photoId) {
      photo = one('SELECT id, lat, lon FROM photos WHERE id = ?', body.photoId)
      if (!photo) {
        return reply
          .code(422)
          .send({ error: 'unknown_photo', message: 'Dieses Foto kennen wir nicht.' })
      }
    }

    // The photo's own position wins: it was taken at the thing. The one sent
    // with the report only fills a gap.
    const lat = num(photo?.lat) ?? num(body.lat)
    const lon = num(photo?.lon) ?? num(body.lon)

    if (lat === null || lon === null) {
      return reply.code(422).send({
        error: 'position_required',
        message:
          'Ohne Standort kann niemand hingehen und niemand gegenprüfen. Gib den Standort frei ' +
          'oder mach das Foto direkt vor Ort.',
      })
    }

    const districtId = nearestDistrict(lat, lon) ?? user.district_id
    const questId = id('q')

    run(
      `INSERT INTO quests
         (id, created_by, title, note, category, lat, lon, district_id, photo_id, xp, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      questId,
      user.id,
      title,
      note || null,
      category,
      lat,
      lon,
      districtId,
      photo?.id ?? null,
      BASE_XP.quest,
      now(),
    )

    /* The report is credited straight away, and at `estimated`: there is a
       photo and a position, but nobody has checked either. The bounty for
       clearing it is six times as large and needs the four signals — which
       is exactly the ratio we want between saying and doing. */
    const credit = award({
      userId: user.id,
      kind: 'quest',
      refTable: 'quests',
      refId: questId,
      tier: 'estimated',
      reason: `„${title}“ gemeldet — mit Foto und Standort, von niemandem geprüft`,
      xp: REPORT_XP,
      eventKey: reportKey(questId),
    })

    request.log.info({ questId, userId: user.id, districtId }, 'quest reported')

    return reply.code(201).send({
      ...detail(loadQuest(questId), user.id),
      message:
        'Gemeldet. Jetzt sehen es alle in deinem Stadtteil auf der Karte — wegräumen darf es ' +
        'jemand anderes.',
      award: credit.ok
        ? {
            xp: credit.xp,
            coins: credit.coins,
            actionId: credit.actionId,
            blocked: credit.blocked,
            hint: credit.hint,
            totals: credit.totals,
          }
        : null,
    })
  })

  /**
   * Übernehmen — two hours of precedence.
   *
   * Without it three people walk to the same corner and two of them find it
   * already clean, which is the fastest way to lose a volunteer.
   */
  app.post('/api/quests/:id/claim', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const quest = loadQuest(request.params.id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }

    if (quest.created_by === user.id) {
      return reply.code(409).send({
        error: 'own_quest',
        message:
          'Deine eigene Meldung räumt jemand anderes weg. Melden und Erledigen in einer Hand wäre ' +
          '70 XP dafür, einen Sack zwei Meter zu tragen.',
      })
    }
    if (quest.status === 'confirmed') {
      return reply.code(409).send({ error: 'already_done', message: 'Das ist schon erledigt.' })
    }
    if (quest.status === 'submitted') {
      return reply.code(409).send({
        error: 'in_review',
        message: 'Hier läuft gerade die Gegenprüfung eines Nachweises.',
      })
    }
    if (claimHolds(quest) && quest.claimed_by !== user.id) {
      const left = Math.round((Date.parse(quest.claimed_until) - Date.now()) / 60_000)
      return reply.code(409).send({
        error: 'claimed',
        message: `${quest.claimer_name ?? 'Jemand'} hat das übernommen — noch ${left} Min. Vorrecht.`,
      })
    }

    const until = new Date(Date.now() + CLAIM_HOURS * 3_600_000).toISOString()
    run(
      "UPDATE quests SET status = 'claimed', claimed_by = ?, claimed_until = ? WHERE id = ?",
      user.id,
      until,
      quest.id,
    )

    return {
      ...detail(loadQuest(quest.id), user.id),
      message:
        `Für dich reserviert, ${CLAIM_HOURS} Stunden lang. In der Zeit kann es niemand anderes ` +
        'übernehmen — danach wird es wieder frei.',
    }
  })

  /** Plans change. Giving it back is better than letting it sit for two hours. */
  app.post('/api/quests/:id/release', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const quest = loadQuest(request.params.id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }
    if (quest.claimed_by !== user.id || quest.status !== 'claimed') {
      return reply
        .code(409)
        .send({ error: 'not_yours', message: 'Du hast diese Quest gerade nicht übernommen.' })
    }

    run(
      "UPDATE quests SET status = 'open', claimed_by = NULL, claimed_until = NULL WHERE id = ?",
      quest.id,
    )
    return {
      ...detail(loadQuest(quest.id), user.id),
      message: 'Zurückgegeben. Jemand anderes kann sie jetzt übernehmen.',
    }
  })

  /**
   * Einreichen — the after-photo, and with it the proof.
   *
   * Four signals go to agent/verify.js and a verdict comes back. Five of six
   * points release the credit here and now; anything less becomes a pending
   * action row and a question for two people in the neighbourhood.
   */
  app.post('/api/quests/:id/submit', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const quest = loadQuest(request.params.id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }

    // The same refusal as at claim, so no route through this file can pay
    // one person for both halves.
    if (quest.created_by === user.id) {
      return reply.code(409).send({
        error: 'own_quest',
        message: 'Den Nachweis für deine eigene Meldung nehmen wir nicht an.',
      })
    }
    if (quest.status === 'confirmed') {
      return reply.code(409).send({ error: 'already_done', message: 'Das ist schon bestätigt.' })
    }
    if (quest.claimed_by !== user.id) {
      return reply.code(409).send({
        error: 'not_claimed',
        message: 'Übernimm die Quest zuerst — sonst lässt sich der Zeitabstand nicht prüfen.',
      })
    }
    if (!claimHolds(quest)) {
      return reply.code(409).send({
        error: 'claim_expired',
        message: `Dein Vorrecht von ${CLAIM_HOURS} Stunden ist abgelaufen. Übernimm sie noch einmal.`,
      })
    }
    if (latestSubmission(quest.id)?.verdict === 'pending') {
      return reply.code(409).send({
        error: 'already_submitted',
        message: 'Zu dieser Quest läuft schon eine Gegenprüfung.',
      })
    }

    const afterPhoto = one(
      'SELECT id, mime, bytes, lat, lon, user_id FROM photos WHERE id = ?',
      text(request.body?.photoId, 40),
    )
    if (!afterPhoto) {
      return reply.code(422).send({
        error: 'photo_required',
        message: 'Ohne Nachher-Foto gibt es nichts zu prüfen.',
      })
    }
    if (afterPhoto.user_id !== user.id) {
      return reply.code(403).send({
        error: 'foreign_photo',
        message: 'Das Nachher-Foto muss von dir sein.',
      })
    }

    const beforePhoto = quest.photo_id
      ? one('SELECT id, mime, bytes, lat, lon FROM photos WHERE id = ?', quest.photo_id)
      : null

    const ts = now()
    const claimedAt = claimStart(quest)

    const proof = await verify({
      quest,
      beforePhoto,
      afterPhoto,
      seconds: seconds(claimedAt, ts),
      claimedAt,
      clientHash: text(request.body?.hash, 32) || undefined,
      log: request.log,
    })

    const submissionId = id('sub')
    tx(() => {
      run(
        `INSERT INTO quest_submissions
           (id, quest_id, user_id, photo_id, verdict, confidence, reasons_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        submissionId,
        quest.id,
        user.id,
        afterPhoto.id,
        proof.verdict,
        proof.confidence,
        JSON.stringify(proof),
        ts,
      )
      /* A vetoed submission leaves the quest claimed rather than moving it
         to `submitted`: the person still holds their two hours and can come
         back with a better photo, and nobody else is locked out of a corner
         that was never actually cleared. */
      if (proof.verdict !== 'unmatched') {
        run("UPDATE quests SET status = 'submitted' WHERE id = ?", quest.id)
      }
    })()

    let credit = null

    if (proof.verdict === 'plausible') {
      /* The signals carried it: credited now, at `plausible` — checked from
         several signals, not handed to us by an interface. */
      const result = award({
        userId: user.id,
        kind: 'quest',
        refTable: 'quest_submissions',
        refId: submissionId,
        tier: 'plausible',
        reason: `„${quest.title}“ weggeräumt — ${proof.score} von ${proof.maxScore} Prüfpunkten`,
        xp: quest.xp ?? BASE_XP.quest,
        eventKey: clearKey(quest.id),
      })

      run("UPDATE quests SET status = 'confirmed' WHERE id = ?", quest.id)
      run(
        `INSERT INTO actions (user_id, kind, ref_table, ref_id, status, tier, created_at)
         VALUES (?, 'quest', 'quest_submissions', ?, 'confirmed', 'plausible', ?)`,
        user.id,
        submissionId,
        ts,
      )

      credit = result.ok
        ? {
            xp: result.xp,
            coins: result.coins,
            actionId: result.actionId,
            blocked: result.blocked,
            hint: result.hint,
            totals: result.totals,
          }
        : null
    } else {
      /* Not enough on its own. The pending row is the "waiting on two
         neighbours" state — schema.sql has no column for it, and `actions`
         is the table the schema declares for exactly this. */
      run(
        `INSERT INTO actions (user_id, kind, ref_table, ref_id, status, tier, created_at)
         VALUES (?, 'quest', 'quest_submissions', ?, 'pending', ?, ?)`,
        user.id,
        submissionId,
        proof.verdict,
        ts,
      )
    }

    request.log.info(
      {
        questId: quest.id,
        submissionId,
        verdict: proof.verdict,
        score: proof.score,
        modelAsked: proof.model.asked,
      },
      'quest submission',
    )

    return reply.code(201).send({
      ...detail(loadQuest(quest.id), user.id),
      message:
        proof.verdict === 'plausible'
          ? `${proof.score} von ${proof.maxScore} Prüfpunkten — das trägt ohne Rückfrage. Gutgeschrieben.`
          : proof.verdict === 'unmatched'
            ? `${proof.veto?.label ?? 'Ein Signal'} widerspricht. Zwei Leute aus der Nachbarschaft können das aufheben.`
            : `${proof.score} von ${proof.maxScore} Prüfpunkten — das reicht nicht allein. Zwei Leute in der Nähe werden gefragt.`,
      award: credit,
    })
  })

  /* ----------------------------------------------------------------
     Gegenprüfen. One question, three answers, two matching ones decide.

     Shaped like the two-sided confirmation in phase 6: the submission sits
     as a pending `actions` row and only the answer that completes the
     quorum creates anything — each side through award() with its own
     event key, so a double tap can never pay twice.
     ---------------------------------------------------------------- */

  /** The question, without the machine's opinion attached. */
  app.get('/api/reviews/:submissionId', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const submission = loadSubmission(request.params.submissionId)
    if (!submission) {
      return reply
        .code(404)
        .send({ error: 'unknown_submission', message: 'Diesen Nachweis gibt es nicht.' })
    }
    const quest = loadQuest(submission.quest_id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }
    return detail(quest, user.id)
  })

  async function review(request, reply, submission) {
    const user = requireUser(request, reply)
    if (!user) return

    if (!submission) {
      return reply.code(404).send({
        error: 'unknown_submission',
        message: 'Zu dieser Quest liegt kein Nachweis vor.',
      })
    }

    const quest = loadQuest(submission.quest_id)
    if (!quest) {
      return reply.code(404).send({ error: 'unknown_quest', message: 'Diese Quest gibt es nicht.' })
    }

    const answer = text(request.body?.answer, 20)
    if (!ANSWERS.has(answer)) {
      return reply.code(422).send({
        error: 'unknown_answer',
        message: 'Nur ja, nein oder „kann ich nicht sehen“.',
      })
    }

    const before = reviewsOf(submission.id)
    const right = reviewRight(quest, submission, before, user.id)
    if (!right.can) {
      return reply.code(409).send({ error: 'may_not_review', message: right.why })
    }

    const reviewId = id('rev')
    const ts = now()
    try {
      run(
        `INSERT INTO peer_reviews (id, submission_id, user_id, answer, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        reviewId,
        submission.id,
        user.id,
        answer,
        ts,
      )
    } catch {
      // The UNIQUE (submission_id, user_id) in schema.sql is the real
      // guarantee; reviewRight() above is only the friendly version of it.
      return reply.code(409).send({
        error: 'already_reviewed',
        message: 'Du hast hier schon geantwortet.',
      })
    }

    /* The reviewer is paid for looking, whatever they answered and whatever
       the quorum does — including „kann ich nicht sehen“, which is the most
       useful honest answer there is. `plausible`, because the act itself is
       one we observed; only its content is their statement. */
    const reviewerCredit = award({
      userId: user.id,
      kind: 'review',
      refTable: 'peer_reviews',
      refId: reviewId,
      tier: 'plausible',
      reason: `Nachweis zu „${quest.title}“ gegengeprüft`,
      xp: BASE_XP.review,
      eventKey: reviewKey(reviewId),
    })

    const counts = tally([...before, { answer }])
    let released = null
    let outcome = null

    if (counts.clean >= REVIEW_QUORUM && submission.verdict !== 'plausible') {
      outcome = 'released'
      run(
        "UPDATE quest_submissions SET verdict = 'plausible', reasons_json = ? WHERE id = ?",
        closeProof(submission, `Gegenprüfung: ${counts.clean} × ja — freigegeben`, 'peer_review'),
        submission.id,
      )
      run("UPDATE quests SET status = 'confirmed' WHERE id = ?", quest.id)
      run(
        `UPDATE actions SET status = 'confirmed', tier = 'plausible'
          WHERE ref_table = 'quest_submissions' AND ref_id = ? AND status = 'pending'`,
        submission.id,
      )

      const result = award({
        userId: submission.user_id,
        kind: 'quest',
        refTable: 'quest_submissions',
        refId: submission.id,
        tier: 'plausible',
        reason: `„${quest.title}“ weggeräumt — von ${REVIEW_QUORUM} Leuten aus der Nachbarschaft bestätigt`,
        xp: quest.xp ?? BASE_XP.quest,
        eventKey: clearKey(quest.id),
      })
      released = result.ok
        ? { xp: result.xp, coins: result.coins, actionId: result.actionId, blocked: result.blocked }
        : null
    } else if (counts.not_clean >= REVIEW_QUORUM) {
      outcome = 'rejected'
      run(
        "UPDATE quest_submissions SET verdict = 'unmatched', reasons_json = ? WHERE id = ?",
        closeProof(submission, `Gegenprüfung: ${counts.not_clean} × nein — abgelehnt`, null),
        submission.id,
      )
      run(
        `UPDATE actions SET status = 'rejected', tier = 'unmatched'
          WHERE ref_table = 'quest_submissions' AND ref_id = ? AND status = 'pending'`,
        submission.id,
      )
      // Nothing was cleared, so the quest goes back on the map rather than
      // quietly disappearing. No ledger row is ever undone.
      run(
        "UPDATE quests SET status = 'open', claimed_by = NULL, claimed_until = NULL WHERE id = ?",
        quest.id,
      )
    }

    request.log.info(
      { submissionId: submission.id, answer, counts, outcome },
      'peer review',
    )

    const fresh = detail(loadQuest(quest.id), user.id)
    return {
      ...fresh,
      message:
        outcome === 'released'
          ? `Danke. Zwei übereinstimmende Antworten — ${submission.user_name ?? 'die Person'} ist gutgeschrieben.`
          : outcome === 'rejected'
            ? 'Danke. Zwei Antworten sagen, dass es nicht sauber ist — die Quest steht wieder auf der Karte.'
            : `Danke. Noch ${REVIEW_QUORUM - Math.max(counts.clean, counts.not_clean)} übereinstimmende Antwort, dann ist entschieden.`,
      outcome,
      released,
      award: reviewerCredit.ok
        ? {
            xp: reviewerCredit.xp,
            coins: reviewerCredit.coins,
            actionId: reviewerCredit.actionId,
            blocked: reviewerCredit.blocked,
            hint: reviewerCredit.hint,
            totals: reviewerCredit.totals,
          }
        : null,
    }
  }

  /** The contract's path: the newest undecided submission for this quest. */
  app.post('/api/quests/:id/review', async (request, reply) =>
    review(request, reply, latestSubmission(request.params.id)),
  )

  /** What the review screen calls — it was handed a submission id. */
  app.post('/api/reviews/:submissionId', async (request, reply) =>
    review(request, reply, loadSubmission(request.params.submissionId)),
  )
}
