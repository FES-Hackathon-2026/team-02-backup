import { useSession } from '../lib/session'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag } from '../components/ui'
import {
  ApiError,
  api,
  useApi,
  type VytalCheckoutResult,
  type VytalImpact,
  type VytalReturnResult,
  type VytalScanResult,
  type VytalState,
  type VytalStatus,
} from '../lib/client'
import { useQrScanner } from '../lib/useQrScanner'

/**
 * Mehrweg — the live Vytal integration.
 *
 * Two things on this screen are worth doing deliberately.
 *
 * **We are the station.** Vytal issues one token per store, and a return
 * books into whichever store presented it. So a container handed back through
 * ReMain comes back to *us*, not to the café it came from. The screen says
 * that in plain words instead of showing a list of partners it cannot book.
 *
 * **The camera does not decide anything.** It reads a string off a QR code
 * and posts it, untouched, to our server, which asks Vytal what it is. Vytal
 * has old code formats in circulation and their documentation is explicit
 * that parsing belongs in the backend — a clever regex here would fail on
 * precisely the oldest bowls.
 */

type Modus = 'checkout' | 'return'

const de = (value: number, digits = 1) =>
  value.toLocaleString('de-DE', { maximumFractionDigits: digits })

const datum = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

/** How long is left, said the way a person would say it. */
function frist(hoursLeft: number | null) {
  if (hoursLeft === null) return null
  if (hoursLeft < 0) {
    const tage = Math.ceil(-hoursLeft / 24)
    return { text: tage <= 1 ? 'überfällig' : `${tage} Tage überfällig`, warn: true }
  }
  if (hoursLeft < 24) return { text: `noch ${hoursLeft} h`, warn: true }
  const tage = Math.floor(hoursLeft / 24)
  return { text: `noch ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`, warn: tage <= 2 }
}

export default function Vytal() {
  const { refresh } = useSession()
  const status = useApi<VytalStatus>('/api/vytal/status')
  const state = useApi<VytalState>('/api/vytal/containers')
  const impact = useApi<VytalImpact>('/api/vytal/impact')

  const [modus, setModus] = useState<Modus | null>(null)
  const [scan, setScan] = useState<VytalScanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [erfolg, setErfolg] = useState<VytalReturnResult | VytalCheckoutResult | null>(null)
  const [manuell, setManuell] = useState('')

  /* One scan at a time. The decode loop fires every 180 ms and would happily
     post the same bowl a dozen times while the first request is in flight. */
  const inFlight = useRef(false)

  const aufnehmen = useCallback(
    async (code: string) => {
      if (inFlight.current || !modus) return
      inFlight.current = true
      setBusy(true)
      setProblem(null)
      try {
        const answer = await api.post<VytalScanResult>('/api/vytal/scan', { code, intent: modus })
        setScan(answer)
        setModus(null) // stop the camera; the confirm sheet takes over
      } catch (error) {
        if (error instanceof ApiError) setProblem(error)
      } finally {
        setBusy(false)
        inFlight.current = false
      }
    },
    [modus],
  )

  const scanner = useQrScanner(modus !== null, aufnehmen)

  async function bestaetigen() {
    if (!scan) return
    setBusy(true)
    setProblem(null)
    try {
      const path = scan.intent === 'return' ? '/api/vytal/returns' : '/api/vytal/checkout'
      const answer = await api.post<VytalReturnResult | VytalCheckoutResult>(path, {
        transactionId: scan.transactionId,
      })
      setErfolg(answer)
      setScan(null)
      state.reload()
      impact.reload()
      status.reload()
      await refresh()
    } catch (error) {
      if (error instanceof ApiError) setProblem(error)
      setScan(null)
    } finally {
      setBusy(false)
    }
  }

  const nichtEingerichtet = status.data && !status.data.configured

  return (
    <Screen back title="Mehrweg" sub="Vytal · echte Schnittstelle">
      {/* Who we are in this transaction. The one thing that is easy to get
          wrong about this integration, so it is the first thing said. */}
      {status.data?.store && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--stone)' }}>
          <Icon name="info" size={18} className="ico" />
          <p className="xs mut grow" style={{ margin: 0 }}>
            ReMain ist selbst eine <b>Vytal-Station</b>. Ausgabe und Rücknahme laufen über{' '}
            {status.data.store.name} — nicht über fremde Vytal-Partner.
          </p>
          <Tag von="api" icon />
        </div>
      )}

      {nichtEingerichtet && (
        <div className="card tight row" style={{ gap: 9, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            Auf dem Server fehlt der Vytal-Store-Token. Mehrweg ist noch nicht nutzbar.
          </span>
        </div>
      )}

      {/* The LOAD failing is not the same as a write failing, and it had
          nowhere to appear: `problem` is only ever set by the scan and
          confirm paths, and `nichtEingerichtet` stays false when the token
          exists but is refused. So a 502 from /containers rendered the
          station banner and then an empty screen — the one outcome this
          product is not allowed to have. */}
      {state.error && (
        <div className="card tight col" style={{ gap: 8, borderColor: 'var(--alert)' }}>
          <div className="row" style={{ gap: 9 }}>
            <Icon name="info" size={18} className="ico" />
            <b className="sm grow">Mehrweg ist gerade nicht nutzbar</b>
          </div>
          <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
            {state.error.message}
          </p>
          <button className="btn sm" onClick={() => state.reload()}>
            Nochmal versuchen
          </button>
        </div>
      )}

      {problem && (
        <div className="card tight row" style={{ gap: 9, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">{problem.message}</span>
          <button className="icobtn bare" onClick={() => setProblem(null)} aria-label="Schließen">
            <Icon name="cross" size={18} />
          </button>
        </div>
      )}

      {erfolg && <Quittung answer={erfolg} onClose={() => setErfolg(null)} />}

      {/* The camera. */}
      {modus && (
        <Kamera
          modus={modus}
          scanner={scanner}
          busy={busy}
          manuell={manuell}
          setManuell={setManuell}
          onManuell={() => void aufnehmen(manuell.trim())}
          onClose={() => setModus(null)}
        />
      )}

      {/* The confirm sheet — what Vytal says is in your hand. */}
      {scan && (
        <Bestaetigen
          scan={scan}
          busy={busy}
          onConfirm={() => void bestaetigen()}
          onCancel={() => setScan(null)}
        />
      )}

      {state.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}

      {/* What you are holding. */}
      {state.data?.active.map((c) => {
        const rest = frist(c.hoursLeft)
        return (
          <div key={c.containerId} className="card">
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              {c.imageUrl && (
                <img
                  src={c.imageUrl}
                  alt=""
                  width={52}
                  height={52}
                  style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div className="grow">
                <div className="between">
                  <b className="h3">{c.typeName ?? 'Mehrwegbehälter'}</b>
                  {rest && <Label tone={rest.warn ? 'warn' : 'plain'}>{rest.text}</Label>}
                </div>
                <p className="xs mut" style={{ margin: '4px 0 0' }}>
                  {c.name ?? c.containerId.slice(0, 8)}
                  {c.sizeHelper ? ` · ${c.sizeHelper}` : ''} · zurück bis{' '}
                  {datum(c.returnDeadline)}
                </p>
                {c.checkoutStoreName && (
                  <p className="xs mut" style={{ margin: '2px 0 0' }}>
                    Ausgegeben von {c.checkoutStoreName}
                  </p>
                )}
                {c.restrictedCheckinInfo && (
                  <p className="xs mut" style={{ margin: '2px 0 0' }}>
                    {c.restrictedCheckinInfo}
                  </p>
                )}
              </div>
            </div>

            <button
              className="btn primary"
              style={{ marginTop: 12 }}
              disabled={busy || nichtEingerichtet === true}
              onClick={() => setModus('return')}
            >
              <Icon name="scan" size={19} />
              Zurückgeben — Code scannen
            </button>
          </div>
        )
      })}

      {/* Nothing out. */}
      {!state.loading && state.data?.active.length === 0 && (
        <div className="card">
          <b className="h3">Gerade kein Behälter unterwegs</b>
          <p className="sm mut" style={{ margin: '6px 0 12px' }}>
            Scanne einen Behälter an unserer Station, um ihn mitzunehmen. {state.data.loanDays}{' '}
            Tage Zeit, kein Pfand.
          </p>
          <button
            className="btn"
            disabled={busy || nichtEingerichtet === true}
            onClick={() => setModus('checkout')}
          >
            <Icon name="scan" size={19} />
            Behälter mitnehmen
          </button>
        </div>
      )}

      {/* Vytal's own CO2 figure — the one number here that needs no assumption. */}
      {impact.data && impact.data.containerCount > 0 && (
        <div className="card tight">
          <div className="between">
            <span className="lbl">Von Vytal bestätigt</span>
            <Tag von="api" icon>
              Vytal
            </Tag>
          </div>
          <div className="row" style={{ gap: 14, marginTop: 8, alignItems: 'baseline' }}>
            <b className="h2">{de(impact.data.co2SavedKg, 2)} kg</b>
            <span className="sm mut">
              CO₂e gespart · {impact.data.containerCount}{' '}
              {impact.data.containerCount === 1 ? 'Behälter' : 'Behälter'}
            </span>
          </div>
          <p className="xs mut" style={{ margin: '8px 0 0' }}>
            {impact.data.scope}
          </p>
        </div>
      )}

      {/* Charged for. Never hidden — otherwise people learn it from the bank. */}
      {state.data && state.data.sold.length > 0 && (
        <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="lbl">Nicht zurückgekommen</span>
            <Label tone="warn">{state.data.sold.length}</Label>
          </div>
          {state.data.sold.map((c) => (
            <div key={c.containerId} className="between sm" style={{ padding: '4px 0' }}>
              <span>{c.typeName ?? c.name ?? c.containerId.slice(0, 8)}</span>
              <span className="mut">
                {c.overduePrice > 0 ? `${de(c.overduePrice, 2)} €` : 'abgerechnet'}
              </span>
            </div>
          ))}
          <p className="xs mut" style={{ margin: '8px 0 0' }}>
            Nach {state.data.loanDays} Tagen berechnet Vytal eine Ausgleichsgebühr. Diese
            Behälter sind damit gekauft.
          </p>
        </div>
      )}

      {/* History. */}
      {state.data && state.data.returned.length > 0 && (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 9 }}>
            <span className="lbl">Zurückgegeben</span>
            <span className="xs mut">{state.data.counts.returned}</span>
          </div>
          {state.data.returned.slice(0, 8).map((c) => (
            <div key={`${c.containerId}-${c.checkoutTime}`} className="between sm" style={{ padding: '5px 0' }}>
              <span className="grow">
                {c.typeName ?? c.name ?? c.containerId.slice(0, 8)}
                <span className="mut"> · {datum(c.returnTime)}</span>
              </span>
              {c.actionId ? (
                <Link to={`/nachweis/${c.actionId}`} className="row" style={{ gap: 6 }}>
                  <Coin star>{c.xp}</Coin>
                  <Icon name="chevron" size={14} />
                </Link>
              ) : (
                <span className="xs mut">nicht über ReMain</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------
   The camera
   ------------------------------------------------------------------ */

function Kamera({
  modus,
  scanner,
  busy,
  manuell,
  setManuell,
  onManuell,
  onClose,
}: {
  modus: Modus
  scanner: ReturnType<typeof useQrScanner>
  busy: boolean
  manuell: string
  setManuell: (v: string) => void
  onManuell: () => void
  onClose: () => void
}) {
  const kaputt = scanner.state === 'fehlt' || scanner.state === 'unsicher' || scanner.state === 'blockiert'

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 10 }}>
        <b className="h3">
          {modus === 'return' ? 'Behälter zurückgeben' : 'Behälter mitnehmen'}
        </b>
        <button className="icobtn bare" onClick={onClose} aria-label="Abbrechen">
          <Icon name="cross" size={18} />
        </button>
      </div>

      {!kaputt && (
        <div
          style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--ink)',
            aspectRatio: '4 / 3',
          }}
        >
          <video
            ref={scanner.videoRef}
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <canvas ref={scanner.canvasRef} style={{ display: 'none' }} />

          {/* The target. Purely to tell someone where to point. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '18%',
              border: '2px solid rgba(255,255,255,.85)',
              borderRadius: 12,
            }}
          />

          {(scanner.state === 'startet' || busy) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(0,0,0,.35)',
              }}
            >
              <span className="spinner" />
            </div>
          )}

          {scanner.hatLampe && (
            <button
              className="icobtn"
              onClick={() => void scanner.toggleLampe()}
              aria-label="Licht"
              aria-pressed={scanner.lampe}
              style={{ position: 'absolute', right: 10, bottom: 10 }}
            >
              <Icon name="spark" size={18} />
            </button>
          )}
        </div>
      )}

      <p className="xs mut" style={{ margin: '9px 0 0' }}>
        {kaputt
          ? scanner.state === 'unsicher'
            ? 'Die Kamera braucht eine sichere Verbindung (https).'
            : scanner.state === 'blockiert'
              ? 'Die Kamera ist blockiert. Du kannst den Code auch eintippen.'
              : 'Keine Kamera gefunden. Du kannst den Code eintippen.'
          : 'Den QR-Code auf dem Behälter ins Feld halten.'}
      </p>

      {/* Always available, not just as a fallback: a scratched code is a
          thing that happens, and the short id is printed next to it. */}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          className="grow"
          value={manuell}
          onChange={(e) => setManuell(e.target.value)}
          placeholder="Code eintippen, z. B. ABC123"
          aria-label="Behälter-Code"
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button className="btn" disabled={busy || manuell.trim() === ''} onClick={onManuell}>
          Prüfen
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Confirm — what Vytal says is in your hand
   ------------------------------------------------------------------ */

function Bestaetigen({
  scan,
  busy,
  onConfirm,
  onCancel,
}: {
  scan: VytalScanResult
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const c = scan.container
  const rueckgabe = scan.intent === 'return'

  return (
    <div className="card" style={{ borderColor: 'var(--leaf)' }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        {c.imageUrl && (
          <img
            src={c.imageUrl}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
          />
        )}
        <div className="grow">
          <div className="between">
            <b className="h3">{c.typeName ?? 'Mehrwegbehälter'}</b>
            <Tag von="api" icon>
              Vytal
            </Tag>
          </div>
          <p className="xs mut" style={{ margin: '4px 0 0' }}>
            {c.name ?? c.shortId ?? ''}
            {c.sizeHelper ? ` · ${c.sizeHelper}` : ''}
          </p>
        </div>
      </div>

      {/* A container that was already paid for this cycle. Said before the
          tap, not after — the return still needs to happen, the reward does not. */}
      {scan.alreadyCredited && (
        <p className="xs mut" style={{ margin: '10px 0 0' }}>
          Für diese Ausleihe gab es schon {scan.alreadyCredited.xp} XP. Die Rückgabe
          wird trotzdem gebucht, eine zweite Belohnung nicht.
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn primary grow" disabled={busy} onClick={onConfirm}>
          {busy ? <span className="spinner" /> : <Icon name="check" size={19} />}
          {rueckgabe ? 'Zurückgeben' : 'Mitnehmen'}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Receipt
   ------------------------------------------------------------------ */

function Quittung({
  answer,
  onClose,
}: {
  answer: VytalReturnResult | VytalCheckoutResult
  onClose: () => void
}) {
  const retour = 'credited' in answer
  const credited = retour && answer.credited
  const award = retour ? answer.award : undefined

  return (
    <div className="card" style={{ borderColor: credited ? 'var(--leaf)' : 'var(--stone)' }}>
      <div className="between">
        <div className="row" style={{ gap: 9 }}>
          <Icon name="check" size={19} className="ico" />
          <b className="h3">{answer.message}</b>
        </div>
        <button className="icobtn bare" onClick={onClose} aria-label="Schließen">
          <Icon name="cross" size={18} />
        </button>
      </div>

      {award && (
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <Coin star>{award.xp}</Coin>
          {award.coins > 0 && <Coin>{award.coins}</Coin>}
          <Link to={`/nachweis/${award.actionId}`} className="sm grow" style={{ textAlign: 'right' }}>
            Nachweis ansehen <Icon name="chevron" size={13} />
          </Link>
        </div>
      )}

      {retour && !credited && answer.alreadyPaid && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          Gutgeschrieben wurde sie bereits —{' '}
          <Link to={`/nachweis/${answer.alreadyPaid.actionId}`}>zum Nachweis</Link>.
        </p>
      )}

      {retour && answer.blocked && answer.hint && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          {answer.hint}
        </p>
      )}

      {answer.result.showCheckoutLimitWarning && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          Du bist nah am Ausleih-Limit
          {answer.result.remainingCheckouts !== null
            ? ` — noch ${answer.result.remainingCheckouts} möglich.`
            : '.'}
        </p>
      )}
    </div>
  )
}
