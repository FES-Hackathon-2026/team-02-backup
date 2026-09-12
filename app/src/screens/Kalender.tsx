import { t } from './../lib/i18n'
import CollectionCalendar from '../components/CollectionCalendar'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Label } from '../components/ui'
import { ApiError, api, useApi, type FesCalendar, type FesCalendarDate } from '../lib/client'
import { de } from '../lib/de'
import { FRAKTION_FARBE } from '../lib/demo'
import { useSession } from '../lib/session'

/**
 * Der Abfuhrkalender.
 *
 * Two kinds of line sit in one list and must never look alike: a collection
 * FES drives anyway, and a Sperrmüll date this person booked in ReMain. The
 * second says „eingetragen", not „bestätigt", and keeps saying it — the
 * booking exists here, not at FES.
 *
 * The cycles themselves are rebuilt too. That is what the „simuliert" tag on
 * the header is for; the assumptions behind every date are one tap away
 * rather than buried in a README.
 */
export default function Kalender() {
  const navigate = useNavigate()
  const { me } = useSession()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [storniert, setStorniert] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [arbeitet, setArbeitet] = useState<string | null>(null)

  const kalender = useApi<FesCalendar>('/api/fes/calendar')

  if (!me) return null

  async function stornieren(pickupId: string) {
    if (arbeitet) return
    setArbeitet(pickupId)
    setFehler(null)
    try {
      const antwort = await api.post<{ message: string; ledgerNote: string }>(
        `/api/fes/pickups/${pickupId}/cancel`,
      )
      setStorniert(antwort.ledgerNote)
      kalender.reload()
    } catch (err) {
      setFehler(err instanceof ApiError ? err.message : de.state.error)
    } finally {
      setArbeitet(null)
    }
  }

  const daten = kalender.data?.dates ?? []
  const shown = selectedDay ? daten.filter(d => d.date.slice(0, 10) === selectedDay) : daten
  const eigene = daten.filter((d) => d.own).length

  return (
    <Screen
      back
      title={t("Abfuhrkalender")}
      sub={t("Wann deine Tonnen geleert werden")}
      gap={13}
      action={
        <button
          className="icobtn"
          onClick={() => navigate('/mitteilungen')}
          aria-label={t("Sperrmüll anmelden")}
        >
          <Icon name="plus" size={21} />
        </button>
      }
    >
      {t(kalender.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      ))}

      {t(kalender.error && (
        <p className="sm" style={{ margin: 0 }}>
          <Label tone="warn">{t(de.state.error)}</Label>{t(' ')}
          <span className="mut">{t(kalender.error.message)}</span>
        </p>
      ))}

      {t(kalender.data && (
        <>
          <CollectionCalendar dates={daten} selected={selectedDay} onSelect={setSelectedDay} />
          <div className="between">
            <p className="lbl">{t(selectedDay ? `Termine am ${selectedDay.split('-').reverse().join('.')}` : 'Als Nächstes')}</p>
            
          </div>

          <div className="col" style={{ gap: 9 }}>
            {t(shown.map((d) => (
              <Zeile
                key={d.id}
                termin={d}
                arbeitet={arbeitet === d.pickupId}
                onStorno={() => d.pickupId && void stornieren(d.pickupId)}
              />
            )))}
          </div>

          {t(shown.length === 0 && (
            <div className="empty">
              <Icon name="calendar" size={28} />
              {t(selectedDay ? 'Für diesen Tag liegt kein Termin vor.' : de.state.empty)}
            </div>
          ))}

          {t(fehler && (
            <p className="sm" style={{ margin: 0 }}>
              <Label tone="warn">{t(de.state.error)}</Label> <span className="mut">{t(fehler)}</span>
            </p>
          ))}

          {t(storniert && (
            <div className="card tight row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <Icon name="info" size={18} className="ico" style={{ marginTop: 1 }} />
              <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>{t(storniert)}</p>
            </div>
          ))}

          {/* the difference between the two kinds of line, spelled out */}
          <div className="card sky tight row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <Icon name="spark" size={19} style={{ color: 'var(--blue-deep)', marginTop: 1 }} />
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {t(eigene > 0 ? (
                <>
                  {t(eigene === 1 ? 'Ein Termin' : `${eigene} Termine`)} {t(" in dieser Liste")}{t(' ')}
                  {t(eigene === 1 ? 'stammt' : 'stammen')} {t(" von dir und ")}{t(eigene === 1 ? 'ist' : 'sind')}{t(' ')}
                  {t("als ")}<b style={{ color: 'var(--ink)' }}>{t("„eingetragen\"")}</b> {t(" markiert — angelegt in ReMain, nicht von FES bestätigt. Der Unterschied bleibt sichtbar.")}</>
              ) : (
                <>
                  {t("Ein gebuchter Sperrmülltermin trägt sich hier selbst ein — und bleibt als")}{t(' ')}
                  <b style={{ color: 'var(--ink)' }}>{t("„eingetragen\"")}</b> {t(" markiert, nicht als „bestätigt\". Der Unterschied bleibt sichtbar.")}</>
              ))}
            </p>
          </div>

          <details>
            <summary className="xs mut" style={{ cursor: 'pointer' }}>
              {t("Woher kommen diese Termine?")}</summary>
            <ul className="xs mut" style={{ margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
              {t(kalender.data.assumptions.map((a, i) => (
                <li key={i}>{t(a)}</li>
              )))}
            </ul>
          </details>

          <button className="btn" onClick={() => navigate('/mitteilungen')}>
            <Icon name="truck" size={19} />
            {t("Sperrmüll anmelden")}</button>
        </>
      ))}
    </Screen>
  )
}

function Zeile({
  termin,
  arbeitet,
  onStorno,
}: {
  termin: FesCalendarDate
  arbeitet: boolean
  onStorno: () => void
}) {
  const [offen, setOffen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="card tight">
      <div className="row" style={{ gap: 11 }}>
        <span
          style={{
            width: 8,
            height: 40,
            borderRadius: 5,
            background: FRAKTION_FARBE[termin.fraktion],
            flex: 'none',
          }}
        />
        <span className="grow">
          <b className="sm" style={{ display: 'block' }}>{t(termin.titel)}</b>
          <span className="xs mut">
            {t(termin.label)} {t(" · ")}{t(termin.detail ?? termin.window)}
            {t(termin.shifted ? ` · ${termin.shifted}` : '')}
          </span>
        </span>
      </div>

      {t(termin.own && (
        <>
          <div className="sep" style={{ margin: '11px 0' }} />
          <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => navigate(`/abholung/${termin.pickupId}`)}>{t("Details und Erinnerungen")}</button>
          <div className="between">
            <span className="xs mut">
              {t("Referenz ")}<b style={{ color: 'var(--ink)' }}>{t(termin.reference)}</b>
            </span>
            {t(offen ? (
              <span className="row" style={{ gap: 7 }}>
                <button className="btn sm" onClick={() => setOffen(false)}>
                  {t(de.action.cancel)}
                </button>
                <button className="btn sm primary" disabled={arbeitet} onClick={onStorno}>
                  {t(arbeitet ? <span className="spinner" /> : 'Stornieren')}
                </button>
              </span>
            ) : (
              <button className="btn sm" onClick={() => setOffen(true)}>
                {t("Termin absagen")}</button>
            ))}
          </div>
        </>
      ))}
    </div>
  )
}
