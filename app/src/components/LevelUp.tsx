import { t } from './../lib/i18n'
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
  return <DecisionSheet title={t("Level erreicht")} onClose={() => setLevel(null)}>
    <div className="level-celebration"><Icon name="spark" size={48} /><span className="num">{t("Level ")}{t(level)}</span><p>{t("Dein Einsatz für Frankfurt zählt.")}</p><p className="xs mut">{t("Deine bestätigten XP haben das nächste Level freigeschaltet.")}</p></div>
    {t(climateUnlocked && <p className="sm">{t("Frankfurt Klimaheld freigeschaltet")}</p>)}
    {t(progress.data?.latestLevelBonus && <p className="level-bonus">{t("+")}{t(progress.data.latestLevelBonus.xp)} {t(" Bonus-XP gutgeschrieben")}</p>)}
    <button className="btn primary" onClick={() => setLevel(null)}>{t("Weiter")}</button>
  </DecisionSheet>
}
