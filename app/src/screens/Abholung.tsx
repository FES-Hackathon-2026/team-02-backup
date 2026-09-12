import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag } from '../components/ui'
import { ApiError, api, useApi, type FesBooking, type FesCategories, type FesSlots } from '../lib/client'
import { de } from '../lib/de'
import { STADTTEILE } from '../lib/frankfurt'
import { useSession } from '../lib/session'

/**
 * Sperrmüll anmelden — from "it is standing in the hallway" to a reference
 * number, on one screen.
 *
 * The real FES service walks five pages (Adresse, Standort, Gegenstände,
 * Kontakt, Bestätigung). That order is right, the five page loads are not:
 * everything except the address is already known, either from the scan or
 * from the session, so this asks for the one thing it cannot know and
 * confirms the rest.
 *
 * Nothing here is confirmed by FES. Every value carries its origin — typed,
 * estimated, or from a service we rebuilt — and the booking says so again.
 */

/** m³ steps a person can actually picture. */
const VOLUMES = [
  { v: 0.5, label: '0,5 m³', hint: 'ein Sessel' },
  { v: 1, label: '1 m³', hint: 'eine Waschmaschine' },
  { v: 2, label: '2 m³', hint: 'ein Sofa' },
  { v: 4, label: '4 m³', hint: 'eine Zimmereinrichtung' },
  { v: 6, label: '6 m³', hint: 'eine Wohnungsauflösung' },
]

export default function Abholung() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { me, refresh } = useSession()

  /* Phase 4 links here without parameters today. Both doors are open: a
     query string (?category=&volume=) and router state, so the scan result
     prefills the moment that phase appends it. */
  const state = (location.state ?? {}) as { category?: string; volumeM3?: number }
  const vorgabeKategorie = params.get('category') ?? state.category ?? null
  const vorgabeVolumen = Number(params.get('volume') ?? state.volumeM3 ?? 0)

  /** The smallest step that still holds the estimated volume. */
  const vorgabeStufe =
    vorgabeVolumen > 0 ? (VOLUMES.find((x) => x.v >= vorgabeVolumen)?.v ?? 6) : null

  const katalog = useApi<FesCategories>('/api/fes/categories')

  const [adresse, setAdresse] = useState('')
  const [stadtteil, setStadtteil] = useState(me?.district.id ?? 'bockenheim')
  const [kategorie, setKategorie] = useState<string | null>(null)
  const [volumen, setVolumen] = useState(vorgabeStufe ?? 1)
  const [termin, setTermin] = useState<string | null>(null)
  const [bucht, setBucht] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gebucht, setGebucht] = useState<FesBooking | null>(null)

  /* The prefill only wins until the person touches a chip themselves. The
     scan vocabulary is translated by the server, which ships each category
     with the scan ids that map onto it — so "elektro" from phase 4 lands on
     Elektro-Großgeräte without this screen knowing the table. */
  const gewaehlt = kategorie ?? vorgabeKategorie
  const kat =
    katalog.data?.categories.find((c) => c.id === gewaehlt) ??
    katalog.data?.categories.find((c) => gewaehlt !== null && c.aliases?.includes(gewaehlt)) ??
    null

  const abholbar = kat?.collectable === true
  const termine = useApi<FesSlots>(
    abholbar ? `/api/fes/slots?districtId=${stadtteil}&volume=${volumen}` : null,
  )

  // The volume is the scan’s estimate until the person picks a chip.
  const volumenGeschaetzt = vorgabeVolumen > 0 && volumen === vorgabeStufe
  const adresseOk = adresse.trim().length >= 5
  const fertig = adresseOk && abholbar && termin !== null

  async function buchen() {
    if (!fertig || bucht) return
    setBucht(true)
    setFehler(null)
    try {
      const antwort = await api.post<FesBooking>('/api/fes/pickups', {
        address: adresse.trim(),
        districtId: stadtteil,
        category: kat?.id,
        volumeM3: volumen,
        slotDate: termin,
      })
      setGebucht(antwort)
      await refresh()
    } catch (err) {
      setFehler(err instanceof ApiError ? err.message : de.state.error)
      termine.reload()
    } finally {
      setBucht(false)
    }
  }

  if (gebucht) return <Bestaetigung buchung={gebucht} />

  return (
    <Screen
      back
      title="Sperrmüll anmelden"
      sub="Adresse, Gegenstand, Termin"
      footer={
        <button className="btn primary" disabled={!fertig || bucht} onClick={() => void buchen()}>
          {bucht ? <span className="spinner" /> : <Icon name="truck" size={19} />}
          {termin ? 'Verbindlich anmelden' : 'Termin wählen'}
        </button>
      }
    >
      {/* 1 — the one thing the app cannot know */}
      <div className="card">
        <div className="between" style={{ marginBottom: 9 }}>
          <p className="lbl">1 · Wo steht es</p>
          <Tag von="input" />
        </div>
        <input
          className="field"
          placeholder="Straße und Hausnummer"
          value={adresse}
          autoComplete="street-address"
          onChange={(e) => setAdresse(e.target.value)}
        />
        <select
          className="field"
          style={{ marginTop: 9 }}
          value={stadtteil}
          onChange={(e) => {
            setStadtteil(e.target.value)
            setTermin(null)
          }}
        >
          {STADTTEILE.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.5 }}>
          FES plant nach Adresse, ReMain nach Stadtteil — der Termin unten ist deshalb eine
          Näherung für {STADTTEILE.find((s) => s.id === stadtteil)?.name}.
        </p>
      </div>

      {/* 2 — what it is. The categories FES does not collect stay visible
          and explain themselves rather than disappearing from the list. */}
      <div className="card">
        <div className="between" style={{ marginBottom: 9 }}>
          <p className="lbl">2 · Was ist es</p>
          {vorgabeKategorie && kategorie === null ? <Tag von="estimate" icon>aus dem Foto</Tag> : null}
        </div>

        {katalog.loading && (
          <div className="empty" style={{ padding: 18 }}>
            <span className="spinner" />
          </div>
        )}

        <div className="chips">
          {katalog.data?.categories.map((c) => (
            <button
              key={c.id}
              className="chip"
              aria-pressed={kat?.id === c.id}
              onClick={() => {
                setKategorie(c.id)
                setTermin(null)
              }}
            >
              {!c.collectable && <Icon name="info" size={13} stroke={2.2} />}
              {c.name}
            </button>
          ))}
        </div>

        {kat && <p className="xs mut" style={{ margin: '10px 0 0' }}>{kat.examples}</p>}

        {kat && !kat.collectable && kat.alternative && (
          <div className="card sky tight" style={{ marginTop: 11 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Icon name="info" size={17} style={{ color: 'var(--blue-deep)' }} />
              <b className="sm">Das holt FES nicht am Straßenrand ab</b>
            </div>
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {kat.alternative.why} Richtiger Weg: <b style={{ color: 'var(--ink)' }}>{kat.alternative.what}</b>.
            </p>
            <button
              className="btn sm"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/wissen?category=${kat.id}`)}
            >
              <Icon name="info" size={16} />
              Wohin damit?
            </button>
          </div>
        )}

        {kat?.note && kat.collectable && (
          <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.5 }}>{kat.note}</p>
        )}
      </div>

      {/* 3 — how much */}
      {abholbar && (
        <div className="card">
          <div className="between" style={{ marginBottom: 9 }}>
            <p className="lbl">3 · Wie viel</p>
            <Tag von={volumenGeschaetzt ? 'estimate' : 'input'} />
          </div>
          <div className="chips">
            {VOLUMES.map((x) => (
              <button
                key={x.v}
                className="chip"
                aria-pressed={volumen === x.v}
                onClick={() => {
                  setVolumen(x.v)
                  setTermin(null)
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
          <p className="xs mut" style={{ margin: '9px 0 0' }}>
            {VOLUMES.find((x) => x.v === volumen)?.hint} · höchstens{' '}
            {katalog.data?.maxVolumeM3 ?? 6} m³ pro Anmeldung
          </p>
        </div>
      )}

      {/* 4 — the dates */}
      {abholbar && (
        <div className="card">
          <div className="between" style={{ marginBottom: 9 }}>
            <p className="lbl">4 · Wann</p>
            <Tag von="simulated" icon />
          </div>

          {termine.loading && (
            <div className="empty" style={{ padding: 18 }}>
              <span className="spinner" />
            </div>
          )}

          {termine.data?.blocked && (
            <p className="sm" style={{ margin: 0 }}>
              <Label tone="warn">zu viel</Label>{' '}
              <span className="mut">{termine.data.blocked.message}</span>
            </p>
          )}

          <div className="col" style={{ gap: 7 }}>
            {termine.data?.slots.map((s) => (
              <button
                key={s.date}
                className="card tight flat row"
                disabled={!s.available}
                onClick={() => setTermin(s.date)}
                style={{
                  gap: 11,
                  opacity: s.available ? 1 : 0.5,
                  borderColor: termin === s.date ? 'var(--blue-deep)' : undefined,
                  background: termin === s.date ? 'var(--sky2)' : undefined,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: termin === s.date ? 'var(--blue-deep)' : 'var(--sky)',
                    color: termin === s.date ? 'var(--on-blue)' : 'var(--blue-deep)',
                  }}
                >
                  {termin === s.date ? (
                    <Icon name="check" size={17} stroke={2.6} />
                  ) : (
                    <Icon name="calendar" size={17} />
                  )}
                </span>
                <span className="grow">
                  <b className="sm" style={{ display: 'block' }}>{s.label}</b>
                  <span className="xs mut">
                    {s.available ? `${s.window} · ${s.vehicle}` : s.reason}
                  </span>
                </span>
                {s.available && s.pressure === 'knapp' && <Label tone="warn">knapp</Label>}
              </button>
            ))}
          </div>

          {termine.data && (
            <details style={{ marginTop: 11 }}>
              <summary className="xs mut" style={{ cursor: 'pointer' }}>
                Woher kommen diese Termine?
              </summary>
              <ul className="xs mut" style={{ margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
                {termine.data.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {fehler && (
        <p className="sm" style={{ margin: 0 }}>
          <Label tone="warn">{de.state.error}</Label> <span className="mut">{fehler}</span>
        </p>
      )}

      <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
        Die Anmeldung entsteht in ReMain, nicht bei FES — die Schnittstelle dafür gibt es noch
        nicht. Bis dahin steht an jedem Termin „simuliert".
      </p>
    </Screen>
  )
}

/* ------------------------------------------------------------------
   After the booking: the number, the three sentences that matter on the
   evening before, and the honest label.
   ------------------------------------------------------------------ */

function Bestaetigung({ buchung }: { buchung: FesBooking }) {
  const navigate = useNavigate()
  const p = buchung.pickup

  return (
    <Screen
      back
      title="Angemeldet"
      sub={p.reference}
      footer={
        <button className="btn primary" onClick={() => navigate('/kalender')}>
          <Icon name="calendar" size={19} />
          Im Abfuhrkalender ansehen
        </button>
      }
    >
      <div className="card">
        <div className="between" style={{ marginBottom: 11 }}>
          <span className="row" style={{ gap: 8 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                background: 'var(--sky)',
                color: 'var(--blue-deep)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
              }}
            >
              <Icon name="check" size={19} stroke={2.6} />
            </span>
            <span className="h2">{p.label}</span>
          </span>
          <Tag von="simulated" icon>eingetragen</Tag>
        </div>

        <div className="sm mut" style={{ lineHeight: 1.6 }}>
          {p.categoryName} · {String(p.volumeM3).replace('.', ',')} m³ · {buchung.window}
          <br />
          {p.address}, {buchung.district}
        </div>

        <div className="sep" style={{ margin: '13px 0' }} />

        <div className="between">
          <span className="sm mut">Referenznummer</span>
          <b className="num" style={{ fontSize: 16 }}>{p.reference}</b>
        </div>
      </div>

      {buchung.award && (
        <button
          className="card tight row"
          onClick={() => navigate(`/nachweis/${buchung.award?.actionId}`)}
          style={{ gap: 11 }}
        >
          <Coin star>+{buchung.award.xp} XP</Coin>
          <span className="grow xs mut">
            gutgeschrieben als <b style={{ color: 'var(--ink)' }}>simuliert</b> — im Nachweis steht,
            warum
          </span>
          <Icon name="chevron" size={19} className="ico" />
        </button>
      )}

      {buchung.awardNote && (
        <p className="xs mut" style={{ margin: 0 }}>
          <Label>keine Gutschrift</Label> {buchung.awardNote}
        </p>
      )}

      <div className="card">
        <p className="lbl" style={{ marginBottom: 9 }}>Am Abend vorher</p>
        <div className="col" style={{ gap: 9 }}>
          {buchung.instructions.map((satz, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
              <span style={{ marginTop: 2 }}>
                <Icon name="check" size={15} className="ico" stroke={2.4} />
              </span>
              <span className="sm">{satz}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card sky tight row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <Icon name="info" size={18} style={{ color: 'var(--blue-deep)', marginTop: 1 }} />
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
          {buchung.note}
        </p>
      </div>
    </Screen>
  )
}
