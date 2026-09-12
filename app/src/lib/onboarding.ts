const KEY = 'remain.onboarding.v1'
let completedInMemory = false

export function hasCompletedOnboarding(): boolean {
  try { return completedInMemory || localStorage.getItem(KEY) === 'done' }
  catch { return completedInMemory }
}

export function completeOnboarding(): void {
  completedInMemory = true
  try { localStorage.setItem(KEY, 'done') } catch { /* Keep working without storage. */ }
}
