import { createHmac, timingSafeEqual } from 'node:crypto'
import { all, one, run, now, tx } from '../db.js'
import { award } from './award.js'
import { totals } from './totals.js'
import { berlinDay } from './context.js'

const SIGNING_KEY = process.env.SESSION_SECRET ?? 'dev-only-not-a-secret'
export const inviteCode = userId => `${userId}.${createHmac('sha256', SIGNING_KEY).update(`invite:${userId}`).digest('base64url').slice(0, 20)}`
export function bindInvitation(userId, code) {
  if (typeof code !== 'string' || !/^\d+\.[\w-]{20}$/.test(code)) return false
  const referrer = Number(code.split('.')[0])
  if (referrer === userId || !one('SELECT id FROM users WHERE id=?', referrer)) return false
  const expected = Buffer.from(inviteCode(referrer)); const given = Buffer.from(code)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
  run('INSERT OR IGNORE INTO referrals(referred_id,referrer_id,created_at) VALUES(?,?,?)', userId, referrer, now())
  return true
}
export function weekKey(at = now()) {
  const date = new Date(`${berlinDay(at)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0, 10)
}
export function weeklyProgress(userId) {
  const week = weekKey()
  const actions = all("SELECT a.created_at FROM actions a WHERE a.user_id=? AND a.status='confirmed' AND a.kind<>'bonus' AND EXISTS(SELECT 1 FROM ledger_entries l WHERE l.action_id=a.id AND l.xp>0)", userId)
  return { week, count: actions.filter(a => weekKey(a.created_at) === week).length, goal: 5, xp: 30, earned: !!one('SELECT id FROM reward_events WHERE id=?', `weekly:${userId}:${week}`) }
}
export function bonus(userId, key, title, xp, details) {
  return tx(() => {
    const previous = one('SELECT a.id AS actionId, l.xp, l.coins FROM actions a JOIN ledger_entries l ON l.action_id=a.id WHERE l.event_key=?', key)
    if (previous) return { ...previous, repeat: true }
    const beforeLevel = totals(userId).level
    run('INSERT INTO reward_events(id,user_id,title,base_xp,details,created_at) VALUES(?,?,?,?,?,?)', key, userId, title, xp, details, now())
    const result = award({ userId, kind: 'bonus', refTable: 'reward_events', refId: key, tier: 'confirmed', xp, reason: title, eventKey: key })
    grantLevels(userId, beforeLevel)
    return { ...result, totals: totals(userId), repeat: false }
  })()
}
/** Runs inside the original award transaction; bonuses never count as new acts. */
export function grantProgression(userId, { kind, subject, beforeLevel }) {
  const weekly = weeklyProgress(userId)
  if (weekly.count >= weekly.goal) bonus(userId, `weekly:${userId}:${weekly.week}`, 'Wochenziel erreicht', 30, 'Fünf bewertete Aktionen in einer Kalenderwoche (Europe/Berlin).')
  const photographed = !!subject.ref?.photo_id || (kind === 'pickup' && !!one('SELECT id FROM pickup_items WHERE pickup_id=? AND photo_id IS NOT NULL', subject.ref?.id))
  const invitation = photographed ? one('SELECT referrer_id FROM referrals WHERE referred_id=?', userId) : null
  if (invitation) {
    const referrer = invitation.referrer_id
    const old = totals(referrer).level
    bonus(referrer, `referral:${userId}`, 'Nachbar:in ist aktiv geworden', 50, 'Die eingeladene Person hat eine mit Foto belegte Aktion bestätigt. Einmal pro Einladung.')
    grantLevels(referrer, old)
  }
  grantLevels(userId, beforeLevel)
}
function grantLevels(userId, beforeLevel) {
  for (let level = beforeLevel + 1; level <= totals(userId).level; level++) {
    bonus(userId, `level:${userId}:${level}`, `Level ${level} erreicht`, 50, `Einmaliger Bonus für das Erreichen von Level ${level}.`)
  }
}
