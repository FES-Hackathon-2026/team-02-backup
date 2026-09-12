import { useEffect, useState } from 'react'

import Icon from '../components/Icon'
import { ApiError } from '../lib/client'
import { STADTTEILE_BY_NAME, nearestStadtteil } from '../lib/frankfurt'
import { useSession } from '../lib/session'

/**
 * Sign-in: a name and a Stadtteil.
 *
 * No password, no email, no confirmation. There is nothing here worth
 * stealing, and every extra step costs demo time with a judge holding a
 * phone. If the device will share its position we preselect the nearest
 * district — but it stays a normal dropdown, so refusing costs nothing.
 */
export default function Anmelden() {
  const { signIn, offline } = useSession()
  const [name, setName] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [located, setLocated] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDistrictId((current) =>
          current === ''
            ? nearestStadtteil({ lat: pos.coords.latitude, lon: pos.coords.longitude }).id
            : current,
        )
        setLocated(true)
      },
      // Refusing is a normal answer. The dropdown still works.
      () => undefined,
      { timeout: 5000, maximumAge: 300_000 },
    )
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(name, districtId)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Der Server antwortet gerade nicht.',
      )
      setBusy(false)
    }
  }

  const ready = name.trim().length >= 2 && districtId !== ''

  return (
    <div className="app">
      <div
        className="body"
        style={{ justifyContent: 'center', gap: 22, paddingBottom: 40, minHeight: '100dvh' }}
      >
        <div>
          <h1
            className="h1"
            style={{ fontSize: 38, color: 'var(--blue-deep)', letterSpacing: '-0.04em' }}
          >
            ReMain
          </h1>
          <p className="mut" style={{ marginTop: 8, fontSize: 15, maxWidth: '30ch' }}>
            Ein Foto — und Frankfurt weiß, was damit zu tun ist.
          </p>
        </div>

        <form onSubmit={submit} className="col" style={{ gap: 14 }}>
          <label className="col" style={{ gap: 7 }}>
            <span className="lbl">Wie heißt du?</span>
            <input
              id="name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vorname reicht"
              autoComplete="given-name"
              maxLength={40}
              required
            />
          </label>

          <label className="col" style={{ gap: 7 }}>
            <span className="lbl">Dein Stadtteil</span>
            <select
              id="district"
              className="field"
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              required
            >
              <option value="" disabled>
                Bitte wählen
              </option>
              {STADTTEILE_BY_NAME.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {located && (
              <span className="xs mut row" style={{ gap: 5 }}>
                <Icon name="pin" size={14} />
                Anhand deines Standorts vorausgewählt — änderbar.
              </span>
            )}
          </label>

          {error !== null && (
            <p className="tag warn" style={{ height: 'auto', padding: '8px 10px', lineHeight: 1.4 }}>
              {error}
            </p>
          )}

          <button className="btn primary" type="submit" disabled={!ready || busy}>
            {busy ? 'Einen Moment …' : 'Los geht’s'}
          </button>
        </form>

        <p className="xs mut" style={{ lineHeight: 1.55 }}>
          Kein Passwort, keine E-Mail. Der Name steht auf deinen Quests, der Stadtteil zählt auf
          das Stadtziel ein. Dein Standort wird nur benutzt, wenn du eine Aktion startest.
        </p>

        {offline && (
          <p className="stub">
            Der Server ist gerade nicht erreichbar. Läuft <code>npm start</code> in <code>server/</code>?
          </p>
        )}
      </div>
    </div>
  )
}
