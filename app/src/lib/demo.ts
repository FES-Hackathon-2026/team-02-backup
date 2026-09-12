/**
 * PHASE 1 ONLY — placeholder content so the shell is never an empty box.
 *
 * Every screen that reads from here shows a visible "Phase n" marker, and
 * each phase deletes its own entry as the real source lands:
 *
 *   quests, market   → phase 2 (server) and phases 6/7
 *   collection dates → phase 5, from the FES collection calendar
 *   coupons          → phase 10, from the partner catalogue
 *   impact, standings→ phase 3/10, computed by the server engine
 *
 * Street names and districts are real Frankfurt ones so the layout is
 * tested against realistic string lengths. The NUMBERS are not real and
 * are never presented as confirmed.
 */

export interface DemoQuest {
  id: string
  titel: string
  ort: string
  distanzM: number
  offenSeitTagen: number
  xp: number
  unterwegs: number
}

export const demoQuests: DemoQuest[] = [
  {
    id: 'q-mainufer',
    titel: 'Müll am Mainufer',
    ort: 'Untermainkai, Höhe Holbeinsteg',
    distanzM: 400,
    offenSeitTagen: 3,
    xp: 120,
    unterwegs: 2,
  },
  {
    id: 'q-kirchplatz',
    titel: 'Papierkorb übervoll',
    ort: 'Kirchplatz, Bockenheim',
    distanzM: 850,
    offenSeitTagen: 1,
    xp: 60,
    unterwegs: 0,
  },
  {
    id: 'q-leipziger',
    titel: 'Sperrmüll ohne Anmeldung',
    ort: 'Leipziger Straße 88',
    distanzM: 1200,
    offenSeitTagen: 5,
    xp: 90,
    unterwegs: 1,
  },
]

export interface DemoItem {
  id: string
  titel: string
  defekt: string
  zustand: string
  stadtteil: string
  distanzKm: number
  kategorie: 'elektro' | 'moebel' | 'fahrrad'
  interessenten: number
}

export const demoMarket: DemoItem[] = [
  {
    id: 'm-waschmaschine',
    titel: 'Waschmaschine, Bosch',
    defekt: 'Pumpe defekt',
    zustand: 'läuft sonst',
    stadtteil: 'Nordend-West',
    distanzKm: 1.2,
    kategorie: 'elektro',
    interessenten: 2,
  },
  {
    id: 'm-ebike',
    titel: 'E-Bike, 2019',
    defekt: 'Akku schwach',
    zustand: 'Rahmen ok',
    stadtteil: 'Sachsenhausen-Nord',
    distanzKm: 2.4,
    kategorie: 'fahrrad',
    interessenten: 0,
  },
  {
    id: 'm-siebtraeger',
    titel: 'Siebträgermaschine',
    defekt: 'Brühgruppe verkalkt',
    zustand: 'komplett',
    stadtteil: 'Gallus',
    distanzKm: 2.9,
    kategorie: 'elektro',
    interessenten: 1,
  },
  {
    id: 'm-stuehle',
    titel: '4 Holzstühle, Eiche',
    defekt: 'Lehne lose',
    zustand: 'massiv',
    stadtteil: 'Bornheim',
    distanzKm: 3.1,
    kategorie: 'moebel',
    interessenten: 0,
  },
]

export type Fraktion = 'rest' | 'bio' | 'papier' | 'gelb' | 'sperrmuell'

export interface DemoAbfuhr {
  id: string
  fraktion: Fraktion
  titel: string
  wann: string
  detail: string
  /** true when ReMain created it rather than FES publishing it */
  eigen?: boolean
}

/** The real FES fraction colours, so the list is recognisable at a glance. */
export const FRAKTION_FARBE: Record<Fraktion, string> = {
  rest: '#5d6b63',
  bio: '#8a6e43',
  papier: '#4a6fa5',
  gelb: '#f0c808',
  sperrmuell: '#a9682f',
}

export const demoAbfuhr: DemoAbfuhr[] = [
  { id: 'a1', fraktion: 'bio', titel: 'Biotonne', wann: 'morgen, Do 11.09.', detail: 'ab 06:00 Uhr' },
  {
    id: 'a2',
    fraktion: 'sperrmuell',
    titel: 'Sperrmüll · Sofa, 3-Sitzer',
    wann: 'Di 16.09.',
    detail: 'von dir gebucht',
    eigen: true,
  },
  { id: 'a3', fraktion: 'papier', titel: 'Altpapier', wann: 'Di 16.09.', detail: 'ab 06:00 Uhr' },
  { id: 'a4', fraktion: 'rest', titel: 'Restmüll', wann: 'Fr 19.09.', detail: 'ab 06:00 Uhr' },
]

export interface DemoCoupon {
  id: string
  titel: string
  detail: string
  kosten: number
  erreichbar: boolean
}

export const demoCoupons: DemoCoupon[] = [
  { id: 'c-kaffee', titel: 'Kaffee im Mehrwegbecher', detail: '3 Cafés · einmal pro Woche', kosten: 120, erreichbar: true },
  { id: 'c-rmv', titel: 'RMV-Kurzstrecke', detail: 'eine Fahrt im Stadtgebiet', kosten: 180, erreichbar: true },
  { id: 'c-reparatur', titel: '5 € Reparaturbonus', detail: '14 Betriebe · Elektro, Rad, Möbel', kosten: 250, erreichbar: true },
  { id: 'c-wertstoffhof', titel: 'Wertstoffhof-Gutschein', detail: 'eine Anlieferung frei', kosten: 400, erreichbar: false },
]

export interface DemoStadtteilStand {
  id: string
  name: string
  xp: number
  trend: 'up' | 'down' | 'flat'
}

export const demoStandings: DemoStadtteilStand[] = [
  { id: 'nordend-west', name: 'Nordend-West', xp: 16880, trend: 'flat' },
  { id: 'bockenheim', name: 'Bockenheim', xp: 15240, trend: 'up' },
  { id: 'sachsenhausen-nord', name: 'Sachsenhausen-Nord', xp: 14905, trend: 'down' },
  { id: 'bornheim', name: 'Bornheim', xp: 11302, trend: 'up' },
  { id: 'gallus', name: 'Gallus', xp: 9870, trend: 'flat' },
]

/** The signed-in person, until phase 2 replaces this with a real session. */
export const demoUser = {
  name: 'Lena',
  stadtteilId: 'bockenheim',
  level: 7,
  xp: 1240,
  xpBisLevel: 1500,
  muenzen: 340,
  streakWochen: 5,
  aktionen: 18,
  kgWeitergegeben: 62,
  co2Kg: 24,
  anteilProzent: 12,
}

export const demoStadtziel = { erreicht: 3812, ziel: 5000, woche: 37 }
