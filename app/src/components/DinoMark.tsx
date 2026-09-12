import fessie from '../assets/fessie.svg'

/** Fessie's white dragon on a red circle, sharp at every display size. */
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
