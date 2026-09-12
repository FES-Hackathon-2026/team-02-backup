import { useApi } from '../lib/client'
import type { Progression } from './ReferenceActions'
import { useEffect, useRef, useState } from 'react'
import DecisionSheet from './DecisionSheet'
import Icon from './Icon'
import { useSession } from '../lib/session'

/** Celebrate only a server-confirmed level change in the same account. */
export default function LevelUp() {
  const { me } = useSession()
  const previous = useRef<{ id: number; level: number } | null>(null)
  const [climateUnlocked, setClimateUnlocked] = useState(false)
  const [level, setLevel] = useState<number | null>(null)
  useEffect(() => {
    if (me && previous.current?.id === me.id && me.level > previous.current.level) { setLevel(me.level); setClimateUnlocked(previous.current.level < 8 && me.level >= 8) }
    if (!me || previous.current?.id !== me.id) setLevel(null)
    previous.current = me ? { id: me.id, level: me.level } : null
  }, [me?.id, me?.level])
  const progress = useApi<Progression>(level === null ? null : `/api/progression?level=${level}`)
  if (level === null) return null
  return <DecisionSheet title="Level erreicht" onClose={() => setLevel(null)}>
    <div className="level-celebration"><Icon name="spark" size={48} /><span className="num">Level {level}</span><p>Dein Einsatz für Frankfurt zählt.</p><p className="xs mut">Deine bestätigten XP haben das nächste Level freigeschaltet.</p></div>
    {climateUnlocked && <p className="sm">Frankfurt Klimaheld freigeschaltet</p>}
    {progress.data?.latestLevelBonus && <p className="level-bonus">+{progress.data.latestLevelBonus.xp} Bonus-XP gutgeschrieben</p>}
    <button className="btn primary" onClick={() => setLevel(null)}>Weiter</button>
  </DecisionSheet>
}
