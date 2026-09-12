import { useState } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag, Thumb } from '../components/ui'
import {
  ApiError,
  api,
  useApi,
  type VytalContainer,
  type VytalReturnResult,
  type VytalState,
} from '../lib/client'

/**
 * Mehrweg — the return, and the proof that a return counts once.
 *
 * Vytal's sandbox never reached us, so everything on this screen comes from
 * our own stand-in and says so at every value: `simuliert`, never `bestätigt`.
 * What is real is the shape — `event_id`, `container_id`, `partner_id`,
 * `status` — and one guarantee built on it.
 *
 * That guarantee is the reason this screen exists at all. Scanning the same
 * container twice is a button, not a hypothetical: the second scan comes back
 * with the same `event_id`, the ledger recognises it, and the screen shows
 * which credit already holds it. A partner event is payable exactly once, and
 * here that is something a judge can try rather than something we assert.
 */

const uhr = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const tag = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })

function frist(hoursLeft: number) {
  if (hoursLeft < 0) return `seit ${Math.abs(Math.round(hoursLeft / 24))} Tagen überfällig`
  if (hoursLeft < 24) return `noch ${Math.round(hoursLeft)} Stunden`
  return `noch ${Math.round(hoursLeft / 24)} Tage`
}

export default function Vytal() {
  const state = useApi<VytalState>('/api/vytal/containers')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VytalReturnResult | null>(null)
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [ort, setOrt] = useState<string | null>(null)
  const [groesse, setGroesse] = useState('bowl_1000')

  const aktiv = state.data?.active[0] ?? null
  const partners = state.data?.partners ?? []
  const rueckgabeort = ort ?? partners[0]?.partner_id ?? null

  async function call<T>(path: string, body: unknown): Promise<T | null> {
    setBusy(true)
    setProblem(null)
    try {
      return await api.post<T>(path, body)
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'offline', 'Keine Verbindung zum Server.'),
      )
      return null
    } finally {
      setBusy(false)
    }
  }

  async function ausleihen(partnerId: string) {
    const answer = await call('/api/vytal/borrow', { partnerId, containerType: groesse })
    if (answer) {
      setResult(null)
      state.reload()
    }
  }

  /** The same call for the first scan and for every repeat — that is the point. */
  async function zurueckgeben(containerId: string) {
    if (!rueckgabeort) return
    const answer = await call<VytalReturnResult>('/api/vytal/returns', {
      containerId,
      partnerId: rueckgabeort,
    })
    if (answer) {
      setResult(answer)
      state.reload()
    }
  }

  return (
    <Screen back title="Mehrweg" sub="Vytal · nachgebauter Dienst">
      <div className="card tight row" style={{ gap: 10, borderColor: 'var(--stone)' }}>
        <Icon name="info" size={18} className="ico" />
        <p className="xs mut grow" style={{ margin: 0 }}>
          Ohne Sandbox-Zugang stammen diese Ereignisse aus unserem Nachbau. Die{' '}
          <b>Form</b> ist die echte — Behälter-ID, Partner-ID, Ereignis-ID —, deshalb ist
          der Umstieg später eine Adapterdatei.
        </p>
        <Tag von="simulated" icon />
      </div>

      {problem && (
        <div className="card tight row" style={{ gap: 9, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">{problem.message}</span>
          <button className="icobtn bare" onClick={() => setProblem(null)} aria-label="Schließen">
            <Icon name="cross" size={18} />
          </button>
        </div>
      )}

      {state.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}

      {/* What you are holding. */}
      {aktiv && <Aktiv container={aktiv} />}

      {aktiv && (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 9 }}>
            <span className="lbl">Rückgabeort</span>
            <span className="xs mut">{partners.length} in der Nähe</span>
          </div>
          <div className="chips scroll">
            {partners.map((p) => (
              <button
                key={p.partner_id}
                className="chip"
                aria-pressed={rueckgabeort === p.partner_id}
                onClick={() => setOrt(p.partner_id)}
              >
                {p.name.replace(' (Demo)', '')}
                {p.distanceKm !== null && (
                  <span className="mut">
                    {p.distanceKm < 1
                      ? `${Math.round(p.distanceKm * 1000)} m`
                      : `${p.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={busy || !rueckgabeort}
            onClick={() => void zurueckgeben(aktiv.container_id)}
          >
            {busy ? <span className="spinner" /> : <Icon name="scan" size={19} />}
            Code {aktiv.container_id} scannen
          </button>
          <p className="xs mut" style={{ margin: '8px 0 0' }}>
            Der Code steht auf dem Deckel. Den Scan simulieren wir hier — das Ereignis
            dahinter hat die Form, die auch die Kamera erzeugen würde.
          </p>
        </div>
      )}

      {/* Nothing borrowed: offer the loan, and be clear who normally triggers it. */}
      {!state.loading && !aktiv && (
        <div className="card">
          <b className="h3">Gerade kein Behälter unterwegs</b>
          <p className="sm mut" style={{ margin: '6px 0 12px' }}>
            Im Echtbetrieb bucht die Kasse des Partners die Ausleihe, wenn du dein Essen
            bekommst. Für die Demo löst du sie hier aus.
          </p>

          <div className="chips" style={{ marginBottom: 10 }}>
            {[
              { id: 'bowl_1000', label: 'Schale 1 l' },
              { id: 'bowl_500', label: 'Schale 0,5 l' },
              { id: 'cup_400', label: 'Becher 0,4 l' },
            ].map((g) => (
              <button
                key={g.id}
                className="chip"
                aria-pressed={groesse === g.id}
                onClick={() => setGroesse(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="col" style={{ gap: 8 }}>
            {partners
              .filter((p) => p.accepts.includes(groesse))
              .slice(0, 4)
              .map((p) => (
                <button
                  key={p.partner_id}
                  className="card tight flat row"
                  /* button.card sets display:block and outranks .row — say it again */
                  style={{ display: 'flex', gap: 10 }}
                  disabled={busy}
                  onClick={() => void ausleihen(p.partner_id)}
                >
                  <Thumb icon="cup" size={38} />
                  <span className="grow">
                    <span className="sm" style={{ display: 'block', fontWeight: 600 }}>
                      {p.name}
                    </span>
                    <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                      {p.address}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} className="ico" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* The result — and the button that proves the rule. */}
      {result && (
        <Ergebnis
          result={result}
          busy={busy}
          onRepeat={() => void zurueckgeben(result.container.container_id)}
          onClose={() => setResult(null)}
        />
      )}

      {/* Returned before. */}
      {(state.data?.returned.length ?? 0) > 0 && (
        <div>
          <p className="lbl" style={{ marginBottom: 9 }}>Zurückgegeben</p>
          <div className="col" style={{ gap: 9 }}>
            {state.data!.returned.slice(0, 8).map((c) => (
              <div key={c.container_id} className="card tight row" style={{ gap: 10 }}>
                <Thumb icon="cup" size={38} />
                <span className="grow">
                  <span className="sm" style={{ display: 'block', fontWeight: 600 }}>
                    {c.label} · {c.container_id}
                  </span>
                  <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                    {c.returned_at ? uhr(c.returned_at) : ''} · {c.return_partner_name}
                  </span>
                </span>
                {c.actionId ? (
                  <Link className="xs" to={`/nachweis/${c.actionId}`} style={{ fontWeight: 700 }}>
                    Nachweis
                  </Link>
                ) : (
                  <Label>ohne Gutschrift</Label>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.data && (
        <p className="xs mut" style={{ margin: 0 }}>
          Eine Rückgabe ist {state.data.xpPerReturn} XP wert, Leihdauer {state.data.loanDays} Tage.
          Belohnt wird über die Ereignis-ID — jedes Ereignis genau einmal.
        </p>
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function Aktiv({ container }: { container: VytalContainer }) {
  const spaet = container.status === 'overdue'

  return (
    <div className={spaet ? 'card' : 'card sky'}>
      <div className="between" style={{ marginBottom: 11 }}>
        <span className="h3">Dein Behälter</span>
        <Tag von="simulated" icon />
      </div>

      <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
        <Thumb icon="cup" size={52} />
        <div className="grow">
          <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            <b className="sm">{container.label}</b>
            <Label tone={spaet ? 'warn' : 'plain'}>{container.container_id}</Label>
          </div>
          <div className="xs mut" style={{ marginTop: 3 }}>
            Ausgeliehen bei {container.partner_name} am {tag(container.borrowed_at)}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 7 }}>
            <Icon name="clock" size={14} className="ico" />
            <span className="sm" style={{ fontWeight: 700 }}>
              {frist(container.hoursLeft)}
            </span>
            <span className="xs mut">bis {tag(container.due_at)}</span>
          </div>
        </div>
      </div>

      {container.single_use_grams && (
        <p className="xs mut" style={{ margin: '11px 0 0' }}>
          Jede Rückgabe spart eine Einwegverpackung von rund {container.single_use_grams} g.
        </p>
      )}
    </div>
  )
}

/**
 * The answer to a scan — first or fifth, the same call and a different story.
 *
 * A repeat is not an error state: the return happened, it was recorded, and it
 * was already paid. So it gets the same calm treatment as the first scan, plus
 * the ledger row that holds the credit, so nobody has to take our word for it.
 */
function Ergebnis({
  result,
  busy,
  onRepeat,
  onClose,
}: {
  result: VytalReturnResult
  busy: boolean
  onRepeat: () => void
  onClose: () => void
}) {
  /* Three different outcomes, and conflating them would be the one thing
     this screen must not do: paid, refused because the event was already
     paid, or recorded and capped by a rule that has nothing to do with it. */
  const paid = result.credited && !result.blocked
  const schonBezahlt = !result.credited
  const gedeckelt = result.credited && result.blocked

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 9 }}>
        <span className="h3">{schonBezahlt ? 'Schon erfasst' : 'Rückgabe erfasst'}</span>
        <button className="icobtn bare" onClick={onClose} aria-label="Schließen">
          <Icon name="cross" size={18} />
        </button>
      </div>

      <div className="col" style={{ gap: 7 }}>
        <div className="between">
          <span className="sm mut">Ereignis-ID</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="xs">{result.event.event_id}</b>
            <Tag von="simulated" />
          </span>
        </div>
        <div className="between">
          <span className="sm mut">Behälter</span>
          <b className="sm">{result.container.container_id}</b>
        </div>
        <div className="between">
          <span className="sm mut">Zeitpunkt</span>
          <b className="sm">{uhr(result.event.occurred_at)}</b>
        </div>
      </div>

      <div className="sep" style={{ margin: '11px 0' }} />

      {paid && result.award ? (
        <div className="between">
          <Coin star>
            +{result.award.xp} XP · {result.award.coins} Münzen
          </Coin>
          <Link className="sm" to={`/nachweis/${result.award.actionId}`} style={{ fontWeight: 700 }}>
            Nachweis öffnen
          </Link>
        </div>
      ) : (
        <div>
          <div className="row" style={{ gap: 7, marginBottom: 5 }}>
            <Icon name={schonBezahlt ? 'shield' : 'clock'} size={16} className="ico" />
            <b className="sm">
              {schonBezahlt ? 'Keine zweite Gutschrift' : 'Gezählt, aber nicht bepunktet'}
            </b>
          </div>
          <p className="sm mut" style={{ margin: 0 }}>
            {schonBezahlt ? result.message : (result.hint ?? result.message)}
          </p>
          {result.alreadyPaid && (
            <div className="between" style={{ marginTop: 9 }}>
              <span className="xs mut">
                gutgeschrieben am {uhr(result.alreadyPaid.at)} · {result.alreadyPaid.xp} XP
              </span>
              <Link
                className="xs"
                to={`/nachweis/${result.alreadyPaid.actionId}`}
                style={{ fontWeight: 700 }}
              >
                Nachweis
              </Link>
            </div>
          )}
          {gedeckelt && result.award && (
            <div className="between" style={{ marginTop: 9 }}>
              <span className="xs mut">Die Rückgabe steht trotzdem im Belohnungsbuch</span>
              <Link
                className="xs"
                to={`/nachweis/${result.award.actionId}`}
                style={{ fontWeight: 700 }}
              >
                Nachweis
              </Link>
            </div>
          )}
        </div>
      )}

      {/* The demonstration, as a button. Press it and nothing is paid twice. */}
      <button className="btn sm" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={onRepeat}>
        {busy ? <span className="spinner" /> : <Icon name="scan" size={17} />}
        Denselben Code nochmal scannen
      </button>
      <p className="xs mut" style={{ margin: '7px 0 0' }}>
        Dieselbe Rückgabe liefert dieselbe Ereignis-ID. Das Belohnungsbuch kennt sie und
        zahlt nicht erneut — nachlesbar im Nachweis.
      </p>
    </div>
  )
}
