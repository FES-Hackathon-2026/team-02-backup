import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(new URL('../src/assets/remain-mark.svg', import.meta.url), 'utf8')
const publicDirectory = new URL('../public/', import.meta.url)
writeFileSync(new URL('favicon.svg', publicDirectory), source)

for (const [filename, size, solid] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  // Full-bleed ground for OS masks; all identifying artwork sits within the safe circle.
  const svg = solid ? source.replace('x="6" y="6" width="88" height="88" rx="22"', 'width="100" height="100"') : source
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(new URL(filename, publicDirectory), png)
  console.log(`${filename}: ${size} × ${size}`)
}
console.log(`Source: ${fileURLToPath(new URL('../src/assets/remain-mark.svg', import.meta.url))}`)
