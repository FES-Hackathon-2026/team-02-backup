import { useLocation } from 'react-router-dom'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError, api, type Me } from './client'

/**
 * The signed-in person.
 *
 * Restored from the cookie on every load, so a reload or a shared link never
 * asks again. `loading` is the only reason the app shows a blank frame, and
 * it lasts one request.
 */

interface SessionValue {
  me: Me | null
  loading: boolean
  /** true when the server could not be reached at all */
  offline: boolean
  signIn: (name: string, districtId: string, inviteCode?: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

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

  useEffect(() => {
    void refresh()
  }, [refresh, pathname])

  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [refresh])

  const signIn = useCallback(async (name: string, districtId: string, inviteCode?: string) => {
    setMe(await api.post<Me>('/api/session', { name, districtId, inviteCode }))
    setOffline(false)
  }, [])

  const signOut = useCallback(async () => {
    await api.post('/api/session/logout')
    setMe(null)
  }, [])

  return (
    <SessionContext.Provider value={{ me, loading, offline, signIn, signOut, refresh }}>
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
