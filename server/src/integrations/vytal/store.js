import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ROOT } from '../../db.js'

/**
 * The stand-in partner's own memory.
 *
 * Vytal's events belong to Vytal, not to us, so they deliberately do NOT go
 * into our SQLite schema — that file is finished and has no vytal table, and
 * inventing one would blur the line between "what a partner told us" and
 * "what we recorded". The stand-in keeps its state exactly where the real
 * service would: on its own side of the seam.
 *
 * It is a file rather than a variable for one reason: `event_id` has to
 * survive a restart. If the ids were regenerated, a return that was already
 * paid would come back with a new key and be payable a second time — the one
 * guarantee this integration exists to demonstrate.
 */
const FILE = process.env.VYTAL_STORE ?? join(ROOT, 'data', 'vytal-events.json')

const EMPTY = { containers: {}, events: [] }

let state = null

function load() {
  if (state) return state
  if (existsSync(FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
      state = { containers: parsed.containers ?? {}, events: parsed.events ?? [] }
      return state
    } catch {
      // A corrupt stand-in file must never stop the server booting. Start over.
    }
  }
  state = structuredClone(EMPTY)
  return state
}

/** Write through a temp file so a crash mid-write cannot leave a torn JSON. */
function persist() {
  mkdirSync(dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, FILE)
}

export function read() {
  return load()
}

export function write(mutate) {
  const current = load()
  const result = mutate(current)
  persist()
  return result
}

export const storeFile = FILE
