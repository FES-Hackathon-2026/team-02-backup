import { createHmac, timingSafeEqual } from 'node:crypto'

import { one } from './db.js'

/** Signed application sessions are issued only after verified Google sign-in. */
const COOKIE = 'remain_session'
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-not-a-secret'

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET must be configured in production.')
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

  if (!/^[1-9][0-9]*$/.test(value)) return null
  const userId = Number(value)
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null
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
function cookieUser(request) {
  const userId = verify(request.cookies?.[COOKIE])
  if (userId === null) return null
  return one('SELECT * FROM users WHERE id = ?', userId) ?? null
}

/** Legacy cookies may only be used to migrate their own guest row after Google verification. */
export function legacyGuestForUpgrade(request) {
  const user = cookieUser(request)
  return user && user.is_demo === 0 && !user.google_uid && user.auth_provider === 'guest' ? user : null
}

/** Guest and demo cookies cannot access authenticated routes. */
export function currentUser(request) {
  const user = cookieUser(request)
  return user && user.is_demo === 0 && user.auth_provider === 'google' && user.google_uid ? user : null
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
      message: 'Bitte zuerst mit Google anmelden.',
    })
    return null
  }
  return user
}
