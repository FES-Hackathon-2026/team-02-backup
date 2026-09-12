import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
const missing = []
for (const file of walk(path.join(root, 'src')).filter(file => file.endsWith('.tsx'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = node => {
    if (ts.isJsxText(node) && /[A-Za-zÄÖÜäöüß]/.test(node.text) && !['Deutsch', 'English'].includes(node.text.trim())) missing.push(file + ': ' + node.text.trim())
    ts.forEachChild(node, visit)
  }
  visit(source)
}
if (missing.length) throw new Error('Unlocalized static JSX text: ' + missing.join('\n'))
console.log('✓ Static text coverage across all JSX screens and components')
const result = await build({ stdin: { contents: `
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { t, getLocale, getLanguage, setLanguage, startLanguage } from './src/lib/i18n'
import LanguagePicker from './src/components/LanguagePicker'
import TabBar from './src/components/TabBar'
import german from './src/locales/de.json'
import english from './src/locales/en.json'
import reviewed from './src/locales/en.reviewed.json'
const dictionary = { ...english, ...reviewed }
let checks = 0
function check(name, run) { run(); checks++; console.log('✓ ' + name) }
const stored = new Map()
const handlers = {}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {} })
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
globalThis.document = { documentElement: { lang: '', setAttribute() {} } }
globalThis.window = { addEventListener: (key, fn) => { handlers[key] = fn }, removeEventListener() {} }
check('German is unchanged and the locale is German', () => { setLanguage('de'); assert.equal(t('Abholung anmelden'), 'Abholung anmelden'); assert.equal(getLocale(), 'de-DE') })
check('English controls and navigation use reviewed wording', () => {
  setLanguage('en'); assert.equal(t('Abbrechen'), 'Cancel'); assert.equal(t('Einstellungen'), 'Settings'); assert.equal(t('Neueste zuerst'), 'Newest first'); assert.equal(t('Mehrweg'), 'Reusables')
  const nav = renderToStaticMarkup(<MemoryRouter><TabBar /></MemoryRouter>); for (const label of ['Home','Quests','Scan','Market','Impact']) assert.ok(nav.includes(label), label)
})
check('Dynamic values and proper names survive interpolation', () => { assert.equal(t('Hallo Nordend-West'), 'Hello Nordend-West'); assert.equal(t('Buchungsnummer <A&42>'), 'Booking reference <A&42>'); assert.equal(t('Unbekannter eigener Text'), 'Unbekannter eigener Text') })
check('Plural labels and dated API labels localize', () => { assert.equal(t('1 Woche'), '1 week'); assert.equal(t('2 Wochen'), '2 weeks'); assert.equal(t('Sa, 12.09.2026'), 'Sat, 12/09/2026'); assert.equal(getLocale(), 'en-GB') })
check('Language choice persists, updates document language and renders selected option', () => {
  startLanguage(); setLanguage('en'); assert.equal(stored.get('remain.language'), 'en'); assert.equal(document.documentElement.lang, 'en');
  const html = renderToStaticMarkup(<LanguagePicker />); assert.ok(html.includes('App language')); assert.match(html, /value="en"[^>]*selected/)
})
check('Cross-tab changes and blocked storage keep a working language choice', () => { stored.set('remain.language','de'); handlers.storage({ key: 'remain.language' }); assert.equal(getLanguage(),'de'); localStorage.setItem=()=>{throw Error('blocked')}; setLanguage('en'); assert.equal(getLanguage(),'en') })
check('Translated option labels never change submitted values; markup is escaped', () => {
  const html = renderToStaticMarkup(<><select defaultValue="moebel"><option value="moebel">{t('Möbel')}</option></select><p>{t('Hallo <script>alert(1)</script>')}</p></>);
  assert.ok(html.includes('value="moebel"')); assert.ok(html.includes('Furniture')); assert.ok(!html.includes('<script>'))
})
check('Every catalog message has a translation and identical interpolation slots', () => {
  const slots = value => (value.match(/\\{\\d+\\}/g) ?? []).sort()
  for (const [key] of Object.entries(german)) { assert.ok(typeof dictionary[key] === 'string' && dictionary[key].length, key); assert.deepEqual(slots(key), slots(dictionary[key]), key) }
})
check('Collection notifications translate without changing dates or simulation status', () => {
  setLanguage('en')
  assert.equal(t('Gegenstand zum eingetragenen Termin hinzugefügt. Keine zusätzliche Buchung.'), 'Item added to your existing collection. No additional booking was created.')
  assert.equal(t('Deine gemeinsame Tour ist geplant: Mo, 21.09.2026 · 09:00–09:20 Uhr (Simulation, keine Live-ETA).'), 'Your shared collection is planned for Mon, 21/09/2026, 09:00–09:20 (simulated, not a live arrival estimate).')
})
check('Switching back restores German without changing content values', () => { setLanguage('de'); assert.equal(t('Einstellungen'),'Einstellungen'); assert.equal(t('Hallo Nordend-West'),'Hallo Nordend-West'); assert.equal(t(42),42); assert.equal(t(null),null) })
console.log(checks + ' localization checks passed')
`, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic' })
process.stdout.write(execFileSync(process.execPath, ['--input-type=commonjs'], { input: result.outputFiles[0].text, maxBuffer: 2_000_000 }))
