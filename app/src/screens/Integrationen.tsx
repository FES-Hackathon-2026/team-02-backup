import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag } from '../components/ui'
import { useApi, type Integration } from '../lib/client'
import { de } from '../lib/de'

/**
 * Integrationen — the register, rendered live from the server.
 *
 * A judge should never have to guess which part of a demo is a real
 * interface and which part we rebuilt. So the answer is a screen inside the
 * app rather than a sentence in a pitch, and it is read from
 * `GET /api/integrations` rather than retyped here — the register and the
 * app cannot drift apart if there is only one copy of it.
 *
 * `seam` is the point of the whole table: for everything we rebuilt it names
 * the exact file that a real adapter would replace. That is the difference
 * between "we would integrate this later" and "here is where it plugs in".
 */

interface Register {
  integrations: Integration[]
  note: string
}

const STATUS: Record<
  Integration['status'],
  { titel: string; erklaerung: string; farbe: string }
> = {
  live: {
    titel: 'Echte Schnittstelle',
    erklaerung: 'Antwortet jetzt gerade. Werte daraus tragen in der App „bestätigt“.',
    farbe: 'var(--blue-deep)',
  },
  pending: {
    titel: 'Echt, aber ohne Zugang',
    erklaerung:
      'Der Dienst existiert, uns fehlt der Zugang. Bis dahin läuft unser Nachbau — in der ' +
      'echten Ereignisform, damit der Umstieg eine Adapterdatei bleibt.',
    farbe: 'var(--gold-ink)',
  },
  simulated: {
    titel: 'Von uns nachgebaut',
    erklaerung:
      'Gleiche Feldnamen, gleiche Statuswerte, gleiche Fehlerfälle wie der echte Dienst. ' +
      'Jeder Wert daraus trägt in der App „simuliert“ — nie „bestätigt“.',
    farbe: 'var(--stone)',
  },
}

const REIHENFOLGE: Integration['status'][] = ['live', 'pending', 'simulated']

export default function Integrationen() {
  const register = useApi<Register>('/api/integrations')
  const data = register.data

  return (
    <Screen back title="Integrationen" sub="was echt ist und was nachgebaut" gap={13}>
      {register.error && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            {register.error.status === 0 ? de.state.offline : register.error.message}
          </span>
          <button className="btn sm" onClick={() => register.reload()}>
            {de.action.retry}
          </button>
        </div>
      )}

      {register.loading && !data && (
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{de.state.loading}</p>
        </div>
      )}

      {data && (
        <>
          <div className="card tight">
            <p className="sm" style={{ margin: 0, lineHeight: 1.55 }}>
              {data.note}
            </p>
          </div>

          {REIHENFOLGE.map((status) => {
            const gruppe = data.integrations.filter((i) => i.status === status)
            if (gruppe.length === 0) return null
            const meta = STATUS[status]

            return (
              <div key={status}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      background: meta.farbe,
                      flex: 'none',
                    }}
                  />
                  <p className="lbl" style={{ margin: 0 }}>
                    {meta.titel} · {gruppe.length}
                  </p>
                </div>
                <p className="xs mut" style={{ margin: '0 0 10px', lineHeight: 1.55 }}>
                  {meta.erklaerung}
                </p>

                <div className="col" style={{ gap: 9 }}>
                  {gruppe.map((i) => (
                    <div key={i.id} className="card tight">
                      <div className="between" style={{ gap: 9, marginBottom: 7 }}>
                        <b className="sm" style={{ minWidth: 0 }}>
                          {i.name}
                        </b>
                        {status === 'live' ? (
                          <Tag von="api" icon>
                            echt
                          </Tag>
                        ) : status === 'pending' ? (
                          <Label tone="warn">Zugang fehlt</Label>
                        ) : (
                          <Tag von="simulated" icon />
                        )}
                      </div>
                      <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
                        {i.what}
                      </p>
                      <p
                        className="xs"
                        style={{
                          margin: '8px 0 0',
                          lineHeight: 1.5,
                          color: 'var(--ink3)',
                          wordBreak: 'break-word',
                        }}
                      >
                        <b style={{ color: 'var(--ink2)' }}>Nahtstelle:</b> {i.seam}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="card dashed tight">
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              Diese Tabelle kommt aus <b>GET /api/integrations</b> und wird nicht gepflegt,
              sondern gelesen. Wenn ein Dienst live geht, ändert sich hier die Zeile, weil sich
              der Server geändert hat — nicht, weil jemand daran gedacht hat.
            </p>
          </div>
        </>
      )}
    </Screen>
  )
}
