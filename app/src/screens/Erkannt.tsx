import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Bar, Coin, Label, Tag, Thumb } from '../components/ui'
import {
  api,
  ApiError,
  type HazardReport,
  type ScanResult,
  type ScanRouteId,
} from '../lib/client'
import { de } from '../lib/de'

const ROUTE_ICON: Record<ScanRouteId, Parameters<typeof Icon>[0]['name']> = {
  pickup: 'truck',
  market: 'market',
  quest: 'quest',
  knowledge: 'info',
  hazard_dropoff: 'pin',
  hazard_official: 'shield',
  hazard_report: 'check',
}

const prozent = (n: number) => `${Math.round(n * 100)} %`
const sekunden = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/**
 * What the agent made of the photo — and, just as importantly, why.
 *
 * Everything here is an estimate and says so. The confidence, the volume and
 * the reusability carry the „Schätzung" tag; the points are a preview and are
 * credited only once the action they lead to is confirmed. The one thing on
 * this screen that is not a guess is who answered, which is why the provider
 * is named rather than hidden.
 *
 * A hazardous find takes a different screen entirely — see Gefahrstoff below.
 */
export default function Erkannt() {
  const { photoId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const mitgereicht = (location.state as { scan?: ScanResult } | null)?.scan ?? null

  const [scan, setScan] = useState<ScanResult | null>(mitgereicht)
  const [laden, setLaden] = useState(mitgereicht === null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [korrigieren, setKorrigieren] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  /* A reload has no navigation state, so the answer is fetched back from the
     server rather than recomputed — the same photo must never suddenly tell
     a different story. */
  useEffect(() => {
    if (scan !== null || !photoId) return
    let abgebrochen = false

    api
      .get<ScanResult>(`/api/scan/${photoId}`)
      .then((r) => !abgebrochen && setScan(r))
      .catch((err: unknown) =>
        setFehler(
          err instanceof ApiError
            ? err.message
            : 'Keine Verbindung — die Erkennung lässt sich gerade nicht laden.',
        ),
      )
      .finally(() => !abgebrochen && setLaden(false))

    return () => {
      abgebrochen = true
    }
  }, [photoId, scan])

  async function korrektur(category: string) {
    if (!photoId || speichert) return
    setSpeichert(true)
    try {
      const neu = await api.post<ScanResult>(`/api/scan/${photoId}/korrektur`, { category })
      setScan(neu)
      setKorrigieren(false)
      setMeldung(null)
    } catch (err) {
      setFehler(err instanceof ApiError ? err.message : de.state.error)
    } finally {
      setSpeichert(false)
    }
  }

  async function melden() {
    if (!photoId || speichert) return
    setSpeichert(true)
    try {
      const antwort = await api.post<HazardReport>(`/api/scan/${photoId}/gefahrmeldung`)
      setScan(antwort)
      setMeldung(antwort.message)
    } catch (err) {
      setFehler(err instanceof ApiError ? err.message : de.state.error)
    } finally {
      setSpeichert(false)
    }
  }

  if (laden) {
    return (
      <Screen back title="Erkannt" sub={de.state.loading}>
        <div className="empty">
          <span className="spinner" />
        </div>
      </Screen>
    )
  }

  if (!scan) {
    return (
      <Screen back title="Erkannt" sub="nichts gefunden">
        <div className="empty">
          <Icon name="camera" size={28} />
          {fehler ?? 'Zu diesem Foto liegt keine Erkennung vor.'}
        </div>
        <button className="btn primary" onClick={() => navigate('/scan')}>
          <Icon name="camera" size={19} />
          Noch einmal scannen
        </button>
      </Screen>
    )
  }

  const agent = scan.agent
  const mock = agent.provider === 'mock'

  const herkunft = (
    <div className="card tight">
      <div className="between">
        <span className="row" style={{ gap: 7 }}>
          <Icon name="spark" size={17} className="ico" stroke={1.9} />
          <span className="h3">{mock ? 'Offline erkannt' : 'Modell befragt'}</span>
        </span>
        {mock ? <Tag von="simulated" icon /> : <Tag von="estimate" icon />}
      </div>
      <p className="xs mut" style={{ margin: '7px 0 0' }}>
        {mock
          ? (agent.note ??
            'Erkannt aus dem Offline-Fundus von ReMain — es wurde kein Modell im Netz befragt.')
          : `${agent.model} über Groq.`}{' '}
        {sekunden(agent.latencyMs)}
      </p>
      {agent.fallback && (
        <p className="xs" style={{ margin: '7px 0 0' }}>
          <Label tone="warn">ausgewichen</Label>{' '}
          <span className="mut">{agent.fallbackReason}</span>
        </p>
      )}
    </div>
  )

  const warum = (
    <div className="card">
      <p className="lbl" style={{ marginBottom: 9 }}>
        Warum
      </p>
      <div className="col" style={{ gap: 9 }}>
        {scan.reasoning.map((satz, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
            <span style={{ marginTop: 2 }}>
              <Icon name="check" size={15} className="ico" stroke={2.4} />
            </span>
            <span className="sm">{satz}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const korrekturBlock = (
    <div className="card dashed">
      <button
        className="between"
        onClick={() => setKorrigieren((k) => !k)}
        aria-expanded={korrigieren}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <span className="sm" style={{ fontWeight: 600 }}>
          Falsch erkannt? Kategorie korrigieren
        </span>
        <Icon name="chevron" size={18} className="ico" />
      </button>

      {korrigieren && (
        <>
          <p className="xs mut" style={{ margin: '10px 0 9px' }}>
            Deine Korrektur wird protokolliert und entscheidet den Weg neu.
          </p>
          <div className="chips">
            {scan.categories.map((c) => (
              <button
                key={c.id}
                className="chip"
                aria-pressed={c.id === scan.category}
                disabled={speichert}
                onClick={() => void korrektur(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  if (scan.hazard) {
    return (
      <Gefahrstoff
        scan={scan}
        speichert={speichert}
        meldung={meldung}
        fehler={fehler}
        onMelden={() => void melden()}
        herkunft={herkunft}
        warum={warum}
        korrektur={korrekturBlock}
      />
    )
  }

  return (
    <Screen
      back
      title="Erkannt"
      sub={scan.modeLabel}
      action={
        <button className="icobtn" onClick={() => navigate('/scan')} aria-label="Neu scannen">
          <Icon name="camera" size={21} />
        </button>
      }
    >
      {/* the verdict */}
      <div className="card">
        <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
          <img
            className="thumb"
            src={`/api/photos/${scan.photoId}`}
            alt="Das aufgenommene Foto"
            style={{ width: 76, height: 76, objectFit: 'cover' }}
          />
          <div className="grow">
            <h1 className="h1" style={{ fontSize: 23 }}>
              {scan.categoryLabel}
            </h1>
            <div className="sm mut" style={{ marginTop: 2 }}>
              {scan.subtype}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              {scan.corrected ? <Tag von="input" /> : <Tag von="estimate" icon />}
              {scan.corrected && <Label>von dir korrigiert</Label>}
            </div>
          </div>
        </div>

        <div className="between" style={{ marginTop: 14, marginBottom: 6 }}>
          <span className="sm mut">Sicherheit</span>
          <span className="num" style={{ fontSize: 15 }}>
            {prozent(scan.confidence)}
          </span>
        </div>
        <Bar value={scan.confidence * 100} />
      </div>

      {herkunft}
      {warum}

      {/* the two numbers behind the routing decision */}
      <div className="card">
        <div className="between">
          <span className="sm mut">Geschätztes Volumen</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="num">{scan.estimatedVolumeLabel}</b>
            <Tag von="estimate" />
          </span>
        </div>
        <div className="sep" style={{ margin: '11px 0' }} />
        <div className="between">
          <span className="sm mut">Noch nutzbar</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="num">{prozent(scan.reusableProbability)}</b>
            <Tag von="estimate" />
          </span>
        </div>
        <p className="xs mut" style={{ margin: '11px 0 0' }}>
          {scan.bin}
        </p>
      </div>

      {/* the three ways forward */}
      <p className="lbl" style={{ marginTop: 4 }}>
        Was jetzt
      </p>

      {scan.routes.map((route) => (
        <button
          key={route.id}
          className={route.primary ? 'card sky' : 'card'}
          onClick={() => navigate(route.to, { state: { scan } })}
        >
          <div className="row">
            <Thumb icon={ROUTE_ICON[route.id]} size={42} />
            <div className="grow">
              <div className="between">
                <span className="h3">{route.label}</span>
                {route.xpPreview > 0 ? (
                  <Coin star>bis {route.xpPreview} XP</Coin>
                ) : (
                  <Label>ohne Punkte</Label>
                )}
              </div>
              <div className="sm mut" style={{ marginTop: 2 }}>
                {route.hint}
              </div>
              {route.primary && (
                <div style={{ marginTop: 6 }}>
                  <Label>Vorschlag</Label>
                </div>
              )}
            </div>
            <Icon name="chevron" size={19} className="ico" />
          </div>
        </button>
      ))}

      <p className="xs mut" style={{ margin: 0 }}>
        Die Punkte sind eine Vorschau. Gutgeschrieben wird erst die bestätigte Aktion — mit Formel
        im Nachweis.
      </p>

      {korrekturBlock}

      {fehler && (
        <p className="xs" style={{ margin: 0, color: 'var(--alert)' }}>
          {fehler}
        </p>
      )}
    </Screen>
  )
}

/* ==================================================================
   Gefahrstoff — a different screen, not a red version of the same one.

   FES hands hazardous waste to trained staff at the Schadstoffsammlung and
   asks people not to collect it themselves; their terms for public clean-up
   days name paint buckets, oil cans and car batteries as things to report
   rather than pick up. So this screen offers no collection at all: where to
   hand it in, how to report it officially, and how to document the find.
   The only points here are for the report — never for handling the thing.
   ================================================================== */
function Gefahrstoff({
  scan,
  speichert,
  meldung,
  fehler,
  onMelden,
  herkunft,
  warum,
  korrektur,
}: {
  scan: ScanResult
  speichert: boolean
  meldung: string | null
  fehler: string | null
  onMelden: () => void
  herkunft: React.ReactNode
  warum: React.ReactNode
  korrektur: React.ReactNode
}) {
  const navigate = useNavigate()
  const gefahr = scan.hazard!
  const [akut, setAkut] = useState(gefahr.immediateDanger)

  const rot = {
    background: 'var(--alert-soft)',
    borderColor: 'var(--alert)',
    boxShadow: 'none',
  }

  return (
    <Screen
      back
      title="Gefahrstoff"
      sub={scan.modeLabel}
      action={
        <button className="icobtn" onClick={() => navigate('/scan')} aria-label="Neu scannen">
          <Icon name="camera" size={21} />
        </button>
      }
    >
      {/* the warning itself */}
      <div className="card" style={rot} role="alert">
        <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
          <img
            className="thumb"
            src={`/api/photos/${scan.photoId}`}
            alt="Das aufgenommene Foto"
            style={{ width: 68, height: 68, objectFit: 'cover' }}
          />
          <div className="grow">
            <div className="row" style={{ gap: 7, color: 'var(--alert)' }}>
              <Icon name="shield" size={19} stroke={2.2} />
              <h1 className="h1" style={{ fontSize: 20, color: 'var(--alert)' }}>
                {gefahr.headline}
              </h1>
            </div>
            <div className="sm" style={{ marginTop: 3, fontWeight: 600 }}>
              {scan.subtype}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              {scan.corrected ? <Tag von="input" /> : <Tag von="estimate" icon />}
              <span className="xs mut">{prozent(scan.confidence)} sicher</span>
            </div>
          </div>
        </div>

        <p className="sm" style={{ margin: '13px 0 0', fontWeight: 600 }}>
          {gefahr.lead}
        </p>

        {gefahr.signals.length > 0 && (
          <div className="chips" style={{ marginTop: 11 }}>
            {gefahr.signals.map((s) => (
              <span key={s} className="tag warn">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="col" style={{ gap: 7, marginTop: 13 }}>
          {gefahr.safety.map((satz) => (
            <div key={satz} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <span style={{ marginTop: 2, color: 'var(--alert)' }}>
                <Icon name="cross" size={14} stroke={2.6} />
              </span>
              <span className="sm">{satz}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 112 — only for the cases that actually warrant it */}
      {akut ? (
        <a
          className="btn"
          href={`tel:${gefahr.emergency.number}`}
          style={{
            background: 'var(--alert)',
            borderColor: 'var(--alert)',
            color: 'var(--on-alert)',
            textDecoration: 'none',
          }}
        >
          <Icon name="bell" size={19} stroke={2.2} />
          {gefahr.emergency.number} anrufen — akute Gefahr
        </a>
      ) : (
        <button
          className="card dashed"
          onClick={() => setAkut(true)}
          style={{ borderColor: 'var(--alert)' }}
        >
          <div className="row">
            <span style={{ color: 'var(--alert)' }}>
              <Icon name="bell" size={18} stroke={2.2} />
            </span>
            <span className="grow sm">
              Läuft es aus, dampft oder brennt es, ist jemand verletzt?
            </span>
            <Icon name="chevron" size={18} className="ico" />
          </div>
        </button>
      )}
      <p className="xs mut" style={{ margin: '-4px 0 0' }}>
        {gefahr.emergency.when}
      </p>

      {herkunft}
      {warum}

      {/* the three safe ways forward */}
      <p className="lbl" style={{ marginTop: 4 }}>
        Sichere Wege
      </p>

      {/* 1 — where it may be handed in, with a real address */}
      <button className="card" onClick={() => navigate('/wissen', { state: { scan } })}>
        <div className="row">
          <Thumb icon="pin" size={42} />
          <div className="grow">
            <div className="between">
              <span className="h3">Offizielle Abgabestelle finden</span>
              <Label>ohne Punkte</Label>
            </div>
            {gefahr.dropoff ? (
              <>
                <div className="sm mut" style={{ marginTop: 2 }}>
                  {gefahr.dropoff.name}
                  {gefahr.dropoff.addr ? `, ${gefahr.dropoff.addr}` : ''}
                  {gefahr.dropoff.distanceKm !== null
                    ? ` · ${gefahr.dropoff.distanceKm.toLocaleString('de-DE')} km`
                    : ''}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <Tag von="api">OpenStreetMap</Tag>
                  {gefahr.dropoff.openingHours && (
                    <span className="xs mut">{gefahr.dropoff.openingHours}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="sm mut" style={{ marginTop: 2 }}>
                Schadstoffmobil oder Wertstoffhof — persönlich beim Personal abgeben.
              </div>
            )}
          </div>
          <Icon name="chevron" size={19} className="ico" />
        </div>
      </button>

      {/* 2 — the official channel, which is FES itself */}
      <a
        className="card"
        href={gefahr.source.url}
        target="_blank"
        rel="noreferrer noopener"
        style={{ textDecoration: 'none' }}
      >
        <div className="row">
          <Thumb icon="shield" size={42} />
          <div className="grow">
            <div className="between">
              <span className="h3">Fund melden</span>
              <Label>ohne Punkte</Label>
            </div>
            <div className="sm mut" style={{ marginTop: 2 }}>
              {gefahr.source.name} — der offizielle Weg bei FES.
            </div>
          </div>
          <Icon name="chevron" size={19} className="ico" />
        </div>
      </a>

      {/* 3 — the only rewarded act: documenting it */}
      {gefahr.reported ? (
        <div className="card sky">
          <div className="row">
            <Thumb icon="check" size={42} />
            <div className="grow">
              <div className="between">
                <span className="h3">Meldung gespeichert</span>
                <Coin star>+{gefahr.reportXp} XP</Coin>
              </div>
              <div className="sm mut" style={{ marginTop: 2 }}>
                {meldung ?? 'Foto und Standort sind dokumentiert.'}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 7 }}>
                <Tag von={gefahr.located === false ? 'input' : 'simulated'} icon />
                {gefahr.receiptActionId != null && (
                  <button
                    className="chip"
                    onClick={() => navigate(`/nachweis/${gefahr.receiptActionId}`)}
                  >
                    Nachweis ansehen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button className="card sky" onClick={onMelden} disabled={speichert}>
          <div className="row">
            <Thumb icon="check" size={42} />
            <div className="grow">
              <div className="between">
                <span className="h3">Als sichere Meldung speichern</span>
                <Coin star>+{gefahr.reportXp} XP</Coin>
              </div>
              <div className="sm mut" style={{ marginTop: 2 }}>
                Foto und Standort dokumentieren, ohne etwas anzufassen.
              </div>
            </div>
            {speichert ? <span className="spinner" /> : <Icon name="chevron" size={19} className="ico" />}
          </div>
        </button>
      )}

      <p className="xs mut" style={{ margin: 0 }}>
        Es gibt hier bewusst keine Punkte fürs Aufräumen. Gefahrstoffe gehören in die Hände von
        Fachleuten — belohnt wird die Meldung, nicht das Anfassen. Quelle:{' '}
        <a href={gefahr.source.url} target="_blank" rel="noreferrer noopener">
          {gefahr.source.name}
        </a>
        .
      </p>

      {korrektur}

      {fehler && (
        <p className="xs" style={{ margin: 0, color: 'var(--alert)' }}>
          {fehler}
        </p>
      )}
    </Screen>
  )
}
