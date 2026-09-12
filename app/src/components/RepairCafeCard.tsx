import { t, getLocale } from './../lib/i18n'
import { useState } from 'react'

import DecisionSheet from './DecisionSheet'
import Icon from './Icon'
import type { RepairCafe } from '../lib/client'

/**
 * One Repair Café, as a row that opens its own details.
 *
 * Both places that show cafés — the Reparatur-Markt list and the three
 * suggested on an item — need the same popup, so it lives with the card
 * rather than in either screen. Tapping a row is the only way to reach the
 * address, the date and the mail address, and those are the whole point: a
 * café is not a shop you can walk into on a Tuesday afternoon.
 */

const km = (value: number) =>
  value.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Street and postcode as one line, skipping whatever is missing. */
const anschrift = (cafe: RepairCafe) =>
  [cafe.addr, [cafe.postcode, 'Frankfurt am Main'].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

export default function RepairCafeCard({ cafe }: { cafe: RepairCafe }) {
  const [offen, setOffen] = useState(false)

  return (
    <>
      <button className="card tight" onClick={() => setOffen(true)}>
        <div className="row" style={{ gap: 11 }}>
          <span className="thumb" style={{ width: 38, height: 38, flex: 'none' }}>
            <Icon name="wrench" size={19} />
          </span>
          <span className="grow">
            <b className="sm" style={{ display: 'block' }}>
              {t(cafe.name)}
            </b>
            <span className="xs mut">
              {t(cafe.addr ?? 'Adresse nicht hinterlegt')}
              {t(Number.isFinite(cafe.distanceKm) && ` · ${km(cafe.distanceKm)} km`)}
            </span>
          </span>
          <Icon name="chevron" size={16} className="ico" />
        </div>
      </button>

      {t(offen && (
        <DecisionSheet title={cafe.name} onClose={() => setOffen(false)}>
          <Zeile icon="pin" label={t("Adresse")}>
            {t(anschrift(cafe) || 'nicht hinterlegt')}
            {t(Number.isFinite(cafe.distanceKm) && (
              <span className="xs mut" style={{ display: 'block' }}>
                {t(km(cafe.distanceKm))} {t(" km von dir")}</span>
            ))}
          </Zeile>

          {t(cafe.operator && <Zeile icon="users" label={t("Wer es macht")}>{t(cafe.operator)}</Zeile>)}

          <Zeile icon="clock" label={t("Termine")}>
            {/* Half of the eight publish no fixed rhythm at all. Saying so is
                more use than an empty field the person has to interpret. */}
            {t(cafe.openingHours ?? 'Keine festen Termine hinterlegt — frag per Mail oder schau beim Eintrag nach.')}
          </Zeile>

          {t(cafe.email && (
            <Zeile icon="mail" label={t("Kontakt")}>
              <a href={`mailto:${cafe.email}`}>{t(cafe.email)}</a>
            </Zeile>
          ))}

          {t(cafe.website && (
            <Zeile icon="link" label={t("Website")}>
              <a href={cafe.website} target="_blank" rel="noreferrer noopener">
                {t(cafe.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}
              </a>
            </Zeile>
          ))}

          {t(cafe.infoUrl && (
            <Zeile icon="info" label={t("Verzeichnis")}>
              <a href={cafe.infoUrl} target="_blank" rel="noreferrer noopener">
                {t("Eintrag bei repaircafe.org")}</a>
              <span className="xs mut" style={{ display: 'block' }}>
                {t("Dort steht der nächste Termin zuerst.")}</span>
            </Zeile>
          ))}
        </DecisionSheet>
      ))}
    </>
  )
}

/** One labelled line in the popup: icon, what it is, what it says. */
function Zeile({
  icon,
  label,
  children,
}: {
  icon: 'pin' | 'clock' | 'mail' | 'link' | 'info' | 'users'
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
      <Icon name={icon} size={18} className="ico" />
      <span className="grow">
        <span className="lbl" style={{ display: 'block', marginBottom: 2 }}>
          {t(label)}
        </span>
        <span className="sm" style={{ lineHeight: 1.5 }}>
          {t(children)}
        </span>
      </span>
    </div>
  )
}
