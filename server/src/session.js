import { createHmac, timingSafeEqual } from 'node:crypto'

import { one } from './db.js'

/**
 * Identity without a hurdle.
 *
 * A judge should be signed in within ten seconds: a name, a Stadtteil, done.
 * No password, no email, no confirmation step — there is nothing here worth
 * stealing, and every barrier costs us demo time.
 *
 * The device gets a cookie holding "<userId>.<hmac>". The signature is what
 * stops someone editing the number to act as another person; it is not
 * pretending to be authentication.
 */
const COOKIE = 'remain_session'
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-not-a-secret'

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[remain] SESSION_SECRET is unset in production — sessions are forgeable.')
}

const sign = (value) => createHmac('sha256', SECRET).update(value).digest('base64url')

function verify(token) {
  if (typeof token !== 'string') return null
  const cut = token.lastIndexOf('.')
  if (cut < 1) return null

  const value = token.slice(0, cut)
  const given = Buffer.from(token.slice(cut + 1))
  const want = Buffer.from(sign(value))
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  const userId = Number.parseInt(value, 10)
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

export function setSession(reply, userId) {
  const value = String(userId)
  reply.setCookie(COOKIE, `${value}.${sign(value)}`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearSession(reply) {
  reply.clearCookie(COOKIE, { path: '/' })
}

/** The signed-in user row, or null. */
export function currentUser(request) {
  const userId = verify(request.cookies?.[COOKIE])
  if (userId === null) return null
  return one('SELECT * FROM users WHERE id = ?', userId) ?? null
}

/**
 * Guard for routes that need a person. Replies 401 and returns null when
 * there is none, so a handler reads:
 *
 *   const user = requireUser(request, reply)
 *   if (!user) return
 */
export function requireUser(request, reply) {
  const user = currentUser(request)
  if (!user) {
    reply.code(401).send({
      error: 'not_signed_in',
      message: 'Bitte zuerst anmelden — Name und Stadtteil genügen.',
    })
    return null
  }
  return user
}
