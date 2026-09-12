import BrandMark from '../components/BrandMark'
import { t } from './../lib/i18n'
import { useEffect, useState } from 'react'

import GoogleButton from '../components/GoogleButton'
import { ApiError } from '../lib/client'
import { firebaseConfigured } from '../lib/firebase'
import { SignInError } from '../lib/firebase'
import { STADTTEILE_BY_NAME } from '../lib/frankfurt'
import { DistrictRequired, useSession } from '../lib/session'

/** Google is the only authentication flow; new accounts choose a district once. */
type Step = 'choose' | 'district'

export default function Anmelden() {
  const { signInWithGoogle, cancelGoogleSignIn, pendingGoogleProfile, auth, offline } = useSession()

  const [step, setStep] = useState<Step>(pendingGoogleProfile ? 'district' : 'choose')
  const [districtId, setDistrictId] = useState('')
  const [busy, setBusy] = useState<'google' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** the Google profile, once we know it needs a Stadtteil to finish */
  const [greeting, setGreeting] = useState<string | null>(pendingGoogleProfile?.name || pendingGoogleProfile?.email || null)

  useEffect(() => {
    if (pendingGoogleProfile) {
      setGreeting(pendingGoogleProfile.name || pendingGoogleProfile.email)
      setStep('district')
    }
  }, [pendingGoogleProfile])

  /** Everything that can go wrong, in one sentence the person can act on. */
  function explain(err: unknown): string {
    if (err instanceof SignInError || err instanceof ApiError) return err.message
    return 'Der Server antwortet gerade nicht.'
  }

  async function google(withDistrict?: string) {
    setError(null)
    setBusy('google')
    try {
      await signInWithGoogle(withDistrict)
      // On success the gate in App.tsx swaps this screen out; nothing to do.
    } catch (err) {
      if (err instanceof DistrictRequired) {
        // Not a failure — one more question. The token is held in the
        // session provider, so answering it costs no second trip to Google.
        setGreeting(err.profile.name || err.profile.email)
        setStep('district')
      } else {
        setError(explain(err))
        if (err instanceof ApiError && err.status === 401) setStep('choose')
      }
      setBusy(null)
    }
  }

  const googleOffered = firebaseConfigured && auth?.google === true && !offline

  return (
    <div className="app">
      <div
        className="body"
        style={{ justifyContent: 'center', gap: 22, paddingBottom: 40, minHeight: '100dvh' }}
      >
        <div>
          <BrandMark />
          <h1
            className="h1"
            style={{ fontSize: 38, color: 'var(--blue-deep)', letterSpacing: '-0.04em' }}
          >
            {t("ReMain")}</h1>
          <p className="mut" style={{ marginTop: 8, fontSize: 15, maxWidth: '30ch' }}>
            {t(step === 'district'
              ? greeting
                ? `Willkommen, ${greeting} — fehlt nur noch dein Stadtteil.`
                : 'Fast geschafft — fehlt nur noch dein Stadtteil.'
              : 'Ein Foto — und Frankfurt weiß, was damit zu tun ist.')}
          </p>
        </div>

        {t(step === 'choose' && (
          <div className="col" style={{ gap: 14 }}>
            <GoogleButton onClick={() => void google()} busy={busy === 'google'} disabled={!googleOffered} />
            {!googleOffered && <p className="sm mut" role="status">{t(offline
              ? 'Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.'
              : 'Google-Anmeldung ist noch nicht eingerichtet. Bitte versuche es später erneut.')}</p>}

            {t(error !== null && <ErrorNote>{t(error)}</ErrorNote>)}
          </div>
        ))}

        {t(step === 'district' && (
          <div className="col" style={{ gap: 14 }}>
            <DistrictField
              value={districtId}
              onChange={setDistrictId}
              autoFocus
            />
            {t(error !== null && <ErrorNote>{t(error)}</ErrorNote>)}
            <button
              className="btn primary"
              onClick={() => void google(districtId)}
              disabled={districtId === '' || busy !== null}
            >
              {t(busy === 'google' ? 'Einen Moment …' : 'Fertig')}
            </button>
            <button className="btn ghost" disabled={busy !== null} onClick={() => {
              cancelGoogleSignIn(); setStep('choose'); setGreeting(null); setError(null)
            }}>{t('Anderes Google-Konto wählen')}</button>
          </div>
        ))}

        <p className="xs mut" style={{ lineHeight: 1.55 }}>
          {t('Mit Google übernehmen wir deinen Namen, deine E-Mail-Adresse und dein Profilbild. Deinen Stadtteil wählst du einmal beim ersten Anmelden.')}
        </p>
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
      {t(children)}
    </p>
  )
}

function DistrictField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string
  onChange: (id: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="col" style={{ gap: 7 }}>
      <span className="lbl">{t("Dein Stadtteil")}</span>
      <select
        id="district"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
      >
        <option value="" disabled>
          {t("Bitte wählen")}</option>
        {t(STADTTEILE_BY_NAME.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        )))}
      </select>
    </label>
  )
}
