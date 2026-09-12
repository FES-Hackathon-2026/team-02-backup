import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const result = await build({ stdin: { contents: `
import assert from 'node:assert/strict'
import { hasSeenDashboardTour, finishDashboardTour, tourPosition } from './src/lib/dashboardTour'
const storage = new Map()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
} })
assert.equal(hasSeenDashboardTour('new-user'), false)
finishDashboardTour('new-user')
assert.equal(hasSeenDashboardTour('new-user'), true)
assert.equal(hasSeenDashboardTour('different-user'), false)
storage.set('remain.dashboard-tour.v1.returning-user', 'done')
assert.equal(hasSeenDashboardTour('returning-user'), true)
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') }
} })
assert.equal(hasSeenDashboardTour('blocked-user'), false)
finishDashboardTour('blocked-user')
assert.equal(hasSeenDashboardTour('blocked-user'), true)
console.log('✓ First visit, persisted completion, user isolation and blocked storage')
for (const width of [320, 375, 480, 1280]) {
  for (const height of [480, 800]) {
    for (const target of [
      { left: width - 60, top: 20, bottom: 64, width: 44 },
      { left: width / 2 - 25, top: height - 80, bottom: height - 30, width: 50 }
    ]) {
      const card = tourPosition(target, { width, height }, 300)
      assert.ok(card.left >= 16 && card.left + card.width <= width - 16)
      assert.ok(card.top >= 16 && card.top + 300 <= height - 16)
      assert.ok(card.top >= target.bottom || card.top + 300 <= target.top)
    }
  }
}
console.log('✓ Coachmarks stay in viewport and clear top/bottom targets on mobile and desktop')
`, loader: 'ts', resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false })
process.stdout.write(execFileSync(process.execPath, ['--input-type=commonjs'], { input: result.outputFiles[0].text }))
