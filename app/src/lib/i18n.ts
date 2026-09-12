import { useSyncExternalStore } from 'react'
import english from '../locales/en.json'
import reviewed from '../locales/en.reviewed.json'

export type Language = 'de' | 'en'
const STORAGE_KEY = 'remain.language'
const listeners = new Set<() => void>()
const valid = (value: unknown): value is Language => value === 'de' || value === 'en'
function savedLanguage(): Language {
  try { const value = localStorage.getItem(STORAGE_KEY); return valid(value) ? value : 'de' } catch { return 'de' }
}
let language: Language = savedLanguage()
export const getLanguage = () => language
export const getLocale = () => language === 'en' ? 'en-GB' : 'de-DE'
export function setLanguage(next: Language) {
  if (!valid(next)) return
  language = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* Keep the choice in memory when storage is blocked. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach(listener => listener())
}
export function startLanguage() {
  document.documentElement.lang = language
  // The app owns translation. Browser translation would otherwise translate it a second time.
  document.documentElement.setAttribute('translate', 'no')
  const sync = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      language = savedLanguage()
      document.documentElement.lang = language
      listeners.forEach(listener => listener())
    }
  }
  window.addEventListener('storage', sync)
  return () => window.removeEventListener('storage', sync)
}
export function useLanguage() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, getLanguage, getLanguage)
}

const cache = new Map<string, string>()
const dictionary: Record<string, string> = { ...english, ...reviewed }
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = Object.entries(dictionary).filter(([key, value]) => /\{\d+\}/.test(key) && key !== value && key.replace(/\{\d+\}/g, '').trim().length >= 3).map(([key, value]) => {
  const ids = [...key.matchAll(/\{(\d+)\}/g)].map(match => match[1])
  return { value, ids, weight: key.replace(/\{\d+\}/g, '').length, regex: new RegExp('^' + key.split(/\{\d+\}/).map(escape).join('(.*?)') + '$') }
}).sort((a, b) => b.weight - a.weight)

function localizedDateLabel(text: string): string {
  const days: Record<string, string> = { Mo: 'Mon', Di: 'Tue', Mi: 'Wed', Do: 'Thu', Fr: 'Fri', Sa: 'Sat', So: 'Sun' }
  return text.replace(/\b(Mo|Di|Mi|Do|Fr|Sa|So)(?=[,.]?\s*\d)/g, word => days[word])
    .replace(/\b(\d{2})\.(\d{2})\.(\d{4}|\d{2})\b/g, '$1/$2/$3')
}

function translate(text: string, depth = 0): string {
  const key = normalize(text)
  if (!key) return text
  let result = dictionary[key]
  if (result === undefined && depth < 3) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(key)
      if (!match) continue
      const values = Object.fromEntries(pattern.ids.map((id, i) => [id, (['Woche', 'Wochen', 'Aktion', 'Aktionen', 'Gegenstand', 'Gegenstände', 'Tag', 'Tage', 'Tagen', 'Foto wartet', 'Fotos warten', 'neue Nachricht', 'neue Nachrichten'].includes(match[i + 1]) ? dictionary[match[i + 1]] ?? match[i + 1] : match[i + 1])]))
      result = pattern.value.replace(/\{(\d+)\}/g, (_, id: string) => values[id] ?? '')
      break
    }
  }
  // Counts assembled from a numeric expression and a separate plural label.
  if (result === undefined) {
    const count = /^(\d[\d.,]*)(\s+)([^\d]+)$/.exec(key)
    if (count && dictionary[count[3]]) result = count[1] + count[2] + dictionary[count[3]]
  }
  if (result === undefined) return localizedDateLabel(text)
  return (text.match(/^\s*/)?.[0] ?? '') + localizedDateLabel(result) + (text.match(/\s*$/)?.[0] ?? '')
}

/** Presentation only. Never pass translated text back as an API enum or identifier. */
export function t<T>(value: T): T {
  if (language !== 'en') return value
  if (typeof value === 'string') {
    const cached = cache.get(value)
    if (cached !== undefined) return cached as T
    const translated = translate(value)
    if (cache.size >= 2000) cache.clear()
    cache.set(value, translated)
    return translated as T
  }
  if (Array.isArray(value)) return value.map(item => t(item)) as T
  return value
}
