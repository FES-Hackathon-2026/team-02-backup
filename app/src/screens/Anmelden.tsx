import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import GoogleButton from '../components/GoogleButton'
import Icon from '../components/Icon'
import { ApiError } from '../lib/client'
import { firebaseConfigured } from '../lib/firebase'
import { SignInError } from '../lib/firebase'
import { STADTTEILE_BY_NAME, nearestStadtteil } from '../lib/frankfurt'
import { DistrictRequired, useSession } from '../lib/session'

/**
 * Sign-in.
 *
 * Two ways in, deliberately:
 *
 *   Google   a real account, so progress follows the person to their next
 *            device instead of living in one browser's cookie.
 *   Gast     a name and a Stadtteil. No password, no e-mail, no
 *            confirmation. A judge holding a phone should be inside the app
 *            in ten seconds, and not everyone wants to hand a hackathon
 *            prototype their Google account.
 *
 * The Stadtteil is the one thing the app genuinely needs either way — it is
 * what a person's actions count towards — so when Google cannot supply it,
 * the screen asks for it as a second step rather than up front.
 */

type Step = 'choose' | 'district' | 'guest'

export default function Anmelden() {
  const [params] = useSearchParams()
  const { signIn, signInWithGoogle, auth, offline } = useSession()

  /** ?invite=… survives both buttons, so a referral does not depend on which
      one the newcomer happens to press. */
  const invite = params.get('invite') ?? undefined

  const [step, setStep] = useState<Step>('choose')
  const [name, setName] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [busy, setBusy] = useState<'google' | 'guest' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [located, setLocated] = useState(false)
  /** the Google profile, once we know it needs a Stadtteil to finish */
  const [greeting, setGreeting] = useState<string | null>(null)

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

  /** Everything that can go wrong, in one sentence the person can act on. */
  function explain(err: unknown): string {
    if (err instanceof SignInError || err instanceof ApiError) return err.message
    return 'Der Server antwortet gerade nicht.'
  }

  async function google(withDistrict?: string) {
    setError(null)
    setBusy('google')
    try {
      await signInWithGoogle(withDistrict, invite)
      // On success the gate in App.tsx swaps this screen out; nothing to do.
    } catch (err) {
      if (err instanceof DistrictRequired) {
        // Not a failure — one more question. The token is held in the
        // session provider, so answering it costs no second trip to Google.
        setGreeting(err.profile.name || err.profile.email)
        setStep('district')
      } else {
        setError(explain(err))
      }
      setBusy(null)
    }
  }

  async function guest(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy('guest')
    try {
      await signIn(name, districtId, invite)
    } catch (err) {
      setError(explain(err))
      setBusy(null)
    }
  }

  const googleOffered = firebaseConfigured && auth?.google !== false

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
            {step === 'district'
              ? greeting
                ? `Willkommen, ${greeting} — fehlt nur noch dein Stadtteil.`
                : 'Fast geschafft — fehlt nur noch dein Stadtteil.'
              : 'Ein Foto — und Frankfurt weiß, was damit zu tun ist.'}
          </p>
        </div>

        {step === 'choose' && (
          <div className="col" style={{ gap: 14 }}>
            {googleOffered && (
              <>
                <GoogleButton onClick={() => void google()} busy={busy === 'google'} />
                <div className="or">
                  <span>oder</span>
                </div>
              </>
            )}

            <button className="btn primary" onClick={() => setStep('guest')}>
              Ohne Konto starten
            </button>

            {error !== null && <ErrorNote>{error}</ErrorNote>}
          </div>
        )}

        {step === 'district' && (
          <div className="col" style={{ gap: 14 }}>
            <DistrictField
              value={districtId}
              onChange={setDistrictId}
              located={located}
              autoFocus
            />
            {error !== null && <ErrorNote>{error}</ErrorNote>}
            <button
              className="btn primary"
              onClick={() => void google(districtId)}
              disabled={districtId === '' || busy !== null}
            >
              {busy === 'google' ? 'Einen Moment …' : 'Fertig'}
            </button>
          </div>
        )}

        {step === 'guest' && (
          <form onSubmit={guest} className="col" style={{ gap: 14 }}>
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
                autoFocus
              />
            </label>

            <DistrictField value={districtId} onChange={setDistrictId} located={located} />

            {error !== null && <ErrorNote>{error}</ErrorNote>}

            <button
              className="btn primary"
              type="submit"
              disabled={name.trim().length < 2 || districtId === '' || busy !== null}
            >
              {busy === 'guest' ? 'Einen Moment …' : 'Los geht’s'}
            </button>

            {googleOffered && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setError(null)
                  setStep('choose')
                }}
              >
                Zurück
              </button>
            )}
          </form>
        )}

        <p className="xs mut" style={{ lineHeight: 1.55 }}>
          {step === 'guest' ? (
            <>
              Kein Passwort, keine E-Mail. Der Name steht auf deinen Quests, der Stadtteil zählt
              auf das Stadtziel ein. Ohne Konto bleibt dein Fortschritt in diesem Browser — meldest
              du dich später mit Google an, nehmen wir ihn mit.
            </>
          ) : (
            <>
              Mit Google übernehmen wir Name, E-Mail und Profilbild — mehr nicht, und kein Zugriff
              auf dein Konto. Dein Standort wird nur benutzt, wenn du eine Aktion startest.
            </>
          )}
        </p>

        {offline && (
          <p className="stub">
            Der Server ist gerade nicht erreichbar. Läuft <code>npm start</code> in{' '}
            <code>server/</code>?
          </p>
        )}
      </div>
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="tag warn"
      role="alert"
      style={{ height: 'auto', padding: '8px 10px', lineHeight: 1.4 }}
    >
      {children}
    </p>
  )
}

function DistrictField({
  value,
  onChange,
  located,
  autoFocus = false,
}: {
  value: string
  onChange: (id: string) => void
  located: boolean
  autoFocus?: boolean
}) {
  return (
    <label className="col" style={{ gap: 7 }}>
      <span className="lbl">Dein Stadtteil</span>
      <select
        id="district"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
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
  )
}
