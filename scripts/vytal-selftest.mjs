#!/usr/bin/env node
/**
 * Vytal integration — self-test against a simulated partner.
 *
 * Registration and checkout have both been driven against the real API since
 * the token was reissued on 12.09.2026 — a real cup really was handed out.
 * The half that has never run live is the half that pays: a return booked
 * through our own route, and the `award()` that follows it exactly once.
 * This script drives that against a stand-in *of the API*, through the real
 * routes, the real ledger and the real database.
 *
 * That distinction is the whole point. Nothing here reimplements our logic:
 * `fetch` is intercepted at the boundary and everything above it — the route
 * handlers, `ensureVytalUser`, the transaction bookkeeping, `cycleKey`,
 * `award()` — is the code that will run in production. What it proves is that
 * our half is correct and waiting on Vytal, rather than untested.
 *
 * What it deliberately cannot prove: that Vytal's real answers have the shape
 * these fixtures assume. Those came from their documentation, and the two
 * places the documentation was already wrong are noted in INTEGRATION.md.
 *
 *   node scripts/vytal-selftest.mjs
 */
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* A throwaway database — this test writes ledger rows. */
const dir = mkdtempSync(join(tmpdir(), 'vytal-selftest-'))
process.env.DATABASE_FILE = join(dir, 'test.db')
process.env.VYTAL_JWT = 'header.eyJzdG9yZV9pZCI6InN0cl90ZXN0In0.signature'
process.env.VYTAL_STORE_NAME = 'Teststation'
process.env.PORT = '8123'
process.env.SESSION_SECRET = 'selftest'
/* The server's request log would bury the assertions. */
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn'

/* ------------------------------------------------------------------
   The stand-in partner. Fixture shapes come from the Vytal docs.
   ------------------------------------------------------------------ */

const LOAN_MS = 14 * 86_400_000
const CONTAINER_ID = '3d0f0356-e1f6-49a9-942b-1596b2607fff'
const QR = 'HTTP://VYT.TO/ABC123'

/** The partner's memory: who holds what, and since when. */
const vytal = {
  users: new Map(), // reference -> uuid
  checkedOutAt: null,
  returnedAt: null,
  /** transactionId -> the answer already given, i.e. real idempotency. */
  seen: new Map(),
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const container = () => ({
  containerName: 'B_0754',
  containerId: CONTAINER_ID,
  checkoutTime: new Date(vytal.checkedOutAt).toISOString(),
  returnTime: vytal.returnedAt ? new Date(vytal.returnedAt).toISOString() : null,
  returnDeadline: new Date(vytal.checkedOutAt + LOAN_MS).toISOString(),
  status: vytal.returnedAt ? 'Returned' : 'CheckedOut',
  containerTypeId: 1,
  containerTypeName: '1250ml Bowl DE',
  containerTypeSizeHelper: 'L',
  containerTypeImageUrl: 'https://example.invalid/bowl.png',
  isOnHold: false,
  onHoldSince: null,
  checkoutStoreName: 'Teststation',
  checkinStoreName: vytal.returnedAt ? 'Teststation' : null,
  restrictedCheckinInfo: null,
  overduePrice: 0,
  creditsOnReturn: 0,
})

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(typeof input === 'string' ? input : input.url)
  if (!url.includes('vytal.org')) return realFetch(input, init)

  const { pathname, searchParams } = new URL(url)
  const body = init?.body ? JSON.parse(init.body) : null

  /* Idempotency, the way the real service offers it. */
  if (body?.transactionId && vytal.seen.has(body.transactionId)) {
    return json(vytal.seen.get(body.transactionId))
  }

  if (pathname.endsWith('/ReferencedAnonUser/Create')) {
    const ref = searchParams.get('userId')
    if (!vytal.users.has(ref)) vytal.users.set(ref, randomUUID())
    return json({ success: true, userId: vytal.users.get(ref) })
  }

  if (pathname.endsWith('/Container/CheckCode')) {
    const code = searchParams.get('code')
    if (code !== QR) return json({ codeOk: false, type: 'Invalid' })
    return json({
      codeOk: true,
      type: 'Container',
      containerName: 'B_0754',
      containerTypeId: 1,
      containerTypeName: '1250ml Bowl DE',
      containerTypeSizeHelper: 'L',
      containerTypeImageUrl: 'https://example.invalid/bowl.png',
      id: CONTAINER_ID,
      shortId: 'ABC123',
      containerStatus: vytal.checkedOutAt && !vytal.returnedAt ? 'CheckedOut' : 'InStock',
    })
  }

  if (pathname.endsWith('/Containers/Checkout')) {
    vytal.checkedOutAt = Date.now()
    vytal.returnedAt = null
    const answer = {
      result: 'Success',
      storeName: 'Teststation',
      timestamp: new Date().toISOString(),
      containers: [{ name: 'B_0754', id: CONTAINER_ID, typeId: 1 }],
      currentUserContainerCount: 1,
      transactionContainerCount: 1,
      showCheckoutLimitWarning: false,
      remainingCheckouts: 9,
    }
    if (body?.transactionId) vytal.seen.set(body.transactionId, answer)
    return json(answer)
  }

  if (pathname.endsWith('/Container/ContainerReturn')) {
    // The real service refuses a container that is not out with anyone.
    if (!vytal.checkedOutAt || vytal.returnedAt) {
      return json({ result: 'ContainerNotCheckedOut', containers: [] })
    }
    vytal.returnedAt = Date.now()
    const answer = {
      result: 'Success',
      storeName: 'Teststation',
      timestamp: new Date().toISOString(),
      containers: [{ name: 'B_0754', id: CONTAINER_ID, typeId: 1 }],
      transactionContainerCount: 1,
      allLocationsUnchanged: true,
      showCheckoutLimitWarning: false,
    }
    if (body?.transactionId) vytal.seen.set(body.transactionId, answer)
    return json(answer)
  }

  if (pathname.endsWith('/ContainerHistory/GetUserContainers')) {
    if (!vytal.checkedOutAt) {
      return json({ active: [], returned: [], sold: [], activeCount: 0, returnedCount: 0, soldCount: 0 })
    }
    const c = container()
    const out = vytal.returnedAt ? { active: [], returned: [c] } : { active: [c], returned: [] }
    return json({
      ...out,
      sold: [],
      activeCount: out.active.length,
      returnedCount: out.returned.length,
      soldCount: 0,
    })
  }

  if (pathname.endsWith('/Sustainability/GetUserCo2SavingsForStore')) {
    return json({ co2SavedKg: vytal.returnedAt ? 0.091 : 0, containerCount: vytal.returnedAt ? 1 : 0 })
  }

  if (pathname.endsWith('/Merchant/GetStoreStock')) {
    return json([{ id: 1, amount: 6, name: '1250ml Bowl DE' }])
  }

  return json({ error: 'unstubbed', pathname }, 404)
}

/* ------------------------------------------------------------------
   Drive the real server
   ------------------------------------------------------------------ */

await import('../server/src/index.js')
await new Promise((r) => setTimeout(r, 1500))

const BASE = `http://127.0.0.1:${process.env.PORT}`
let cookie = ''

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let failures = 0
const ok = (cond, label, detail) => {
  console.log(`${cond ? '\x1b[32m  ok  \x1b[0m' : '\x1b[31m FAIL \x1b[0m'} ${label}`)
  if (!cond) {
    failures++
    if (detail !== undefined) console.log('       ' + JSON.stringify(detail))
  }
}

console.log('\nVytal integration — self-test against a simulated partner\n')

/* Sign in. */
const districts = await call('/api/districts')
const districtId = (districts.body.districts ?? districts.body)[0].id
const session = await call('/api/session', {
  method: 'POST',
  body: { name: 'Selbsttest', districtId },
})
ok(session.status === 201, 'session created', session.body)

/* Registration happens on first use, not at sign-in. */
const before = await call('/api/vytal/status')
ok(before.body.registered === false, 'not registered before the first scan')

/* --- Take a container ------------------------------------------------ */
const scan1 = await call('/api/vytal/scan', { method: 'POST', body: { code: QR, intent: 'checkout' } })
ok(scan1.status === 200, 'scan accepted', scan1.body)
ok(scan1.body?.container?.typeName === '1250ml Bowl DE', 'container identified by Vytal')
ok(Boolean(scan1.body?.transactionId), 'a transactionId was minted')

const after = await call('/api/vytal/status')
ok(after.body.registered === true, 'registered with Vytal on first scan')

const out = await call('/api/vytal/checkout', {
  method: 'POST',
  body: { transactionId: scan1.body.transactionId },
})
ok(out.status === 200 && out.body.ok, 'checkout booked', out.body)

/* A transaction is claimed once — replaying it must not book again. */
const replay = await call('/api/vytal/checkout', {
  method: 'POST',
  body: { transactionId: scan1.body.transactionId },
})
ok(replay.status === 409, 'replaying a settled transaction is refused', replay.body)

const held = await call('/api/vytal/containers')
ok(held.body?.active?.length === 1, 'container shows as held', held.body?.counts)
ok(
  held.body?.active?.[0]?.returnDeadline?.startsWith('20'),
  "Vytal's own deadline is used, not a computed one",
)
ok(held.body?.active?.[0]?.cycleKey?.includes(CONTAINER_ID), 'cycle key is container + checkout time')

/* --- Bring it back --------------------------------------------------- */
const scan2 = await call('/api/vytal/scan', { method: 'POST', body: { code: QR, intent: 'return' } })
ok(scan2.status === 200, 'return scan accepted', scan2.body)
ok(scan2.body?.alreadyCredited === null, 'nothing credited for this cycle yet')

const back = await call('/api/vytal/returns', {
  method: 'POST',
  body: { transactionId: scan2.body.transactionId },
})
ok(back.status === 200 && back.body.credited === true, 'return booked and credited', back.body)
const xp = back.body?.award?.xp
ok(xp === 20, `20 XP awarded (got ${xp})`)
const actionId = back.body?.award?.actionId

/* --- The bit that matters: scan the same bowl again ------------------ */
const scan3 = await call('/api/vytal/scan', { method: 'POST', body: { code: QR, intent: 'return' } })
ok(scan3.status === 200, 'second return scan accepted')
ok(
  scan3.body?.alreadyCredited?.actionId === actionId,
  'the second scan says up front that this cycle was already paid',
  scan3.body?.alreadyCredited,
)

const again = await call('/api/vytal/returns', {
  method: 'POST',
  body: { transactionId: scan3.body.transactionId },
})
ok(again.status === 409, 'a container already returned is refused', again.body)

/* The ledger is the real proof: one row, not two. */
const ledger = await call('/api/me/ledger')
const rows = (ledger.body?.entries ?? ledger.body?.ledger ?? []).filter((e) =>
  String(e.reason ?? '').includes('Vytal'),
)
ok(rows.length === 1, `exactly one Vytal ledger row (found ${rows.length})`, rows)
ok(
  rows.reduce((n, r) => n + (r.xp ?? 0), 0) === 20,
  'total credited for this container is 20 XP, not 40',
)

/* --- Vytal's own numbers --------------------------------------------- */
const impact = await call('/api/vytal/impact')
ok(impact.body?.co2SavedKg === 0.091, "partner's CO2 figure passed through unchanged")

const done = await call('/api/vytal/containers')
ok(done.body?.active?.length === 0, 'nothing held any more')
ok(done.body?.returned?.[0]?.actionId === actionId, 'history links to the receipt that paid')

console.log(
  failures === 0
    ? '\n\x1b[32mAll checks passed.\x1b[0m Our half of the integration is correct.\n'
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
)

/* Windows keeps the SQLite file open until the process goes; a failed
   cleanup is not a failed test, so it never changes the exit code. */
try {
  rmSync(dir, { recursive: true, force: true })
} catch {
  /* the OS will reap it from the temp directory */
}
process.exit(failures === 0 ? 0 : 1)
