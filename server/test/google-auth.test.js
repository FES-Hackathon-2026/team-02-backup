import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'

const directory = mkdtempSync(join(tmpdir(), 'remain-google-auth-'))
process.env.DATABASE_FILE = join(directory, 'test.db')
process.env.SESSION_SECRET = 'google-auth-test-secret'
const { db, one, run } = await import('../src/db.js')
const { googleProfileFromClaims, TokenError } = await import('../src/auth/firebase.js')
const sessionRoutes = (await import('../src/routes/session.js')).default
const app = Fastify()
await app.register(cookie)
let enabled = true
// Only the external signature-verification boundary is replaced; routes, cookies and database are real.
await app.register(sessionRoutes, {
  googleEnabled: () => enabled,
  verifyGoogleToken: async token => {
    if (!token || token === 'invalid') throw new TokenError('Invalid token')
    return { uid: token, name: 'Google Person', email: 'person@example.test', emailVerified: token !== 'unverified', signInProvider: token === 'password' ? 'password' : 'google.com' }
  },
})
run("INSERT INTO districts VALUES ('bockenheim','Bockenheim',2,50.12,8.64)")
const token = id => `${id}.${createHmac('sha256', process.env.SESSION_SECRET).update(String(id)).digest('base64url')}`
const request = (method, url, payload, session) => app.inject({ method, url, payload, cookies: session ? { remain_session: session } : {} })
after(async () => { await app.close(); db.close(); rmSync(directory, { recursive: true, force: true }) })

test('only Google is advertised; guest and demo endpoints never issue cookies', async () => {
  assert.deepEqual((await request('GET', '/api/auth/config')).json(), { google: true, guest: false })
  for (const url of ['/api/session', '/api/session/switch']) {
    const response = await request('POST', url, { name: 'Guest', districtId: 'bockenheim', userId: 1 })
    assert.equal(response.statusCode, 403)
    assert.equal(response.headers['set-cookie'], undefined)
  }
  assert.equal(one('SELECT count(*) count FROM users').count, 0)
})

test('invalid tokens, non-Google providers and unverified email cannot sign in', async () => {
  for (const idToken of ['invalid', 'password', 'unverified']) {
    const response = await request('POST', '/api/session/google', { idToken, districtId: 'bockenheim' })
    assert.equal(response.statusCode, 401)
    assert.equal(response.headers['set-cookie'], undefined)
  }
  assert.equal(one('SELECT count(*) count FROM users').count, 0)
})

test('new Google user chooses district, returning user reuses profile, logout clears cookie', async () => {
  const first = await request('POST', '/api/session/google', { idToken: 'new-google' })
  assert.equal(first.statusCode, 409)
  assert.equal(first.json().error, 'district_required')
  assert.equal(first.headers['set-cookie'], undefined)
  const signedIn = await request('POST', '/api/session/google', { idToken: 'new-google', districtId: 'bockenheim' })
  assert.equal(signedIn.statusCode, 201)
  const user = signedIn.json()
  assert.equal(user.provider, 'google')
  const session = signedIn.cookies.find(cookie => cookie.name === 'remain_session').value
  assert.ok(signedIn.headers['set-cookie'].includes('HttpOnly'))
  assert.equal((await request('GET', '/api/me', undefined, session)).statusCode, 200)
  const returning = await request('POST', '/api/session/google', { idToken: 'new-google' })
  assert.equal(returning.statusCode, 200)
  assert.equal(returning.json().id, user.id)
  const logout = await request('POST', '/api/session/logout', {}, session)
  assert.equal(logout.statusCode, 200)
  assert.equal(logout.cookies.find(cookie => cookie.name === 'remain_session').value, '')
})

test('legacy guest cookies cannot access app; verified Google upgrade preserves their data', async () => {
  const id = Number(run("INSERT INTO users(name,district_id,created_at) VALUES ('Legacy','bockenheim',?)", new Date().toISOString()).lastInsertRowid)
  run("INSERT INTO photos(id,user_id,mime,bytes,byte_size,created_at) VALUES ('legacy-photo',?,'image/jpeg',?,1,?)", id, Buffer.from([1]), new Date().toISOString())
  const session = token(id)
  assert.equal((await request('GET', '/api/me', undefined, session)).statusCode, 401)
  assert.equal((await request('PATCH', '/api/me', { name: 'Changed' }, session)).statusCode, 401)
  assert.equal((await request('POST', '/api/session/google', { idToken: 'invalid' }, session)).statusCode, 401)
  assert.equal(one('SELECT auth_provider FROM users WHERE id=?', id).auth_provider, 'guest')
  const upgraded = await request('POST', '/api/session/google', { idToken: 'upgrade-google' }, session)
  assert.equal(upgraded.statusCode, 200)
  assert.equal(upgraded.json().id, id)
  assert.equal(upgraded.json().name, 'Legacy')
  assert.equal(one("SELECT user_id FROM photos WHERE id='legacy-photo'").user_id, id)
  assert.equal((await request('GET', '/api/me', undefined, session)).statusCode, 200)
})

test('demo cookies and tampered cookies cannot access the app', async () => {
  const id = Number(run("INSERT INTO users(name,district_id,created_at,is_demo,auth_provider,google_uid) VALUES ('Demo','bockenheim',?,1,'google','demo-id')", new Date().toISOString()).lastInsertRowid)
  assert.equal((await request('GET', '/api/me', undefined, token(id))).statusCode, 401)
  assert.equal((await request('GET', '/api/me', undefined, token(1) + 'x')).statusCode, 401)
})

test('missing Firebase configuration fails closed without a guest fallback', async () => {
  enabled = false
  assert.deepEqual((await request('GET', '/api/auth/config')).json(), { google: false, guest: false })
  const response = await request('POST', '/api/session/google', { idToken: 'new-google' })
  assert.equal(response.statusCode, 501)
  assert.equal(response.headers['set-cookie'], undefined)
  enabled = true
})

test('required token claims enforce Google provider, verified email and token times', () => {
  const now = Math.floor(Date.now() / 1000)
  const valid = { sub: 'google-user', exp: now + 3600, iat: now, auth_time: now, email: 'person@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }
  assert.equal(googleProfileFromClaims(valid).uid, 'google-user')
  for (const change of [{ sub: '' }, { exp: undefined }, { exp: now - 60 }, { iat: undefined }, { iat: now + 100 }, { auth_time: now + 100 }, { email_verified: false }, { email: '' }, { firebase: { sign_in_provider: 'password' } }, { firebase: { sign_in_provider: 'anonymous' } }]) {
    assert.throws(() => googleProfileFromClaims({ ...valid, ...change }), TokenError)
  }
})
