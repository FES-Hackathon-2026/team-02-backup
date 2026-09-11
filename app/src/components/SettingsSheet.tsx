import { useState } from 'react'

import { getApiKey, hasCustomKey, setApiKey } from '../lib/config'

interface Props {
  onClose: () => void
  /** called after the key changed so the app can reload its data */
  onKeyChange: () => void
}

export default function SettingsSheet({ onClose, onKeyChange }: Props) {
  const [value, setValue] = useState(getApiKey())
  const [saved, setSaved] = useState(false)

  function save() {
    setApiKey(value)
    setSaved(true)
    onKeyChange()
  }

  function reset() {
    setApiKey('')
    setValue(getApiKey())
    setSaved(true)
    onKeyChange()
  }

  return (
    <div className="screen">
      <h2>API key</h2>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          The app talks to the foodsharing hackathon API with a team key. A key is built into
          this deployment; paste a different one to act as another team. It is stored in this
          browser only.
        </p>
        <label className="small" htmlFor="apikey" style={{ fontWeight: 650 }}>
          X-API-Key
        </label>
        <input
          id="apikey"
          className="field"
          style={{ marginTop: 6 }}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          placeholder="team_02_…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="btn" style={{ marginTop: 12 }} onClick={save} disabled={saved}>
          {saved ? 'Saved' : 'Save key'}
        </button>
        {hasCustomKey() && (
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={reset}>
            Reset to the built-in key
          </button>
        )}
      </div>

      <button className="btn ghost" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
