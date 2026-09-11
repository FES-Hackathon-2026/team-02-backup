import { useCallback, useEffect, useState } from 'react'

import SettingsSheet from './components/SettingsSheet'
import TabBar, { type TabId } from './components/TabBar'
import { listUsers } from './lib/api'
import { hasAnyKey } from './lib/config'
import Discover, { type Opportunity } from './screens/Discover'
import Fair from './screens/Fair'
import Impact from './screens/Impact'
import Receipts from './screens/Receipts'
import type { User } from './lib/types'

export default function App() {
  const [tab, setTab] = useState<TabId>('discover')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [activeUserId, setActiveUserId] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)

  const loadUsers = useCallback(async () => {
    setBooting(true)
    setBootError(null)

    if (!hasAnyKey()) {
      setBootError('No API key set. Open settings and paste your team key.')
      setBooting(false)
      return
    }

    const res = await listUsers()
    if (!res.ok || !res.data) {
      setBootError(res.error ?? 'Could not reach the API.')
      setUsers([])
      setBooting(false)
      return
    }

    setUsers(res.data)
    // Each team has two test users; the API marks one as the default actor.
    setActiveUserId((res.data.find((u) => u.is_default) ?? res.data[0])?.id ?? null)
    setBooting(false)
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const user = users.find((u) => u.id === activeUserId) ?? null

  function handleSelect(opportunity: Opportunity) {
    // TODO(#1): open the action sheet — adjust amount and travel mode, show the
    // live net-impact breakdown and the reward with its reasons, then write to
    // the API (reserve -> confirm) and produce a receipt.
    console.info('selected opportunity', opportunity)
  }

  if (settingsOpen) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="title">Settings</div>
        </header>
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onKeyChange={() => void loadUsers()}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          Save2Share
          <small>Rescue minus travel · Frankfurt Impact Challenge</small>
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
                onClick={() => setActiveUserId(u.id)}
              >
                {u.display_name} #{u.id} {u.verification.is_verified ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {booting && (
        <div className="empty">
          <span className="spinner" /> Connecting to the API…
        </div>
      )}

      {!booting && bootError && (
        <div className="screen">
          <div className="card" style={{ background: 'var(--bad-soft)', borderColor: 'transparent' }}>
            <b className="small">Not connected</b>
            <div className="tiny" style={{ marginTop: 4 }}>
              {bootError}
            </div>
          </div>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Open settings
          </button>
        </div>
      )}

      {!booting && !bootError && (
        <>
          {tab === 'discover' && <Discover user={user} onSelect={handleSelect} />}
          {tab === 'receipts' && <Receipts />}
          {tab === 'impact' && <Impact />}
          {tab === 'fair' && <Fair user={user} />}
        </>
      )}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
