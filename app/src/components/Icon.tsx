import type { SVGProps } from 'react'

/**
 * Icon set — 24px grid, 1.7 stroke, round caps. One consistent family.
 * No emoji anywhere in the product.
 *
 * GENERATED from design/build.mjs by scripts/gen-icons.mjs so the app and
 * the design canvas can never drift apart. Edit the paths there, not here.
 */
const PATHS = {
  home: '<path d="M3.6 10.4 12 3.5l8.4 6.9"/><path d="M5.8 9.2V20.5h12.4V9.2"/><path d="M9.8 20.5v-5.2h4.4v5.2"/>',
  quest: '<path d="M6 21.5V3.2"/><path d="M6 4.2h11l-2.3 3.7L17 11.6H6"/>',
  camera: '<path d="M3.5 8.6h3.2l1.6-2.2h7.4l1.6 2.2h3.2v10.8H3.5z"/><circle cx="12" cy="13.6" r="3.3"/>',
  market: '<path d="M4.8 8.2h14.4l-1.1 12.3H5.9z"/><path d="M9 8.2V6a3 3 0 0 1 6 0v2.2"/>',
  leaf: '<path d="M5.2 19.2C4.4 12 9.4 5.6 19.4 4.6c.9 8.9-4.7 14.9-12.2 14.9-1 0-2-.3-2-.3z"/><path d="M7.2 17.4c2.6-3 5-5.1 8.4-6.6"/>',
  calendar: '<rect x="3.6" y="5.4" width="16.8" height="15" rx="3"/><path d="M8 3.4v3.6M16 3.4v3.6M3.6 10.2h16.8"/>',
  pin: '<path d="M12 21.3s6.9-6.1 6.9-10.7a6.9 6.9 0 1 0-13.8 0c0 4.6 6.9 10.7 6.9 10.7z"/><circle cx="12" cy="10.3" r="2.5"/>',
  shield: '<path d="M12 3.3 5.2 6v6.2c0 4.3 2.9 7.6 6.8 8.6 3.9-1 6.8-4.3 6.8-8.6V6z"/><path d="m9.2 12.1 2 2.1 3.7-4"/>',
  route: '<circle cx="6.2" cy="6.2" r="2.5"/><circle cx="17.8" cy="17.8" r="2.5"/><path d="M8.7 6.2h5.1a3.6 3.6 0 0 1 0 7.2h-3.6a3.6 3.6 0 0 0 0 7.2h5.1" transform="translate(0,-2.3)"/>',
  wrench: '<path d="M15.3 3.6a5.2 5.2 0 0 0-5 8.2L4 18.1a2 2 0 0 0 2.8 2.8l6.3-6.3a5.2 5.2 0 0 0 6.4-6.9l-2.7 2.7-2.6-.6-.6-2.6z"/>',
  spark: '<path d="m12 3.4 1.9 5.1 5.1 1.9-5.1 1.9L12 17.4l-1.9-5.1L5 10.4l5.1-1.9z"/><path d="m18.4 15.6.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  chevron: '<path d="m9.5 5.5 6.4 6.5-6.4 6.5"/>',
  back: '<path d="m14.5 5.5-6.4 6.5 6.4 6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  truck: '<path d="M2.8 6.6h10.5v10.2H2.8z"/><path d="M13.3 10.2h3.6l3.3 3.2v3.4h-6.9z"/><circle cx="7" cy="18.4" r="1.9"/><circle cx="17" cy="18.4" r="1.9"/>',
  users: '<circle cx="9.4" cy="8.6" r="3.3"/><path d="M3.6 19.6c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4"/><path d="M16.4 6.1a3.3 3.3 0 0 1 0 6.3M17.6 14.6c1.8.7 2.9 2.4 2.9 4.6"/>',
  check: '<path d="m5.5 12.6 4.2 4.3 8.8-9.6"/>',
  cross: '<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.4M12 7.8v.2"/>',
  gift: '<path d="M3.8 10.6h16.4v9.8H3.8z"/><path d="M2.8 6.4h18.4v4.2H2.8zM12 6.4v14"/><path d="M12 6.4C10.6 3.2 6.2 3.6 6.8 6.4M12 6.4c1.4-3.2 5.8-2.8 5.2 0"/>',
  scan: '<path d="M3.6 8.4V5.8a2.2 2.2 0 0 1 2.2-2.2h2.6M15.6 3.6h2.6a2.2 2.2 0 0 1 2.2 2.2v2.6M20.4 15.6v2.6a2.2 2.2 0 0 1-2.2 2.2h-2.6M8.4 20.4H5.8a2.2 2.2 0 0 1-2.2-2.2v-2.6"/>',
  cup: '<path d="M6.2 6.4h11.6l-1.1 13.2a1.5 1.5 0 0 1-1.5 1.4H8.8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M17.6 9.4h1.9a2.1 2.1 0 0 1 0 4.2h-2.2M5.4 3.4h13.2"/>',
  bell: '<path d="M6.4 10.4a5.6 5.6 0 0 1 11.2 0c0 4 1.6 5.6 1.6 5.6H4.8s1.6-1.6 1.6-5.6z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/>',
  trash: '<path d="M4.6 6.8h14.8M9.4 6.8V4.4h5.2v2.4"/><path d="M6.6 6.8 7.7 20a1.4 1.4 0 0 0 1.4 1.3h5.8a1.4 1.4 0 0 0 1.4-1.3l1.1-13.2"/>',
  plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  star: '<path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17.2l-5.3 2.8 1.1-5.9L3.5 10l5.9-.8z"/>',
  up: '<path d="M12 19.4V4.9"/><path d="m5.6 11.3 6.4-6.4 6.4 6.4"/>',
  down: '<path d="M12 4.6v14.5"/><path d="m5.6 12.7 6.4 6.4 6.4-6.4"/>',
  flat: '<path d="M5.6 12h12.8"/>',
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
