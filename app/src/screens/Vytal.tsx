import { t, getLocale } from './../lib/i18n'
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
  value.toLocaleString(getLocale(), { maximumFractionDigits: digits })

const datum = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: '2-digit' })
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
    <Screen back title={t("Mehrweg")} sub={t("Behälter ausleihen und zurückgeben")}>
      {/* Who we are in this transaction. The one thing that is easy to get
          wrong about this integration, so it is the first thing said. */}
      {t(status.data?.store && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--stone)' }}>
          <Icon name="info" size={18} className="ico" />
          <p className="xs mut grow" style={{ margin: 0 }}>
            {t("ReMain ist selbst eine ")}<b>{t("Vytal-Station")}</b>{t(". Ausgabe und Rücknahme laufen über")}{t(' ')}
            {t(status.data.store.name)} {t(" — nicht über fremde Vytal-Partner.")}</p>
          <Tag von="api" icon />
        </div>
      ))}

      {t(nichtEingerichtet && (
        <div className="card tight row" style={{ gap: 9, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            {t("Auf dem Server fehlt der Vytal-Store-Token. Mehrweg ist noch nicht nutzbar.")}</span>
        </div>
      ))}

      {t(problem && (
        <div className="card tight row" style={{ gap: 9, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">{t(problem.message)}</span>
          <button className="icobtn bare" onClick={() => setProblem(null)} aria-label={t("Schließen")}>
            <Icon name="cross" size={18} />
          </button>
        </div>
      ))}

      {t(erfolg && <Quittung answer={erfolg} onClose={() => setErfolg(null)} />)}

      {/* The camera. */}
      {t(modus && (
        <Kamera
          modus={modus}
          scanner={scanner}
          busy={busy}
          manuell={manuell}
          setManuell={setManuell}
          onManuell={() => void aufnehmen(manuell.trim())}
          onClose={() => setModus(null)}
        />
      ))}

      {/* The confirm sheet — what Vytal says is in your hand. */}
      {t(scan && (
        <Bestaetigen
          scan={scan}
          busy={busy}
          onConfirm={() => void bestaetigen()}
          onCancel={() => setScan(null)}
        />
      ))}

      {t(state.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      ))}

      {/* What you are holding. */}
      {t(state.data?.active.map((c) => {
        const rest = frist(c.hoursLeft)
        return (
          <div key={c.containerId} className="card">
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              {t(c.imageUrl && (
                <img
                  src={c.imageUrl}
                  alt={t("")}
                  width={52}
                  height={52}
                  style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              ))}
              <div className="grow">
                <div className="between">
                  <b className="h3">{t(c.typeName ?? 'Mehrwegbehälter')}</b>
                  {t(rest && <Label tone={rest.warn ? 'warn' : 'plain'}>{t(rest.text)}</Label>)}
                </div>
                <p className="xs mut" style={{ margin: '4px 0 0' }}>
                  {t(c.name ?? c.containerId.slice(0, 8))}
                  {t(c.sizeHelper ? ` · ${c.sizeHelper}` : '')} {t(" · zurück bis")}{t(' ')}
                  {t(datum(c.returnDeadline))}
                </p>
                {t(c.checkoutStoreName && (
                  <p className="xs mut" style={{ margin: '2px 0 0' }}>
                    {t("Ausgegeben von ")}{t(c.checkoutStoreName)}
                  </p>
                ))}
                {t(c.restrictedCheckinInfo && (
                  <p className="xs mut" style={{ margin: '2px 0 0' }}>
                    {t(c.restrictedCheckinInfo)}
                  </p>
                ))}
              </div>
            </div>

            <button
              className="btn primary"
              style={{ marginTop: 12 }}
              disabled={busy || nichtEingerichtet === true}
              onClick={() => setModus('return')}
            >
              <Icon name="scan" size={19} />
              {t("Zurückgeben — Code scannen")}</button>
          </div>
        )
      }))}

      {/* Nothing out. */}
      {t(!state.loading && state.data?.active.length === 0 && (
        <div className="card">
          <b className="h3">{t("Gerade kein Behälter unterwegs")}</b>
          <p className="sm mut" style={{ margin: '6px 0 12px' }}>
            {t("Scanne einen Behälter an unserer Station, um ihn mitzunehmen. ")}{t(state.data.loanDays)}{t(' ')}
            {t("Tage Zeit, kein Pfand.")}</p>
          <button
            className="btn"
            disabled={busy || nichtEingerichtet === true}
            onClick={() => setModus('checkout')}
          >
            <Icon name="scan" size={19} />
            {t("Behälter mitnehmen")}</button>
        </div>
      ))}

      {/* Vytal's own CO2 figure — the one number here that needs no assumption. */}
      {t(impact.data && impact.data.containerCount > 0 && (
        <div className="card tight">
          <div className="between">
            <span className="lbl">{t("Von Vytal bestätigt")}</span>
            <Tag von="api" icon>
              {t("Vytal")}</Tag>
          </div>
          <div className="row" style={{ gap: 14, marginTop: 8, alignItems: 'baseline' }}>
            <b className="h2">{t(de(impact.data.co2SavedKg, 2))} {t(" kg")}</b>
            <span className="sm mut">
              {t("CO₂e gespart · ")}{t(impact.data.containerCount)}{t(' ')}
              {t(impact.data.containerCount === 1 ? 'Behälter' : 'Behälter')}
            </span>
          </div>
          <p className="xs mut" style={{ margin: '8px 0 0' }}>
            {t(impact.data.scope)}
          </p>
        </div>
      ))}

      {/* Charged for. Never hidden — otherwise people learn it from the bank. */}
      {t(state.data && state.data.sold.length > 0 && (
        <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="lbl">{t("Nicht zurückgekommen")}</span>
            <Label tone="warn">{t(state.data.sold.length)}</Label>
          </div>
          {t(state.data.sold.map((c) => (
            <div key={c.containerId} className="between sm" style={{ padding: '4px 0' }}>
              <span>{t(c.typeName ?? c.name ?? c.containerId.slice(0, 8))}</span>
              <span className="mut">
                {t(c.overduePrice > 0 ? `${de(c.overduePrice, 2)} €` : 'abgerechnet')}
              </span>
            </div>
          )))}
          <p className="xs mut" style={{ margin: '8px 0 0' }}>
            {t("Nach ")}{t(state.data.loanDays)} {t(" Tagen berechnet Vytal eine Ausgleichsgebühr. Diese Behälter sind damit gekauft.")}</p>
        </div>
      ))}

      {/* History. */}
      {t(state.data && state.data.returned.length > 0 && (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 9 }}>
            <span className="lbl">{t("Zurückgegeben")}</span>
            <span className="xs mut">{t(state.data.counts.returned)}</span>
          </div>
          {t(state.data.returned.slice(0, 8).map((c) => (
            <div key={`${c.containerId}-${c.checkoutTime}`} className="between sm" style={{ padding: '5px 0' }}>
              <span className="grow">
                {t(c.typeName ?? c.name ?? c.containerId.slice(0, 8))}
                <span className="mut"> {t(" · ")}{t(datum(c.returnTime))}</span>
              </span>
              {t(c.actionId ? (
                <Link to={`/nachweis/${c.actionId}`} className="row" style={{ gap: 6 }}>
                  <Coin star>{t(c.xp)}</Coin>
                  <Icon name="chevron" size={14} />
                </Link>
              ) : (
                <span className="xs mut">{t("nicht über ReMain")}</span>
              ))}
            </div>
          )))}
        </div>
      ))}
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
          {t(modus === 'return' ? 'Behälter zurückgeben' : 'Behälter mitnehmen')}
        </b>
        <button className="icobtn bare" onClick={onClose} aria-label={t("Abbrechen")}>
          <Icon name="cross" size={18} />
        </button>
      </div>

      {t(!kaputt && (
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

          {t((scanner.state === 'startet' || busy) && (
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
          ))}

          {t(scanner.hatLampe && (
            <button
              className="icobtn"
              onClick={() => void scanner.toggleLampe()}
              aria-label={t("Licht")}
              aria-pressed={scanner.lampe}
              style={{ position: 'absolute', right: 10, bottom: 10 }}
            >
              <Icon name="spark" size={18} />
            </button>
          ))}
        </div>
      ))}

      <p className="xs mut" style={{ margin: '9px 0 0' }}>
        {t(kaputt
          ? scanner.state === 'unsicher'
            ? 'Die Kamera braucht eine sichere Verbindung (https).'
            : scanner.state === 'blockiert'
              ? 'Die Kamera ist blockiert. Du kannst den Code auch eintippen.'
              : 'Keine Kamera gefunden. Du kannst den Code eintippen.'
          : 'Den QR-Code auf dem Behälter ins Feld halten.')}
      </p>

      {/* Always available, not just as a fallback: a scratched code is a
          thing that happens, and the short id is printed next to it. */}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          className="grow"
          value={manuell}
          onChange={(e) => setManuell(e.target.value)}
          placeholder={t("Code eintippen, z. B. ABC123")}
          aria-label={t("Behälter-Code")}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button className="btn" disabled={busy || manuell.trim() === ''} onClick={onManuell}>
          {t("Prüfen")}</button>
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
        {t(c.imageUrl && (
          <img
            src={c.imageUrl}
            alt={t("")}
            width={56}
            height={56}
            style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
          />
        ))}
        <div className="grow">
          <div className="between">
            <b className="h3">{t(c.typeName ?? 'Mehrwegbehälter')}</b>
            <Tag von="api" icon>
              {t("Vytal")}</Tag>
          </div>
          <p className="xs mut" style={{ margin: '4px 0 0' }}>
            {t(c.name ?? c.shortId ?? '')}
            {t(c.sizeHelper ? ` · ${c.sizeHelper}` : '')}
          </p>
        </div>
      </div>

      {/* A container that was already paid for this cycle. Said before the
          tap, not after — the return still needs to happen, the reward does not. */}
      {t(scan.alreadyCredited && (
        <p className="xs mut" style={{ margin: '10px 0 0' }}>
          {t("Für diese Ausleihe gab es schon ")}{t(scan.alreadyCredited.xp)} {t(" XP. Die Rückgabe wird trotzdem gebucht, eine zweite Belohnung nicht.")}</p>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn primary grow" disabled={busy} onClick={onConfirm}>
          {t(busy ? <span className="spinner" /> : <Icon name="check" size={19} />)}
          {t(rueckgabe ? 'Zurückgeben' : 'Mitnehmen')}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          {t("Abbrechen")}</button>
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
          <b className="h3">{t(answer.message)}</b>
        </div>
        <button className="icobtn bare" onClick={onClose} aria-label={t("Schließen")}>
          <Icon name="cross" size={18} />
        </button>
      </div>

      {t(award && (
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <Coin star>{t(award.xp)}</Coin>
          {t(award.coins > 0 && <Coin>{t(award.coins)}</Coin>)}
          <Link to={`/nachweis/${award.actionId}`} className="sm grow" style={{ textAlign: 'right' }}>
            {t("Nachweis ansehen ")}<Icon name="chevron" size={13} />
          </Link>
        </div>
      ))}

      {t(retour && !credited && answer.alreadyPaid && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          {t("Gutgeschrieben wurde sie bereits —")}{t(' ')}
          <Link to={`/nachweis/${answer.alreadyPaid.actionId}`}>{t("zum Nachweis")}</Link>{t(".")}</p>
      ))}

      {t(retour && answer.blocked && answer.hint && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          {t(answer.hint)}
        </p>
      ))}

      {t(answer.result.showCheckoutLimitWarning && (
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          {t("Du bist nah am Ausleih-Limit")}{t(answer.result.remainingCheckouts !== null
            ? ` — noch ${answer.result.remainingCheckouts} möglich.`
            : '.')}
        </p>
      ))}
    </div>
  )
}
