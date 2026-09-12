import { t } from './../lib/i18n'
import { useId, useState } from 'react'

/** Both images remain full size; the slider reveals the matching area. */
export default function PhotoCompare({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(50)
  const id = useId()
  return <div className="photo-comparison">
    <div className="comparison-images">
      <img src={`/api/photos/${encodeURIComponent(after)}`} alt={t("Nachher: eingereichter Zustand")} />
      <img className="comparison-before" src={`/api/photos/${encodeURIComponent(before)}`} alt={t("Vorher: gemeldeter Zustand")} style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} />
      <span className="comparison-line" style={{ left: `${position}%` }} />
      <span className="comparison-label before">{t("Vorher")}</span><span className="comparison-label after">{t("Nachher")}</span>
    </div>
    <label className="xs mut" htmlFor={id}>{t("Vorher / Nachher vergleichen")}</label>
    <input id={id} type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))} aria-valuetext={t(`${position} Prozent Vorher-Bild`)} />
  </div>
}
