import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const result = await build({ stdin: { contents: `
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import Anmelden from './src/screens/Anmelden'
import { setLanguage } from './src/lib/i18n'
for (const language of ['de','en']) {
  setLanguage(language)
  globalThis.loginState = { auth: { google: true, guest: false }, pendingGoogleProfile: null }
  const choose = renderToStaticMarkup(<Anmelden />)
  assert.equal((choose.match(/<button/g) ?? []).length, 1, 'Exactly one sign-in choice')
  assert.ok(choose.includes(language === 'de' ? 'Mit Google anmelden' : 'Sign in with Google'))
  assert.ok(!choose.includes('id="name"'))
  assert.ok(!choose.includes('id="district"'), 'District is only asked after Google verification')
  assert.ok(!choose.includes('disabled=""'))
  globalThis.loginState = { auth: { google: false, guest: false }, pendingGoogleProfile: null }
  const unavailable = renderToStaticMarkup(<Anmelden />)
  assert.ok(unavailable.includes('disabled=""'))
  assert.ok(unavailable.includes(language === 'de' ? 'noch nicht eingerichtet' : 'not configured yet'))
  globalThis.loginState = { auth: { google: true, guest: false }, pendingGoogleProfile: { name: 'Ayla', email: 'ayla@example.test' } }
  const district = renderToStaticMarkup(<Anmelden />)
  assert.ok(district.includes('id="district"'))
  assert.ok(district.includes('Ayla'))
  assert.ok(district.includes(language === 'de' ? 'Anderes Google-Konto wählen' : 'Choose another Google account'))
  assert.ok(!district.includes('id="name"'))
}
console.log('✓ Google-only login, unavailable state and post-Google district setup render in German and English')
`, resolveDir: root, loader: 'tsx' }, plugins: [{ name: 'login-session-fixtures', setup(builder) {
  builder.onResolve({ filter: /lib\/session$/ }, () => ({ path: 'session', namespace: 'fixture' }))
  builder.onResolve({ filter: /lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'session'
    ? 'export const useSession = () => globalThis.loginState; export class DistrictRequired extends Error {}'
    : 'export const firebaseConfigured = true; export class SignInError extends Error {}', loader: 'js' }))
} }], loader: { '.svg': 'text' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false })
process.stdout.write(execFileSync(process.execPath, ['--input-type=commonjs'], { input: result.outputFiles[0].text }))
