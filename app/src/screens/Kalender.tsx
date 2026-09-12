import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag } from '../components/ui'
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
  const eigene = daten.filter((d) => d.own).length

  return (
    <Screen
      back
      title="Abfuhrkalender"
      sub={
        kalender.data
          ? `${kalender.data.district.name} · Ortsbezirk ${kalender.data.district.bezirk}`
          : `${me.district.name} · Ortsbezirk ${me.district.bezirk}`
      }
      gap={13}
      action={
        <button
          className="icobtn"
          onClick={() => navigate('/abholung')}
          aria-label="Sperrmüll anmelden"
        >
          <Icon name="plus" size={21} />
        </button>
      }
    >
      {kalender.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}

      {kalender.error && (
        <p className="sm" style={{ margin: 0 }}>
          <Label tone="warn">{de.state.error}</Label>{' '}
          <span className="mut">{kalender.error.message}</span>
        </p>
      )}

      {kalender.data && (
        <>
          <div className="between">
            <p className="lbl">Als Nächstes</p>
            <Tag von="simulated" icon />
          </div>

          <div className="col" style={{ gap: 9 }}>
            {daten.map((d) => (
              <Zeile
                key={d.id}
                termin={d}
                arbeitet={arbeitet === d.pickupId}
                onStorno={() => d.pickupId && void stornieren(d.pickupId)}
              />
            ))}
          </div>

          {daten.length === 0 && (
            <div className="empty">
              <Icon name="calendar" size={28} />
              {de.state.empty}
            </div>
          )}

          {fehler && (
            <p className="sm" style={{ margin: 0 }}>
              <Label tone="warn">{de.state.error}</Label> <span className="mut">{fehler}</span>
            </p>
          )}

          {storniert && (
            <div className="card tight row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <Icon name="info" size={18} className="ico" style={{ marginTop: 1 }} />
              <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>{storniert}</p>
            </div>
          )}

          {/* the difference between the two kinds of line, spelled out */}
          <div className="card sky tight row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <Icon name="spark" size={19} style={{ color: 'var(--blue-deep)', marginTop: 1 }} />
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {eigene > 0 ? (
                <>
                  {eigene === 1 ? 'Ein Termin' : `${eigene} Termine`} in dieser Liste{' '}
                  {eigene === 1 ? 'stammt' : 'stammen'} von dir und {eigene === 1 ? 'ist' : 'sind'}{' '}
                  als <b style={{ color: 'var(--ink)' }}>„eingetragen"</b> markiert — angelegt in
                  ReMain, nicht von FES bestätigt. Der Unterschied bleibt sichtbar.
                </>
              ) : (
                <>
                  Ein gebuchter Sperrmülltermin trägt sich hier selbst ein — und bleibt als{' '}
                  <b style={{ color: 'var(--ink)' }}>„eingetragen"</b> markiert, nicht als
                  „bestätigt". Der Unterschied bleibt sichtbar.
                </>
              )}
            </p>
          </div>

          <details>
            <summary className="xs mut" style={{ cursor: 'pointer' }}>
              Woher kommen diese Termine?
            </summary>
            <ul className="xs mut" style={{ margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
              {kalender.data.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </details>

          <button className="btn" onClick={() => navigate('/abholung')}>
            <Icon name="truck" size={19} />
            Sperrmüll anmelden
          </button>
        </>
      )}
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
          <b className="sm" style={{ display: 'block' }}>{termin.titel}</b>
          <span className="xs mut">
            {termin.label} · {termin.detail ?? termin.window}
            {termin.shifted ? ` · ${termin.shifted}` : ''}
          </span>
        </span>
        {termin.own ? (
          <Tag von="simulated" icon>eingetragen</Tag>
        ) : (
          <Tag von="simulated" icon />
        )}
      </div>

      {termin.own && (
        <>
          <div className="sep" style={{ margin: '11px 0' }} />
          <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => navigate(`/abholung/${termin.pickupId}`)}>Details und Erinnerungen</button>
          <div className="between">
            <span className="xs mut">
              Referenz <b style={{ color: 'var(--ink)' }}>{termin.reference}</b>
            </span>
            {offen ? (
              <span className="row" style={{ gap: 7 }}>
                <button className="btn sm" onClick={() => setOffen(false)}>
                  {de.action.cancel}
                </button>
                <button className="btn sm primary" disabled={arbeitet} onClick={onStorno}>
                  {arbeitet ? <span className="spinner" /> : 'Stornieren'}
                </button>
              </span>
            ) : (
              <button className="btn sm" onClick={() => setOffen(true)}>
                Termin absagen
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
