// Regenerates app/src/components/Icon.tsx from the icon paths in
// design/build.mjs, so the running app and the design canvas share one
// source of truth for every glyph.
//
//   node scripts/gen-icons.mjs
//
// Add or change an icon in design/build.mjs, run this, rebuild the canvas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'design/build.mjs'), 'utf8')

const match = src.match(/const P = \{([\s\S]*?)\n\}/)
if (!match) throw new Error('could not find the `const P = { ... }` icon map in design/build.mjs')
const body = match[1]

const out = `import type { SVGProps } from 'react'

/**
 * Icon set — 24px grid, 1.7 stroke, round caps. One consistent family.
 * No emoji anywhere in the product.
 *
 * GENERATED from design/build.mjs by scripts/gen-icons.mjs so the app and
 * the design canvas can never drift apart. Edit the paths there, not here.
 */
const PATHS = {${body}
} as const

export type IconName = keyof typeof PATHS

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name' | 'stroke'> {
  name: IconName
  size?: number
  stroke?: number
}

export default function Icon({ name, size = 22, stroke = 1.7, ...rest }: Props) {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
`

mkdirSync(join(root, 'app/src/components'), { recursive: true })
writeFileSync(join(root, 'app/src/components/Icon.tsx'), out)

const names = [...body.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1])
console.log(`wrote app/src/components/Icon.tsx — ${names.length} icons: ${names.join(' ')}`)
