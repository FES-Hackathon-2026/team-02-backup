// Pulls REAL Frankfurt places out of OpenStreetMap via the Overpass API and
// writes them to server/data/places.json.
//
//   node scripts/fetch-places.mjs
//
// Run this once and commit the result: the server must not depend on Overpass
// being up at boot, and the jury must not wait on a third-party API.
//
// What we take and why:
//   recycling:centre     FES Wertstoffhöfe — where you take things yourself
//   recycling:container  glass / clothing / paper banks in the neighbourhood
//   waste_disposal       public disposal points
//   repair shops         the other half of the Reparatur-Markt: who can fix it
//
// OSM data is ODbL. Attribution ships with the app.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const UA = 'ReMain-Hackathon/0.1 (FES Frankfurt Impact Challenge, team-02)'

const QUERY = `
[out:json][timeout:90];
area["name"="Frankfurt am Main"]["admin_level"="6"]->.ffm;
(
  nwr["amenity"="recycling"]["recycling_type"="centre"](area.ffm);
  nwr["amenity"="waste_disposal"](area.ffm);
  nwr["amenity"="recycling"]["recycling_type"="container"]["recycling:glass_bottles"="yes"](area.ffm);
  nwr["amenity"="recycling"]["recycling_type"="container"]["recycling:clothes"="yes"](area.ffm);
  nwr["shop"="second_hand"](area.ffm);
  nwr["shop"="charity"](area.ffm);
  nwr["service:bicycle:repair"="yes"](area.ffm);
  nwr["repair"="yes"](area.ffm);
  nwr["craft"="electronics_repair"](area.ffm);
  nwr["shop"="repair"](area.ffm);
);
out center tags;
`

/** One OSM element -> one row, or null when it is not usable. */
function toPlace(el) {
  const t = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null

  let kind
  if (t.amenity === 'recycling' && t.recycling_type === 'centre') kind = 'wertstoffhof'
  else if (t.amenity === 'waste_disposal') kind = 'entsorgung'
  else if (t['recycling:clothes'] === 'yes') kind = 'altkleider'
  else if (t['recycling:glass_bottles'] === 'yes') kind = 'glascontainer'
  else if (t.shop === 'second_hand' || t.shop === 'charity') kind = 'secondhand'
  else kind = 'reparatur'

  // An unnamed glass container is still a real, useful place; give it a label
  // people would actually recognise rather than dropping it.
  const fallback = {
    glascontainer: 'Glascontainer',
    altkleider: 'Altkleider-Container',
    entsorgung: 'Entsorgungsstelle',
    wertstoffhof: 'Wertstoffhof',
    secondhand: 'Second-Hand',
    reparatur: 'Reparatur',
  }[kind]

  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')

  return {
    id: `${el.type}/${el.id}`,
    kind,
    name: t.name ?? t.operator ?? fallback,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    addr: street || null,
    postcode: t['addr:postcode'] ?? null,
    opening_hours: t.opening_hours ?? null,
    operator: t.operator ?? null,
    /** true when FES actually runs it — the app says so on screen */
    fes: (t['operator:short'] ?? '').toUpperCase() === 'FES' || /FES|Frankfurter Entsorgungs/i.test(t.operator ?? ''),
    website: t.website ?? t['contact:website'] ?? null,
    phone: t.phone ?? t['contact:phone'] ?? null,
    source: 'openstreetmap',
  }
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
  body: new URLSearchParams({ data: QUERY }),
})

if (!res.ok) {
  console.error(`Overpass answered ${res.status}. Try again in a minute — it rate-limits.`)
  process.exit(1)
}

const json = await res.json()
const places = json.elements.map(toPlace).filter(Boolean)

// Two containers on the same corner are two rows in OSM but one place to a
// person; collapse anything within ~15 m of the same kind.
const kept = []
for (const p of places) {
  const dup = kept.find(
    (q) =>
      q.kind === p.kind &&
      Math.abs(q.lat - p.lat) < 0.00014 &&
      Math.abs(q.lon - p.lon) < 0.00022,
  )
  if (!dup) kept.push(p)
}

const byKind = {}
for (const p of kept) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1

const out = {
  fetched_at: new Date().toISOString(),
  source: 'OpenStreetMap via Overpass API',
  licence: 'ODbL — © OpenStreetMap contributors',
  area: 'Frankfurt am Main',
  counts: byKind,
  places: kept,
}

mkdirSync(join(root, 'server/data'), { recursive: true })
writeFileSync(join(root, 'server/data/places.json'), JSON.stringify(out, null, 1))

console.log(`wrote server/data/places.json — ${kept.length} places`)
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(4)}  ${k}`)
console.log(`  ${kept.filter((p) => p.fes).length} of them operated by FES`)
