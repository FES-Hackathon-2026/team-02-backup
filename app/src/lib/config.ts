/**
 * Runtime configuration.
 *
 * The API key resolves in this order:
 *   1. whatever the user pasted into Settings (localStorage)
 *   2. the build-time default from VITE_FS_API_KEY
 *   3. nothing — the app then shows the "add your key" state
 *
 * Keep it in one place so no component reaches for localStorage directly.
 */

const KEY_STORAGE = 's2s.apiKey'

export const API_BASE: string =
  import.meta.env.VITE_FS_API_BASE ?? 'https://app-foodsharing-hackathon.azurewebsites.net'

const BUILT_IN_KEY: string = import.meta.env.VITE_FS_API_KEY ?? ''

function read(storageKey: string): string | null {
  // Private mode and locked-down browsers can throw on access, not just return null.
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

function write(storageKey: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, value)
  } catch {
    /* storage unavailable — the app still works for this session */
  }
}

export function getApiKey(): string {
  return read(KEY_STORAGE) ?? BUILT_IN_KEY
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  write(KEY_STORAGE, trimmed === '' ? null : trimmed)
}

/** True when the key came from Settings rather than the build. */
export function hasCustomKey(): boolean {
  return read(KEY_STORAGE) !== null
}

export function hasAnyKey(): boolean {
  return getApiKey() !== ''
}
