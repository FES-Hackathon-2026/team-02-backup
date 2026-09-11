import { useEffect, useState } from 'react'

import { listUsers } from '../lib/api'
import { getApiKey, setActiveUserId, setApiKey } from '../lib/config'
import type { User } from '../lib/types'

/**
 * Sign-in gate.
 *
 * The foodsharing API has no accounts, no passwords and no signup. What it has
 * is a team key and two test users per team. So signing in means:
 *
 *   1. hand over a team key — validated for real against GET /users, so a wrong
 *      key fails here rather than silently breaking every later screen
 *   2. choose which of the team's two users you are acting as
 *
 * We show that honestly rather than dressing it up as an email login, because
 * the whole app is built on not presenting things as more verified than they are.
 */

type Step = 'key' | 'user'

interface Props {
  onSignedIn: (users: User[], userId: number) => void
  /**
   * Whether to validate an already-known key on mount. True on a cold start,
   * so a deployment with a built-in key goes straight to choosing a user.
   * False right after an explicit sign-out — otherwise the built-in key would
   * re-validate instantly and "Sign out" would look broken.
   */
  autoStart: boolean
}

export default function Login({ onSignedIn, autoStart }: Props) {
  const [step, setStep] = useState<Step>('key')
  const [key, setKey] = useState(autoStart ? getApiKey() : '')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    if (autoStart && getApiKey() !== '') void verify(getApiKey(), { silent: true })
    // verify is stable enough for a mount-only check; re-running on every
    // render would hammer the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  async function verify(candidate: string, opts: { silent?: boolean } = {}) {
    const trimmed = candidate.trim()
    if (trimmed === '') {
      setError('Enter a team key to continue.')
      return
    }

    setChecking(true)
    setError(null)
    setApiKey(trimmed)

    const res = await listUsers()

    if (!res.ok || !res.data || res.data.length === 0) {
      // Roll the key back so a bad paste does not stick around.
      setApiKey('')
      setChecking(false)
      if (!opts.silent) {
        setError(
          res.status === 401
            ? 'That key was rejected by the server (401). Check it for typos.'
            : (res.error ?? 'Could not reach the API.'),
        )
      }
      return
    }

    setUsers(res.data)
    setChecking(false)
    setStep('user')
  }

  function choose(user: User) {
    setActiveUserId(user.id)
    onSignedIn(users, user.id)
  }

  return (
    <div className="login">
      <div className="login-brand">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <rect x="6" y="6" width="88" height="88" rx="22" fill="var(--accent)" />
          <line
            x1="27"
            y1="73"
            x2="73"
            y2="27"
            stroke="var(--card)"
            strokeWidth="5.8"
            strokeLinecap="round"
          />
          <circle cx="27" cy="73" r="10.5" fill="var(--card)" />
          <circle cx="27" cy="73" r="4.7" fill="var(--accent)" />
          <circle cx="73" cy="27" r="10.5" fill="var(--card)" />
          <circle cx="73" cy="27" r="4.7" fill="var(--accent)" />
        </svg>
        <h1>Save2Share</h1>
        <p className="login-tagline">
          Rescue food that is already on your way — and see the honest net impact.
        </p>
      </div>

      {step === 'key' && (
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault()
            void verify(key)
          }}
        >
          <label className="login-label" htmlFor="team-key">
            Team key
          </label>
          <input
            id="team-key"
            className="field"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setError(null)
            }}
            placeholder="team_02_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            disabled={checking}
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn" type="submit" disabled={checking}>
            {checking ? (
              <>
                <span className="spinner" /> Checking with the server…
              </>
            ) : (
              'Continue'
            )}
          </button>

          <p className="login-note">
            The hackathon API has no accounts. Your team key is the credential, and it is
            checked against the live server before you get in. It is stored in this browser
            only — never sent anywhere but the foodsharing API.
          </p>
        </form>
      )}

      {step === 'user' && (
        <div className="login-card">
          <label className="login-label">Continue as</label>
          <p className="login-sub">
            Your team has two test users. Pick who you are acting as — you can switch any time.
          </p>

          {users.map((u) => (
            <button key={u.id} className="user-choice" onClick={() => choose(u)}>
              <div className="user-avatar" aria-hidden="true">
                {u.display_name.replace(/[^0-9]/g, '') || u.display_name.slice(0, 1)}
              </div>
              <div className="user-meta">
                <b>{u.display_name}</b>
                <span className="tiny muted">
                  {u.team_name} · #{u.id} · {u.pickups_completed} pickups
                </span>
              </div>
              <span className={`pv ${u.verification.is_verified ? 'pv-api' : 'pv-input'}`}>
                {u.verification.is_verified ? 'verified' : u.verification.status}
              </span>
            </button>
          ))}

          <button
            className="btn ghost"
            onClick={() => {
              setApiKey('')
              setKey('')
              setUsers([])
              setStep('key')
            }}
          >
            Use a different key
          </button>
        </div>
      )}
    </div>
  )
}
