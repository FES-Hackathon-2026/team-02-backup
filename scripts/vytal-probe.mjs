#!/usr/bin/env node
/**
 * Vytal Merchant-API — read-only probe.
 *
 * Confirms the integration's assumptions against the live service before
 * anyone books a container. Everything here is a GET except the one write
 * the documentation gives us no read-only equivalent for — creating an
 * anonymous user — and that one is skipped unless you ask for it.
 *
 *   node scripts/vytal-probe.mjs                  # read-only
 *   node scripts/vytal-probe.mjs --code "HTTP://VYT.TO/ABC123"
 *   node scripts/vytal-probe.mjs --register       # mints one anon user
 *
 * What it is actually checking, because these are the four things the
 * documentation left ambiguous:
 *
 *   1. Does GetStoreStock really live at /Merchant/… with no /api/3 prefix?
 *   2. Does our store have stock to hand out at all?
 *   3. Is `remain-<id>` accepted as a reference string?
 *   4. What does a failure look like — status code, or `result` field?
 *
 * Reads server/.env, so VYTAL_JWT never has to be pasted onto a command line
 * where it would land in the shell history.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* Minimal .env reader — this script must run before anything is installed. */
function env() {
  const out = { ...process.env }
  try {
    for (const line of readFileSync(join(ROOT, 'server', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // No .env is fine if the variables are already exported.
  }
  return out
}

const E = env()
const BASE = E.VYTAL_API_BASE ?? 'https://merchantapi.vytal.org'
const JWT = E.VYTAL_JWT ?? ''

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : (process.argv[i + 1] ?? true)
}

const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

if (!JWT) {
  console.error(red('VYTAL_JWT is not set.'))
  console.error('Paste the store-B token into server/.env as VYTAL_JWT, then run again.')
  process.exit(1)
}

/** Decode the token's claims — which store are we about to talk to? */
try {
  const claims = JSON.parse(Buffer.from(JWT.split('.')[1], 'base64url').toString('utf8'))
  console.log(`store_id     ${claims.store_id}`)
  console.log(`merchant_id  ${claims.vytal_merchant_id}`)
  console.log(`issued       ${claims.created_at}`)
  console.log(`expires      ${claims.exp === 0 ? 'never (exp: 0)' : claims.exp}`)
} catch {
  console.log(red('Token is not a readable JWT — check it was pasted whole.'))
}
console.log()

async function probe(label, path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${JWT}`, Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (cause) {
    console.log(`${red('ERR ')} ${label}\n     ${dim(String(cause))}`)
    return null
  }

  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* not JSON — shown raw below */
  }

  const ok = res.ok ? green(`${res.status} `) : red(`${res.status} `)
  console.log(`${ok} ${label}  ${dim(method + ' ' + path)}`)
  if (data !== null) {
    const preview = JSON.stringify(data, null, 2)
    console.log(
      preview
        .split('\n')
        .slice(0, 24)
        .map((l) => '     ' + l)
        .join('\n'),
    )
    if (preview.split('\n').length > 24) console.log(dim('     …'))
  } else if (text) {
    console.log('     ' + dim(text.slice(0, 200)))
  }
  console.log()
  return data
}

/* 1. Auth smoke test — the example call from the documentation. */
await probe('auth smoke test', '/api/3/deliveryToken/Check')

/* 2. Stock. The documentation spells this one WITHOUT the /api/3 prefix,
      which is unusual enough to be worth confirming both ways. */
const stockA = await probe('stock (documented path)', '/Merchant/GetStoreStock')
if (stockA === null) await probe('stock (with /api/3 prefix)', '/api/3/Merchant/GetStoreStock')

/* 3. A container code, if one was handed in. */
const code = arg('--code')
if (typeof code === 'string') {
  await probe('CheckCode', `/api/3/Container/CheckCode?code=${encodeURIComponent(code)}`)
} else {
  console.log(dim('skipping CheckCode — pass --code "HTTP://VYT.TO/…" to test one\n'))
}

/* 4. A user's containers. Only meaningful once somebody is registered. */
const userId = arg('--user')
if (typeof userId === 'string') {
  const q = new URLSearchParams({
    userId,
    showCounts: 'true',
    showActive: 'true',
    showReturned: 'true',
    showSold: 'true',
    limit: '10',
  })
  await probe('GetUserContainers', `/api/3/ContainerHistory/GetUserContainers?${q}`)
  await probe(
    'CO2 for user',
    `/api/3/Sustainability/GetUserCo2SavingsForStore?userId=${encodeURIComponent(userId)}`,
  )
} else {
  console.log(dim('skipping user calls — pass --user <vytal-uuid> to test them\n'))
}

/* 5. How does a bad reference fail? Cheap way to learn the error shape. */
await probe('CheckCode with nonsense', '/api/3/Container/CheckCode?code=not-a-real-code')

/* 6. The only write, and only on request. */
if (arg('--register')) {
  console.log(red('--register mints a real anonymous Vytal user.\n'))
  const made = await probe(
    'ReferencedAnonUser/Create',
    `/api/3/ReferencedAnonUser/Create?userId=${encodeURIComponent('remain-probe-' + Date.now())}`,
    { method: 'POST' },
  )
  // Known upstream blocker as of 12.09.2026 — see integrations/vytal/users.js.
  if (made?.errors?.includes?.('ServiceNameRequired')) {
    console.log(red('  ServiceNameRequired — the token is not cleared for creating users.'))
    console.log(
      dim(
        '  Not fixable from our side: query, body and header spellings were all\n' +
          '  tried and all rejected, while other endpoints accept the same token.\n' +
          '  Ask Vytal to reissue it with a real `service` claim (ours says "other").\n',
      ),
    )
  }
} else {
  console.log(dim('skipping registration — pass --register to mint a test user\n'))
}

console.log(dim('No container was checked out or returned by this script.'))
