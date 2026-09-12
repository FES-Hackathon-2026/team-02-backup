import { useLocation } from 'react-router-dom'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError, api, type Me } from './client'
import { consumeRedirectResult, redirectPending, signInWithGoogle, signOutOfGoogle } from './firebase'

/**
 * The signed-in person.
 *
 * Restored from the cookie on every load, so a reload or a shared link never
 * asks again. `loading` is the only reason the app shows a blank frame, and
 * it lasts one request.
 *
 * Google is verified by the server before it issues the application cookie.
 */

/** What the server can tell us about the sign-in methods it offers. */
export interface AuthConfig {
  google: boolean
  guest: false
}

/**
 * A new Google account the server has never seen, which still needs a
 * Stadtteil before it can exist. Thrown by signInWithGoogle so the login
 * screen can ask one more question instead of showing an error.
 */
export class DistrictRequired extends Error {
  profile: { name: string; email: string | null; photoUrl: string | null }
  constructor(profile: DistrictRequired['profile']) {
    super('Fast geschafft — wähle noch deinen Stadtteil.')
    this.name = 'DistrictRequired'
    this.profile = profile
  }
}

interface SessionValue {
  me: Me | null
  loading: boolean
  /** true when the server could not be reached at all */
  offline: boolean
  /** which sign-in methods this deployment offers; null until known */
  auth: AuthConfig | null
  pendingGoogleProfile: DistrictRequired['profile'] | null
  cancelGoogleSignIn: () => void
  /**
   * Google sign-in, end to end. Throws DistrictRequired when the account is
   * new here — call again with the chosen district and the same token is
   * reused, so the person is not sent back to Google.
   */
  signInWithGoogle: (districtId?: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (changes: { name?: string; districtId?: string }) => Promise<void>
  deleteAccount: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [me, setMe] = useState<Me | null>(null)
  // A pending redirect means this load is the second half of a sign-in.
  // Starting in the loading state stops the login screen flashing first.
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [auth, setAuth] = useState<AuthConfig | null>(null)

  /**
   * The last verified Google token, kept only between the 409 and the retry
   * that follows it. Never stored — a token lives about an hour and there is
   * no reason for one to outlive the question it is waiting on.
   */
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [pendingGoogleProfile, setPendingGoogleProfile] = useState<DistrictRequired['profile'] | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/me'))
      setOffline(false)
    } catch (error) {
      // 401 is the normal "not signed in yet" answer, not a failure.
      if (error instanceof ApiError && error.status === 401) {
        setMe(null)
        setOffline(false)
      } else {
        setOffline(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  /** Sends a verified Google token to our server and adopts the result. */
  const exchange = useCallback(async (idToken: string, districtId?: string) => {
    try {
      setMe(await api.post<Me>('/api/session/google', { idToken, districtId, inviteCode: new URLSearchParams(window.location.search).get('invite') ?? undefined }))
      setOffline(false)
      setPendingToken(null)
      setPendingGoogleProfile(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'district_required') {
        // Hold the token so answering the question costs one request, not a
        // second trip through Google.
        setPendingToken(idToken)
        const profile = (error.body as { profile?: DistrictRequired['profile'] } | null)?.profile ?? {
            name: '',
            email: null,
            photoUrl: null,
          }
        setPendingGoogleProfile(profile)
        throw new DistrictRequired(profile)
      }
      if (error instanceof ApiError && error.status === 401) { setPendingToken(null); setPendingGoogleProfile(null) }
      throw error
    }
  }, [])

  useEffect(() => {
    void (async () => {
      // Both answers matter before the first paint, and neither depends on
      // the other.
      const [config, redirectToken] = await Promise.all([
        api.get<AuthConfig>('/api/auth/config').catch(() => null),
        consumeRedirectResult(),
      ])
      setAuth(config ?? { google: false, guest: false })

      if (redirectToken !== null) {
        try {
          await exchange(redirectToken)
          setLoading(false)
          return
        } catch {
          // Needs a district, or the server said no. Either way the login
          // screen takes it from here.
        }
      }
      await refresh()
    })()
  }, [refresh, exchange])

  useEffect(() => {
    if (!loading) void refresh()
  }, [refresh, pathname])

  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [refresh])

  const cancelGoogleSignIn = useCallback(() => { setPendingToken(null); setPendingGoogleProfile(null) }, [])

  const startGoogle = useCallback(
    async (districtId?: string) => {
      // The retry after DistrictRequired reuses the token we already hold.
      const idToken = pendingToken ?? (await signInWithGoogle())
      await exchange(idToken, districtId)
    },
    [pendingToken, exchange],
  )

  /** End the server session first; a failed request must not pretend logout succeeded. */
  const signOut = useCallback(async () => {
    await api.post('/api/session/logout')
    await signOutOfGoogle()
    setPendingToken(null)
    setPendingGoogleProfile(null)
    setMe(null)
  }, [])

  const updateProfile = useCallback(async (changes: { name?: string; districtId?: string }) => {
    setMe(await api.patch<Me>('/api/me', changes))
  }, [])

  const deleteAccount = useCallback(async () => {
    await api.del('/api/me')
    await signOutOfGoogle()
    setPendingToken(null)
    setMe(null)
  }, [])

  return (
    <SessionContext.Provider
      value={{
        me,
        loading: loading || redirectPending(),
        offline,
        auth,
        pendingGoogleProfile,
        cancelGoogleSignIn,
        signInWithGoogle: startGoogle,
        signOut,
        updateProfile,
        deleteAccount,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}

/** The signed-in person, for screens that only render behind the gate. */
export function useMe(): Me {
  const { me } = useSession()
  if (!me) throw new Error('useMe outside the signed-in area')
  return me
}
