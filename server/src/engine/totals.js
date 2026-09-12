import { one } from '../db.js'

/**
 * Everything a person has earned, read from the append-only ledger.
 *
 * Phase 3 replaces the level curve and adds the reward rules; this is the
 * seam they land on, so nothing outside this folder ever adds up XP itself.
 */

/** Level n starts at 200 * n * (n-1) / 2 XP — gentle at first, slower later. */
export function levelFor(xp) {
  let level = 1
  while (xp >= levelStart(level + 1)) level++
  return level
}

export const levelStart = (level) => 100 * level * (level - 1)

export function totals(userId) {
  const sums = one(
    `SELECT COALESCE(SUM(xp), 0) AS xp, COALESCE(SUM(coins), 0) AS earned
       FROM ledger_entries WHERE user_id = ?`,
    userId,
  )
  const spent = one(
    'SELECT COALESCE(SUM(coins), 0) AS spent FROM redemptions WHERE user_id = ?',
    userId,
  )
  const actions = one(
    "SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND status = 'confirmed'",
    userId,
  )

  const xp = sums.xp
  const level = levelFor(xp)

  return {
    xp,
    level,
    levelStart: levelStart(level),
    levelEnd: levelStart(level + 1),
    coins: sums.earned - spent.spent,
    coinsEarned: sums.earned,
    actions: actions.n,
  }
}
