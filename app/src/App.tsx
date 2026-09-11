import { useCallback, useEffect, useState } from 'react'

import SettingsSheet from './components/SettingsSheet'
import TabBar, { type TabId } from './components/TabBar'
import { listUsers } from './lib/api'
import { getActiveUserId, hasAnyKey, setActiveUserId, signOut } from './lib/config'
import Discover, { type Opportunity } from './screens/Discover'
import Fair from './screens/Fair'
import Impact from './screens/Impact'
import Login from './screens/Login'
import Receipts from './screens/Receipts'
import type { User } from './lib/types'

type Phase = 'restoring' | 'signed-out' | 'signed-in'

export default function App() {
  const [phase, setPhase] = useState<Phase>('restoring')
  const [users, setUsers] = useState<User[]>([])
  const [activeUserId, setActive] = useState<number | null>(null)
  const [tab, setTab] = useState<TabId>('discover')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // false after an explicit sign-out, so the built-in key does not log you
  // straight back in
  const [autoStart, setAutoStart] = useState(true)

  /**
   * Restore a previous session on load: a stored key plus a stored user id.
   * The key is re-validated against the server rather than trusted, so a
   * revoked or edited key drops you back to the login screen instead of
   * failing later on every screen.
   */
  const restore = useCallback(async () => {
    setPhase('restoring')

    const storedUserId = getActiveUserId()
    if (!hasAnyKey() || storedUserId === null) {
      setPhase('signed-out')
      return
    }

    const res = await listUsers()
    if (!res.ok || !res.data?.some((u) => u.id === storedUserId)) {
      setPhase('signed-out')
      return
    }

    setUsers(res.data)
    setActive(storedUserId)
    setPhase('signed-in')
  }, [])

  useEffect(() => {
    void restore()
  }, [restore])

  function handleSignedIn(nextUsers: User[], userId: number) {
    setAutoStart(true)
    setUsers(nextUsers)
    setActive(userId)
    setPhase('signed-in')
  }

  function handleSignOut() {
    signOut()
    setAutoStart(false)
    setUsers([])
    setActive(null)
    setSettingsOpen(false)
    setTab('discover')
    setPhase('signed-out')
  }

  function switchUser(id: number) {
    setActiveUserId(id)
    setActive(id)
  }

  function handleSelect(opportunity: Opportunity) {
    // TODO(#1): open the action sheet — adjust amount and travel mode, show the
    // live net-impact breakdown and the reward with its reasons, then write to
    // the API (reserve -> confirm) and produce a receipt.
    console.info('selected opportunity', opportunity)
  }

  if (phase === 'restoring') {
    return (
      <div className="login">
        <div className="empty">
          <span className="spinner" /> Restoring your session…
        </div>
      </div>
    )
  }

  if (phase === 'signed-out') {
    return <Login onSignedIn={handleSignedIn} autoStart={autoStart} />
  }

  const user = users.find((u) => u.id === activeUserId) ?? null

  if (settingsOpen) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="title">Settings</div>
        </header>
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onKeyChange={() => void restore()}
          onSignOut={handleSignOut}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          Save2Share
          <small>{user ? `Acting as ${user.display_name} · #${user.id}` : 'Rescue minus travel'}</small>
        </div>
        <button
          className="chip"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      {users.length > 1 && (
        <div className="screen" style={{ paddingBottom: 0 }}>
          <div className="chips">
            {users.map((u) => (
              <button
                key={u.id}
                className="chip"
                aria-pressed={u.id === activeUserId}
                onClick={() => switchUser(u.id)}
              >
                {u.display_name} #{u.id} {u.verification.is_verified ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'discover' && <Discover user={user} onSelect={handleSelect} />}
      {tab === 'receipts' && <Receipts />}
      {tab === 'impact' && <Impact />}
      {tab === 'fair' && <Fair user={user} />}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
