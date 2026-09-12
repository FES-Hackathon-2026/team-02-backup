import { dbFile, one } from '../db.js'

/**
 * The integration register, served live.
 *
 * The brief asks for a clear line between confirmed data, user input and
 * estimates. This is the same promise one level up: which partner services
 * are real right now, which are stand-ins, and exactly where the real one
 * would plug in. The app renders it under Einstellungen → Integrationen, so
 * nobody — judge or teammate — has to guess.
 *
 * `status` is deliberately narrow:
 *   live       a real interface answers, right now
 *   pending    real, but we are waiting on access
 *   simulated  we rebuilt the shape; the seam below says what replaces it
 */
const INTEGRATIONS = [
  {
    id: 'foodsharing',
    name: 'foodsharing Hackathon-API',
    status: 'live',
    what: 'Fairteiler, Körbe, Anfragen, Abholungen, Verifikationsstatus',
    seam: 'server/src/routes/food.js — Proxy, Schlüssel serverseitig',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    status: 'live',
    what: 'Kartenkacheln und 1.011 echte Frankfurter Orte (Wertstoffhöfe, Container, Reparaturbetriebe)',
    seam: 'scripts/fetch-places.mjs → server/data/places.json',
  },
  {
    id: 'traffiq',
    name: 'traffiQ / Transdev Daten',
    status: 'live',
    what: 'GTFS Frankfurt+30 km, Haltestellen, Tagesgang, Fahrgastzählung',
    seam: 'scripts/build-mobility-data.mjs → data/ (Phase 8)',
  },
  {
    id: 'vytal',
    name: 'Vytal Mehrweg',
    status: 'live',
    what: 'Konto-Anlage, Code-Prüfung, Ausgabe, Rücknahme, Behälterliste, CO₂ je Person, Filialverzeichnis',
    seam: 'server/src/integrations/vytal — Merchant-API mit Store-Token; ReMain ist selbst eine Vytal-Station',
  },
  {
    id: 'fes-pickup',
    name: 'FES Sperrmüll-Termine',
    status: 'simulated',
    what: 'Kategorien, Volumengrenzen, freie Termine, Buchung, Storno',
    seam: 'server/src/integrations/fes/pickup.js — vier Methoden: categories, slots, book, cancel (Phase 5)',
  },
  {
    id: 'fes-calendar',
    name: 'FES Abfuhrkalender',
    status: 'simulated',
    what: 'Abfuhrtermine je Bezirk und Fraktion',
    seam: 'server/src/integrations/fes/calendar.js — pro Adresse ein Bezirk (Phase 5)',
  },
  {
    id: 'rewards',
    name: 'Gutschein-Partner',
    status: 'simulated',
    what: 'Katalog, Einlösecodes, Gültigkeit',
    seam: 'server/src/routes/rewards.js — Katalog und Codes derzeit selbst erzeugt (Phase 10)',
  },
]

export default async function metaRoutes(app) {
  app.get('/api/health', async () => {
    const counts = {
      districts: one('SELECT COUNT(*) AS n FROM districts').n,
      places: one('SELECT COUNT(*) AS n FROM places').n,
      fesPlaces: one('SELECT COUNT(*) AS n FROM places WHERE is_fes = 1').n,
      users: one('SELECT COUNT(*) AS n FROM users').n,
      quests: one('SELECT COUNT(*) AS n FROM quests').n,
      marketItems: one('SELECT COUNT(*) AS n FROM market_items').n,
    }
    return { ok: true, db: dbFile, counts, time: new Date().toISOString() }
  })

  app.get('/api/integrations', async () => ({
    integrations: INTEGRATIONS,
    note: 'Nachgebaute Dienste tragen in der App immer die Kennzeichnung „simuliert" — nie „bestätigt".',
  }))
}
