// Extracts the Stadtteil list from app/src/lib/frankfurt.ts into
// server/data/districts.json, so the client picker and the server's
// standings table can never disagree about what a district is.
//
//   node scripts/gen-districts.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ts = readFileSync(join(root, 'app/src/lib/frankfurt.ts'), 'utf8')

const m = ts.match(/export const STADTTEILE: Stadtteil\[\] = (\[[\s\S]*?\n\])/)
if (!m) throw new Error('could not find STADTTEILE in app/src/lib/frankfurt.ts')

// The literal is plain JSON once the unquoted keys are quoted and the
// trailing commas are gone.
const json = m[1]
  .replace(/(\w+):/g, '"$1":')
  .replace(/'/g, '"')
  .replace(/,(\s*[}\]])/g, '$1')

const districts = JSON.parse(json)
mkdirSync(join(root, 'server/data'), { recursive: true })
writeFileSync(join(root, 'server/data/districts.json'), JSON.stringify(districts, null, 1))
console.log(`wrote server/data/districts.json — ${districts.length} Stadtteile`)
