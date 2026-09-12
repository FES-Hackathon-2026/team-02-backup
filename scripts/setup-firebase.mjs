// Wires a Firebase web config into app/.env and server/.env.
//
//   node scripts/setup-firebase.mjs
//
// Paste the block the Firebase console shows under
// Project settings → General → Your apps → SDK setup and configuration,
// then press Ctrl+D (Ctrl+Z then Enter on Windows cmd). Any shape works —
// the JS snippet, bare JSON, or just the four lines that matter.
//
// It exists because the one step that is easy to get wrong is invisible:
// the SAME project id has to reach the server as FIREBASE_PROJECT_ID, in a
// different file, without the VITE_ prefix. A config that is perfect except
// for that fails with "Das Anmelde-Token ist ungültig", which does not point
// anywhere near the actual mistake.
//
// Nothing secret passes through here. A Firebase web config is an address,
// not a credential — see docs/FIREBASE.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Pulls one `key: "value"` out of the pasted block, whatever quotes it uses. */
function field(text, key) {
  const match = text.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"']+)["']`))
  return match?.[1] ?? ''
}

/**
 * Sets KEY=value in a .env file: replaces the line if it is there (commented
 * or not), appends it if it is not, and leaves every other line alone. The
 * file is one a person edits by hand, so it must survive being written to.
 */
function upsert(file, pairs) {
  let text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (text !== '' && !text.endsWith('\n')) text += '\n'

  for (const [key, value] of Object.entries(pairs)) {
    const line = `${key}=${value}`
    const existing = new RegExp(`^#?\\s*${key}=.*$`, 'm')
    text = existing.test(text) ? text.replace(existing, line) : `${text}${line}\n`
  }

  writeFileSync(file, text)
}

const stdin = readFileSync(0, 'utf8')
if (stdin.trim() === '') {
  console.error(
    'Nothing on stdin.\n\n' +
      'Paste the firebaseConfig block from the Firebase console, then Ctrl+D\n' +
      '(on Windows cmd: Ctrl+Z then Enter).\n\n' +
      '  node scripts/setup-firebase.mjs\n' +
      '  node scripts/setup-firebase.mjs < config.txt\n',
  )
  process.exit(1)
}

const config = {
  apiKey: field(stdin, 'apiKey'),
  authDomain: field(stdin, 'authDomain'),
  projectId: field(stdin, 'projectId'),
  appId: field(stdin, 'appId'),
  storageBucket: field(stdin, 'storageBucket'),
  messagingSenderId: field(stdin, 'messagingSenderId'),
}

const required = ['apiKey', 'authDomain', 'projectId', 'appId']
const missing = required.filter((key) => config[key] === '')
if (missing.length > 0) {
  console.error(
    `Could not find ${missing.join(', ')} in what was pasted.\n\n` +
      'Expected something like:\n\n' +
      '  const firebaseConfig = {\n' +
      '    apiKey: "AIzaSy…",\n' +
      '    authDomain: "your-project.firebaseapp.com",\n' +
      '    projectId: "your-project",\n' +
      '    appId: "1:123…:web:abc…"\n' +
      '  };\n',
  )
  process.exit(1)
}

const appEnv = join(root, 'app', '.env')
const serverEnv = join(root, 'server', '.env')

upsert(appEnv, {
  VITE_FIREBASE_API_KEY: config.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_APP_ID: config.appId,
  ...(config.storageBucket ? { VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket } : {}),
  ...(config.messagingSenderId
    ? { VITE_FIREBASE_MESSAGING_SENDER_ID: config.messagingSenderId }
    : {}),
})

// The line this script exists for.
upsert(serverEnv, { FIREBASE_PROJECT_ID: config.projectId })

console.log(`
  Project: ${config.projectId}

  app/.env      VITE_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID, _APP_ID
  server/.env   FIREBASE_PROJECT_ID

Two things left, both in the Firebase console:

  1. Authentication → Sign-in method → Google → Enable
  2. Authentication → Settings → Authorized domains → add the hosts you
     open the app on (localhost is already there; add your LAN IP for a
     phone, and your Render domain for the deploy)

Then restart BOTH — VITE_* is compiled in at build time, so a browser
reload is not enough:

  cd server && npm start
  cd app    && npm run dev

Check: curl localhost:8080/api/auth/config  →  {"google":true,"guest":true}
`)
