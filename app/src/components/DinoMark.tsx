import fessie from '../assets/fessie.svg'

/** Dragon silhouette for ReMain's assistant, redrawn as resolution-independent SVG. */
export default function DinoMark({ size = 46 }: { size?: number }) {
  return <img
    src={fessie}
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    draggable={false}
    className="dino-mark"
  />
}
