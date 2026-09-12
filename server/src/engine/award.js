import { now, one, run, tx } from '../db.js'
import { dayBefore, placeKeyOf, subjectOf } from './context.js'
import { causesTravel, calcImpact } from './impact.js'
import { baseXpFor, score } from './rewards.js'
import { totals } from './totals.js'

/**
 * The ONE place XP and coins come into existence.
 *
 * Every feature calls this and nothing else, with the same signature it had
 * before the rules existed — phases 5 to 9 were written against it and did
 * not have to change when the rules landed.
 *
 * Invariants that hold and must keep holding:
 *
 *   append-only     nothing here updates or deletes a ledger row
 *   exactly-once    an eventKey can be paid at most once, ever
 *   explainable     every credit can be re-derived later from stored rows
 *   server-only     the client never computes a point
 *
 * `xp` is the BASE value of the act, before any rule. Do not pre-apply a
 * tier weight, a cap or a travel deduction to it — this function does that,
 * and `GET /api/receipt/:actionId` re-runs the same chain from the same rows
 * to explain the result. `engine/rewards.js` exports `BASE_XP` with the
 * value each kind is worth, so callers do not have to invent one.
 *
 * A blocked action still returns ok:true with xp 0 and a `hint` saying what
 * would have made it count. It is recorded either way — the action is the
 * point, the reward is only the acknowledgement.
 *
 * @param {object} input
 * @param {number} input.userId
 * @param {'quest'|'pickup'|'market'|'review'|'food'|'vytal'} input.kind
 * @param {string} [input.refTable]
 * @param {string} [input.refId]
 * @param {'confirmed'|'plausible'|'estimated'|'simulated'|'unmatched'|'pending'} input.tier
 * @param {string} input.reason        shown to the person, in German
 * @param {number} input.xp            base XP before any rule applies
 * @param {string} [input.eventKey]    partner event id — the exactly-once key
 * @returns {{ok: true, actionId: number, xp: number, coins: number, blocked: boolean,
 *            hint: string|null, breakdown: {label: string, value: string}[], totals: object}
 *          | {ok: false, code: 'already_paid', message: string}}
 */
export function award({ userId, kind, refTable, refId, tier, reason, xp, eventKey }) {
  if (eventKey) {
    const seen = one('SELECT id FROM ledger_entries WHERE event_key = ?', eventKey)
    if (seen) {
      return {
        ok: false,
        code: 'already_paid',
        message: 'Dieses Ereignis wurde bereits belohnt.',
      }
    }
  }

  const ts = now()
  const user = one('SELECT * FROM users WHERE id = ?', userId)

  // The facts, then the rules, then the write — in that order, and reading
  // the day BEFORE inserting, so this action never counts itself.
  const subject = subjectOf({ kind, refTable, refId, user })
  const impact = impactOf({ kind, userId, subject })
  const day = dayBefore(userId, ts, placeKeyOf(kind, refTable, refId, subject.ref))

  const decision = score({
    kind,
    tier,
    baseXp: xp ?? baseXpFor(kind, subject),
    impact,
    day,
  })

  const actionId = tx(() => {
    const action = run(
      `INSERT INTO actions (user_id, kind, ref_table, ref_id, status, tier, created_at)
       VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`,
      userId,
      kind,
      refTable ?? null,
      refId ?? null,
      tier,
      ts,
    )
    const id = Number(action.lastInsertRowid)

    run(
      `INSERT INTO ledger_entries (user_id, action_id, xp, coins, reason, tier, event_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      id,
      decision.xp,
      decision.coins,
      reason,
      tier,
      eventKey ?? null,
      ts,
    )
    return id
  })()

  return {
    ok: true,
    actionId,
    xp: decision.xp,
    coins: decision.coins,
    blocked: decision.blocked,
    hint: decision.hint,
    breakdown: decision.lines,
    totals: totals(userId),
  }
}

/**
 * The impact of an action, derived from stored rows only.
 *
 * Deliberately not a parameter: `award()` keeps its signature, and anything
 * the receipt cannot read back from the database later is a number that
 * could not be explained. Shared with the receipt so both sides compute it
 * the same way.
 */
export function impactOf({ kind, userId, subject }) {
  const travels = causesTravel(kind, userId, subject)
  const straightKm = travels ? (subject.straightKm ?? 0) : 0

  const impact = calcImpact({
    kind,
    straightKm,
    mode: subject.facts.mode ?? undefined,
    facts: { kg: subject.facts.kg, uses: subject.facts.uses },
  })

  // Why there is no trip in the sum: nobody drove, or we do not know where
  // it happened. Those read very differently on a receipt.
  impact.travelReason = travels ? (straightKm > 0 ? 'charged' : 'unknown') : 'none'
  return impact
}
