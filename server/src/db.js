import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SRC = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(SRC, '..')

/**
 * SQLite, one file, schema applied at boot.
 *
 * Why not Postgres: at this pace the win is that a fresh checkout runs with
 * zero setup and zero accounts, and the seed makes the database reproducible
 * rather than precious. Every query in here is plain SQL through a tiny
 * helper, so swapping in `pg` later is a driver change, not a rewrite.
 *
 * The one thing to know when deploying: a free Render instance has no
 * persistent disk, so the file is lost on redeploy and the seed rebuilds it.
 * User-generated actions from a running demo would go with it — do not
 * redeploy while the jury is testing. Attach a disk, or point DATABASE_FILE
 * at one, if the data has to outlive a deploy.
 */
const file = process.env.DATABASE_FILE ?? join(ROOT, 'data', 'remain.db')
mkdirSync(dirname(file), { recursive: true })

export const db = new Database(file)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/**
 * Columns added to a table that already exists.
 *
 * schema.sql is all CREATE TABLE IF NOT EXISTS, which is what makes a
 * restart safe — but it also means a new column never reaches a database
 * that was created before it. Anyone with a remain.db from last week would
 * otherwise get "no such column: google_uid" and have to delete the file,
 * losing the demo content with it.
 *
 * So: additive columns are declared BOTH in schema.sql (for a fresh file)
 * and here (for an existing one). ALTER TABLE ADD COLUMN is instant in
 * SQLite and this runs before the schema, because an index declared over a
 * column that is not there yet would throw first.
 */
const ADDED_COLUMNS = {
  users: [
    ['auth_provider', "TEXT NOT NULL DEFAULT 'guest'"],
    ['google_uid', 'TEXT'],
    ['email', 'TEXT'],
    ['photo_url', 'TEXT'],
    ['last_seen_at', 'TEXT'],
  ],
  // The Repair Cafés brought two fields no OSM place needed: a contact
  // address, and the listing that carries the next date.
  places: [
    ['email', 'TEXT'],
    ['info_url', 'TEXT'],
  ],
}

for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  if (!exists) continue // fresh database — schema.sql below creates it whole

  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
  for (const [name, decl] of columns) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`)
  }
}

db.exec(readFileSync(join(SRC, 'schema.sql'), 'utf8'))

export const dbFile = file

/* ------------------------------------------------------------------
   Tiny query helpers. Everything else in the server uses these three,
   so there is exactly one place that knows about the driver.
   ------------------------------------------------------------------ */

/** All rows. */
export const all = (sql, ...params) => db.prepare(sql).all(...params)

/** First row or undefined. */
export const one = (sql, ...params) => db.prepare(sql).get(...params)

/** Write; returns { changes, lastInsertRowid }. */
export const run = (sql, ...params) => db.prepare(sql).run(...params)

/** Wraps a function in a transaction. */
export const tx = (fn) => db.transaction(fn)

export const now = () => new Date().toISOString()

/** Short, readable, collision-resistant enough for a hackathon. */
export function id(prefix) {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${s}` : s
}

/** Great-circle distance in km — the same formula the client uses. */
export function distanceKm(a, b) {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
