import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
for (const blocked of [false, true]) {
  const result = await build({ stdin: { contents: `
    import assert from 'node:assert/strict'
    import { renderToStaticMarkup } from 'react-dom/server'
    import Onboarding from './src/screens/Onboarding'
    import { SplashScreen } from './src/components/BrandMark'
    import { hasCompletedOnboarding, completeOnboarding } from './src/lib/onboarding'
    import { setLanguage } from './src/lib/i18n'
    const stored = new Map()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem(key) { if (${blocked}) throw Error('blocked'); return stored.get(key) ?? null },
      setItem(key, value) { if (${blocked}) throw Error('blocked'); stored.set(key, value) }
    } })
    assert.equal(hasCompletedOnboarding(), false)
    if (!${blocked}) {
      stored.set('remain.onboarding.v1', 'done')
      assert.equal(hasCompletedOnboarding(), true, 'Existing completion is restored')
      stored.clear()
      for (const key of ['remain.introduced', 'remain.introduced.v2']) {
        stored.set(key, '1')
        assert.equal(hasCompletedOnboarding(), true, 'Previous introductions remain completed')
        stored.clear()
      }
    }
    completeOnboarding()
    assert.equal(hasCompletedOnboarding(), true, 'Completing or skipping works even without storage')
    if (!${blocked}) assert.equal(stored.get('remain.onboarding.v1'), 'done')
    for (const language of ['de', 'en']) {
      setLanguage(language)
      const html = renderToStaticMarkup(<Onboarding onComplete={() => {}} />)
      assert.ok(html.includes(language === 'de' ? 'Überspringen' : 'Skip'))
      assert.ok(html.includes(language === 'de' ? 'Scannen' : 'Scan'))
      assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1)
      assert.ok(html.includes('value="' + language + '"'))
      const splash = renderToStaticMarkup(<SplashScreen />)
      assert.ok(splash.includes('role="status"'))
      assert.ok(splash.includes(language === 'de' ? 'ReMain wird geladen' : 'Loading ReMain'))
    }
    console.log('✓ Onboarding storage ${blocked ? 'blocked' : 'available'}: completion, bilingual welcome and splash passed')
  `, resolveDir: root, loader: 'tsx' }, loader: { '.svg': 'text' }, bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic' })
  process.stdout.write(execFileSync(process.execPath, ['--input-type=commonjs'], { input: result.outputFiles[0].text }))
}
