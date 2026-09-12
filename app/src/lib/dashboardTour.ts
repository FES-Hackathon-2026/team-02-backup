const completed = new Set<string>()
const keyFor = (userId: string | number) => `remain.dashboard-tour.v1.${userId}`

export function hasSeenDashboardTour(userId: string | number): boolean {
  const key = keyFor(userId)
  try { return completed.has(key) || localStorage.getItem(key) === 'done' }
  catch { return completed.has(key) }
}

export function finishDashboardTour(userId: string | number): void {
  const key = keyFor(userId)
  completed.add(key)
  try { localStorage.setItem(key, 'done') } catch { /* Keep completion for this session. */ }
}

/** Keep the coachmark on-screen, preferring the side with room for its text. */
export function tourPosition(rect: { top: number; bottom: number; left: number; width: number }, viewport: { width: number; height: number }, cardHeight: number) {
  const margin = 16
  const width = Math.min(340, Math.max(0, viewport.width - margin * 2))
  const below = rect.bottom + 18
  const above = rect.top - cardHeight - 18
  const top = below + cardHeight <= viewport.height - margin ? below : above >= margin ? above : Math.max(margin, (viewport.height - cardHeight) / 2)
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), Math.max(margin, viewport.width - width - margin))
  return { top, left, width }
}
