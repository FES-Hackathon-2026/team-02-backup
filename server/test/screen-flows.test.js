import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jpeg from 'jpeg-js'

const dir = mkdtempSync(join(tmpdir(), 'remain-screen-flows-'))
process.env.DATABASE_FILE = join(dir, 'test.db')
process.env.SESSION_SECRET = 'screen-flow-tests'
const { db, one, run } = await import('../src/db.js')
const app = Fastify()
await app.register(cookie)
for (const route of ['progression', 'session', 'content', 'fes', 'market-write', 'quests-write', 'rewards', 'receipt', 'mobility', 'vytal']) {
  await app.register((await import(`../src/routes/${route}.js`)).default)
}
run("INSERT INTO districts VALUES ('bockenheim','Bockenheim',2,50.12,8.64)")
for (let user = 1; user <= 4; user++) run("INSERT INTO users(id,name,district_id,created_at) VALUES (?,?,'bockenheim',?)", user, `Test ${user}`, new Date().toISOString())
const bytes = jpeg.encode({ width: 32, height: 32, data: Buffer.alloc(32 * 32 * 4, 180) }, 70).data
for (const user of [1, 2]) run("INSERT INTO photos(id,user_id,mime,bytes,byte_size,lat,lon,created_at) VALUES (?,?,'image/jpeg',?,?,50.12,8.64,?)", `photo-${user}`, user, bytes, bytes.length, new Date().toISOString())
const token = user => `${user}.${createHmac('sha256', process.env.SESSION_SECRET).update(String(user)).digest('base64url')}`
async function call(method, url, payload, user = 1, expected = 200) {
  const res = await app.inject({ method, url, payload, cookies: { remain_session: token(user) } })
  const body = res.json()
  assert.equal(res.statusCode, expected, `${method} ${url}: ${JSON.stringify(body)}`)
  return body
}
after(async () => { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }) })

test('screen APIs expose empty states and live account totals without broken routes', async () => {
  for (const url of ['/api/me', '/api/quests', '/api/quests/mine', '/api/market', '/api/market/mine', '/api/market/defects', '/api/fes/categories', '/api/fes/calendar', '/api/fes/notifications', '/api/impact', '/api/season', '/api/coupons', '/api/fes/abc?category=papier']) await call('GET', url)

  // Vytal is the one screen API backed by a partner credential. Without
  // VYTAL_JWT the honest answer is 503 no_key, not a broken route — so
  // assert that it is one of the two, rather than pinning it to 200 and
  // making the suite depend on a token no CI run should hold.
  const res = await app.inject({ method: 'GET', url: '/api/vytal/containers', cookies: { remain_session: token(1) } })
  assert.ok(
    res.statusCode === 200 || (res.statusCode === 503 && res.json().error === 'no_key'),
    `GET /api/vytal/containers: ${res.statusCode} ${JSON.stringify(res.json())}`,
  )
})

test('scan photo → market offer → reservation → both confirmations → receipt and balance', async () => {
  const catalogue = await call('GET', '/api/market/defects')
  const category = catalogue.categories[0]
  const payload = { title: 'Test Waschmaschine', category: category.id, defect: catalogue.defects[category.id][0], photoId: 'photo-1' }
  await call('POST', '/api/market', payload, 2, 422)
  const offer = await call('POST', '/api/market', payload, 1, 201)
  const id = offer.item.id
  await call('POST', `/api/market/${id}/claim`, {}, 1, 409)
  await call('POST', `/api/market/${id}/claim`, {}, 2)
  await call('POST', `/api/market/${id}/handover`, {}, 3, 403)
  const first = await call('POST', `/api/market/${id}/handover`, {}, 1)
  assert.equal(first.item.status, 'reserved')
  const second = await call('POST', `/api/market/${id}/handover`, {}, 2)
  assert.equal(second.item.status, 'handed_over')
  assert.ok(second.award.actionId)
  const receipt = await call('GET', `/api/receipt/${second.award.actionId}`, undefined, 2)
  assert.equal(receipt.credit.xp, second.award.xp)
  const before = (await call('GET', '/api/me', undefined, 2)).xp
  await call('POST', `/api/market/${id}/handover`, {}, 2)
  assert.equal((await call('GET', '/api/me', undefined, 2)).xp, before)
})

test('quest report → claim → declared journey → photo proof → peer review and immutable receipt', async () => {
  await call('POST', '/api/quests', { title: 'Fremdes Foto', photoId: 'photo-1' }, 2, 422)
  const report = await call('POST', '/api/quests', { title: 'Test Papier am Weg', lat: 50.12, lon: 8.64 }, 1, 201)
  const id = report.quest.id
  await call('POST', `/api/quests/${id}/claim`, {}, 1, 409)
  await call('POST', `/api/quests/${id}/journey`, { mode: 'bike' }, 2, 409)
  await call('POST', `/api/quests/${id}/claim`, {}, 2)
  await call('POST', `/api/quests/${id}/journey`, { mode: 'plane' }, 2, 422)
  await call('POST', `/api/quests/${id}/journey`, { mode: 'bike' }, 2)
  assert.equal((await call('GET', `/api/quests/${id}/journey`, undefined, 2)).journey.mode, 'bike')
  assert.equal((await call('GET', `/api/quests/${id}/journey`, undefined, 3)).journey, null)
  // Twenty minutes of an otherwise active two-hour claim.
  run('UPDATE quests SET claimed_until=? WHERE id=?', new Date(Date.now() + 100 * 60_000).toISOString(), id)
  const submitted = await call('POST', `/api/quests/${id}/submit`, { photoId: 'photo-2' }, 2, 201)
  assert.ok(submitted.submission.id)
  await call('POST', `/api/quests/${id}/journey`, { mode: 'car' }, 2, 409)
  const sub = submitted.submission.id
  if (submitted.submission.verdict === 'pending') {
    await call('POST', `/api/reviews/${sub}`, { answer: 'clean' }, 3)
    await call('POST', `/api/reviews/${sub}`, { answer: 'clean' }, 3, 409)
    await call('POST', `/api/reviews/${sub}`, { answer: 'clean' }, 4)
    const final = await call('GET', `/api/quests/${id}/proof`, undefined, 2)
    assert.equal(final.quest.status, 'confirmed')
    const action = one("SELECT id FROM actions WHERE user_id=2 AND ref_table='quest_submissions' AND ref_id=? AND status='confirmed'", sub)
    assert.ok(action)
    const receipt = await call('GET', `/api/receipt/${action.id}`, undefined, 2)
    assert.ok(JSON.stringify(receipt.stated).includes('Rad'))
  } else assert.fail(`Expected independent review for absent before-photo; got ${submitted.submission.verdict}`)
})

// Skipped, not deleted, so the gap stays visible.
//
// This exercised the SIMULATED Vytal: /api/vytal/borrow, a `partners` array
// and container_type. The real Merchant-API integration on main replaced all
// three — checkout now goes through /api/vytal/checkout with a transactionId
// minted from a scanned QR code, and the store token decides the location, so
// there is no partner to choose.
//
// Rewriting it needs a Vytal test credential. As of 12.09.2026 our token is
// not even cleared for account creation (ServiceNameRequired), so there is
// nothing to write the new test against yet.
test.skip('reusable loan → return → receipt; repeat return cannot duplicate reward', async () => {
  const state = await call('GET', '/api/vytal/containers', undefined, 4)
  const partner = state.partners.find(p => p.accepts.includes('bowl_1000'))
  assert.ok(partner)
  const borrowed = await call('POST', '/api/vytal/borrow', { partnerId: partner.partner_id, containerType: 'bowl_1000' }, 4)
  const payload = { containerId: borrowed.container.container_id, partnerId: partner.partner_id }
  const returned = await call('POST', '/api/vytal/returns', payload, 4)
  assert.ok(returned)
  const before = (await call('GET', '/api/me', undefined, 4)).xp
  const repeat = await call('POST', '/api/vytal/returns', payload, 4)
  assert.equal(repeat.repeat, true)
  assert.equal((await call('GET', '/api/me', undefined, 4)).xp, before)
})

test('coupon balance is checked; issued code survives catalogue refresh', async () => {
  await call('POST', '/api/redeem', { couponId: 'c-reparatur' }, 1, 409)
  // Give test account enough earned coins without mutating anyone's real account.
  run("INSERT INTO ledger_entries(user_id,xp,coins,reason,tier,created_at) VALUES(1,300,30,'Test fixture','confirmed',?)", new Date().toISOString())
  const redeemed = await call('POST', '/api/redeem', { couponId: 'c-reparatur' }, 1, 201)
  assert.ok(redeemed.redemption.code)
  const catalogue = await call('GET', '/api/coupons')
  assert.ok(JSON.stringify(catalogue).includes(redeemed.redemption.code))
})

test('transport previews use ledger factors and match pre-cap quest rewards for every mode', async () => {
  const { compare } = await import('../src/integrations/traffiq/compare.js')
  const { calcImpact } = await import('../src/engine/impact.js')
  const { score } = await import('../src/engine/rewards.js')
  const { distanceKm } = await import('../src/db.js')
  const from = { lat: 50.12, lon: 8.64 }
  const to = { lat: 50.11, lon: 8.69 }
  const preview = compare({ from, to, at: 12 * 3600, baseXp: 60 })
  for (const option of preview.options) {
    const impact = calcImpact({ kind: 'quest', straightKm: distanceKm(from, to), mode: option.mode })
    const decision = score({ kind: 'quest', tier: 'plausible', baseXp: 60, impact, day: { scoredBefore: 0, samePlaceBefore: 0 } })
    assert.equal(option.xp.resultXp, decision.xp, option.mode)
  }
})


test('quiz checks answers on the server and pays only once with a linked receipt', async () => {
  const created = await call('POST', '/api/session', { name: 'Quiz Test', districtId: 'bockenheim' }, 1, 201)
  const user = created.id
  const questions = await call('GET', '/api/knowledge/quiz', undefined, user)
  assert.equal(questions.questions.length, 3)
  assert.ok(questions.questions.every(q => q.answer === undefined))
  await call('POST', '/api/knowledge/quiz', { answers: [0] }, user, 422)
  assert.equal((await call('POST', '/api/knowledge/quiz', { answers: [0, 0, 0] }, user)).passed, false)
  const first = await call('POST', '/api/knowledge/quiz', { answers: [0, 1, 2] }, user)
  assert.equal(first.credit.xp, 10)
  const repeat = await call('POST', '/api/knowledge/quiz', { answers: [0, 1, 2] }, user)
  assert.equal(repeat.credit.repeat, true)
  assert.equal(repeat.credit.actionId, first.credit.actionId)
  assert.equal((await call('GET', '/api/me', undefined, user)).actions, 0)
  const receipt = await call('GET', `/api/receipt/${first.credit.actionId}`, undefined, user)
  assert.equal(receipt.credit.xp, 10)
  assert.ok(JSON.stringify(receipt.confirmed).includes('Abfallwissen'))
})

test('signed invitation binds signup; reward requires a scored photo action and cannot repeat', async () => {
  const progress = await call('GET', '/api/progression', undefined, 1)
  const created = await call('POST', '/api/session', { name: 'Invited Test', districtId: 'bockenheim', inviteCode: progress.invitation.code }, 1, 201)
  const user = created.id
  assert.equal(one('SELECT referrer_id FROM referrals WHERE referred_id=?', user).referrer_id, 1)
  const before = (await call('GET', '/api/me')).xp
  const photoId = `invited-${user}`
  run("INSERT INTO photos(id,user_id,mime,bytes,byte_size,lat,lon,created_at) VALUES (?,?,'image/jpeg',?,?,50.12,8.64,?)", photoId, user, bytes, bytes.length, new Date().toISOString())
  await call('POST', '/api/quests', { title: 'Foto-Aktion Einladung', photoId }, user, 201)
  const rewarded = (await call('GET', '/api/me')).xp
  assert.ok(rewarded >= before + 50)
  await call('POST', '/api/quests', { title: 'Weitere Foto-Aktion', photoId }, user, 201)
  assert.equal((await call('GET', '/api/me')).xp, rewarded)
  assert.equal(one('SELECT COUNT(*) n FROM reward_events WHERE id=?', `referral:${user}`).n, 1)
  const invalid = await call('POST', '/api/session', { name: 'Invalid Test', districtId: 'bockenheim', inviteCode: progress.invitation.code + 'x' }, 1, 201)
  assert.equal(one('SELECT * FROM referrals WHERE referred_id=?', invalid.id), undefined)
})

test('weekly and level bonuses are atomic, exactly once and excluded from activity counts', async () => {
  const { award } = await import('../src/engine/award.js')
  const { weeklyProgress, weekKey } = await import('../src/engine/progression.js')
  const { tx } = await import('../src/db.js')
  const created = await call('POST', '/api/session', { name: 'Weekly Test', districtId: 'bockenheim' }, 1, 201)
  const user = created.id
  const monday = weekKey()
  for (let i = 0; i < 4; i++) {
    const at = `${monday}T${String(8 + i).padStart(2, '0')}:00:00Z`
    const a = run("INSERT INTO actions(user_id,kind,status,tier,created_at) VALUES(?,'quest','confirmed','plausible',?)", user, at).lastInsertRowid
    run("INSERT INTO ledger_entries(user_id,action_id,xp,coins,reason,tier,created_at) VALUES(?,?,10,1,'Earlier activity','plausible',?)", user, a, at)
  }
  // The fixture exercises the settlement independently of today's daily-cap count.
  const { grantProgression } = await import('../src/engine/progression.js')
  run("INSERT INTO actions(user_id,kind,status,tier,created_at) VALUES(?,'quest','confirmed','plausible',?)", user, new Date().toISOString())
  const a = one('SELECT MAX(id) id FROM actions WHERE user_id=?', user).id
  run("INSERT INTO ledger_entries(user_id,action_id,xp,coins,reason,tier,created_at) VALUES(?,?,160,16,'Current activity','plausible',?)", user, a, new Date().toISOString())
  tx(() => grantProgression(user, { kind: 'quest', subject: { ref: null }, beforeLevel: 1 }))()
  assert.equal(weeklyProgress(user).count, 5)
  assert.equal(weeklyProgress(user).earned, true)
  assert.equal((await call('GET', '/api/me', undefined, user)).xp, 280)
  assert.equal((await call('GET', '/api/me', undefined, user)).actions, 5)
  tx(() => grantProgression(user, { kind: 'quest', subject: { ref: null }, beforeLevel: 1 }))()
  assert.equal((await call('GET', '/api/me', undefined, user)).xp, 280)
  assert.throws(() => tx(() => { award({ userId: user, kind: 'quest', tier: 'plausible', xp: 20, reason: 'rollback', eventKey: 'rollback-event' }); throw new Error('rollback') })())
  assert.equal(one("SELECT id FROM ledger_entries WHERE event_key='rollback-event'"), undefined)
  assert.equal(weekKey('2026-09-13T22:30:00Z'), '2026-09-14')
})

test('crossing a level through quiz credit awards the level bonus once with matching receipts', async () => {
  const created = await call('POST', '/api/session', { name: 'Level Test', districtId: 'bockenheim' }, 1, 201)
  const user = created.id
  run("INSERT INTO ledger_entries(user_id,xp,coins,reason,tier,created_at) VALUES(?,195,19,'Before level boundary','confirmed',?)", user, new Date().toISOString())
  await call('POST', '/api/knowledge/quiz', { answers: [0, 1, 2] }, user)
  const me = await call('GET', '/api/me', undefined, user)
  assert.equal(me.level, 2)
  assert.equal(me.xp, 255)
  const progression = await call('GET', '/api/progression', undefined, user)
  assert.equal(progression.latestLevelBonus.xp, 50)
  const receipt = await call('GET', `/api/receipt/${progression.latestLevelBonus.actionId}`, undefined, user)
  assert.equal(receipt.credit.xp, 50)
  await call('POST', '/api/knowledge/quiz', { answers: [0, 1, 2] }, user)
  assert.equal((await call('GET', '/api/me', undefined, user)).xp, 255)
})
