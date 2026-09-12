import { t, getLocale } from './../lib/i18n'
import { WeeklyGoal } from '../components/ReferenceActions'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Bar, Coin, Tag, Thumb } from '../components/ui'
import { useApi, type PickupNotices, type MarketItem, type Quest, type Season, type Impact, type FoodNearby, type VytalState, type VytalStatus } from '../lib/client'
import { useSession } from '../lib/session'

export default function Start() {
  const navigate = useNavigate()
  const { me, signOut } = useSession()
  const [error, setError] = useState('')
  const quests = useApi<{ quests: Quest[] }>('/api/quests')
  const market = useApi<{ items: MarketItem[] }>('/api/market')
  const season = useApi<Season>('/api/season')
  const impact = useApi<Impact>('/api/impact')
  const tour = useApi<{ slot: { label: string; periodLabel?: string } | null }>('/api/fes/opportunity')
  const food = useApi<FoodNearby>('/api/foodsharing/nearby')
  const reusable = useApi<VytalState>('/api/vytal/containers')
  const reusableStatus = useApi<VytalStatus>('/api/vytal/status')
  const notices = useApi<PickupNotices>('/api/fes/notifications')
  if (!me) return null
  const quest = quests.data?.quests[0]
  const item = market.data?.items[0]
  const foodTop = food.data?.items.find(item => !item.locked)
  const activeContainers = reusable.data?.active ?? []
  const overdue = activeContainers.some(item => item.overdue)
  const nextReturn = activeContainers.reduce<number | null>((value, item) => item.hoursLeft === null ? value : value === null ? item.hoursLeft : Math.min(value, item.hoursLeft), null)
  const city = season.data?.city
  const progress = Math.min(100, Math.max(0, 100 * (me.xp - me.levelStart) / Math.max(1, me.levelEnd - me.levelStart)))
  return <Screen title={t(`Hallo ${me.name}`)} sub={t("Was möchtest du heute erledigen?")} tabs action={
    <span className="row"><button className="icobtn" aria-label={t("Einstellungen")} onClick={() => navigate('/einstellungen')}><Icon name="settings" size={21} /></button><button className="icobtn notification-button" onClick={() => navigate('/mitteilungen')} aria-label={t(`Mitteilungen${notices.data?.unread ? `, ${notices.data.unread} ungelesen` : ''}${tour.data?.slot ? ', Sammeltour buchbar' : ''}`)}>
      <Icon name="bell" size={21} />{t((!!notices.data?.unread || !!tour.data?.slot) && <span className="notification-dot" />)}
    </button></span>
  }>
    <div className="card row home-progress">
      <button className="level-water" onClick={() => navigate('/wirkung')} aria-label={t(`Level ${me.level}, ${Math.round(progress)} Prozent zum nächsten Level`)}>
        <span className="level-water-tank" aria-hidden="true">
          <span className="level-water-fill" style={{ height: `${progress}%`, opacity: progress > 0 ? 1 : 0 }}>
            <svg className="level-wave level-wave-back" viewBox="0 0 120 16" preserveAspectRatio="none"><path d="M0 8 Q15 -3 30 8 T60 8 T90 8 T120 8 V16 H0 Z" /></svg>
            <svg className="level-wave level-wave-front" viewBox="0 0 120 16" preserveAspectRatio="none"><path d="M0 8 Q15 -3 30 8 T60 8 T90 8 T120 8 V16 H0 Z" /></svg>
          </span>
        </span>
        <span className="level-water-badge">{t(me.level)}</span>
      </button>
      <div className="grow"><b className="num home-xp">{t(me.xp.toLocaleString(getLocale()))} {t(" XP")}</b><span className="xs mut row" style={{ gap: 5, marginTop: 4 }}><Icon name="clock" size={13} />{t(impact.data ? `${impact.data.streak.weeks} ${impact.data.streak.weeks === 1 ? 'Woche' : 'Wochen'}` : `${me.actions} ${me.actions === 1 ? 'Aktion' : 'Aktionen'}`)}</span></div>
      <button className="reward-link" onClick={() => navigate('/belohnungen')} aria-label={t(`${me.coins} Münzen einlösen`)}><Coin star>{t(me.coins)}</Coin></button>
    </div>
    <WeeklyGoal />
    <button className="card tight row" onClick={() => navigate('/essen')}><Thumb icon="leaf" /><span className="grow"><b className="sm">{t("Essen retten")}</b><span className="xs mut card-sub">{t(food.error ? 'foodsharing antwortet gerade nicht — erneut versuchen' : foodTop ? `${foodTop.title}${foodTop.hoursLeft == null ? '' : ` · noch ${Math.max(1, Math.round(foodTop.hoursLeft))} h`}` : 'Offene Angebote und Fairteiler entdecken')}</span></span><Icon name="chevron" size={17} /></button>
    {t(reusableStatus.data?.configured && <button className="card tight row" onClick={() => navigate('/mehrweg')}><Thumb icon="cup" /><span className="grow"><b className="sm">{t(activeContainers.length ? `${activeContainers.length} Mehrweg-Behälter offen` : 'Mehrweg statt Einweg')}</b><span className="xs mut card-sub" style={{ color: overdue ? 'var(--alert)' : undefined }}>{t(reusable.error ? 'Konto noch nicht freigeschaltet' : overdue ? 'Rückgabe überfällig' : nextReturn !== null ? `Rückgabe in ${Math.max(1, Math.round(nextReturn))} Stunden` : `Ausgabe und Rücknahme an der ${reusable.data?.station ?? 'ReMain-Station'}`)}</span></span><Icon name="chevron" size={17} /></button>)}
    <section><div className="between" style={{ marginBottom: 9 }}><p className="lbl">{t("In deiner Nähe")}</p><button className="text-link" onClick={() => navigate('/quests')}>{t("Karte")}</button></div>
      <div className="nearby-grid">
        <button className="card tight" onClick={() => navigate('/quests')}><Thumb icon="quest" /><b>{quest?.title ?? t('Quests entdecken')}</b><span className="xs mut">{t(quest ? `${quest.district ?? 'Frankfurt'} · +${quest.xp} XP` : 'Gemeinsam aufräumen')}</span></button>
        <button className="card tight" onClick={() => navigate(item ? `/markt/${item.id}` : '/markt')}><Thumb icon="wrench" /><b>{item?.title ?? t('Reparatur-Markt')}</b><span className="xs mut">{t(item?.district ?? 'Dinge weitergeben')}</span></button>
      </div>
    </section>
    {t((quests.error || market.error || tour.error || impact.error || season.error || notices.error) && <div className="card tight" role="alert"><p className="sm">{t("Einige Daten konnten nicht geladen werden.")}</p><button className="btn sm" onClick={() => { quests.reload(); market.reload(); tour.reload(); impact.reload(); season.reload(); notices.reload() }}>{t("Erneut laden")}</button></div>)}
    {t(city && <button className="card sky" onClick={() => navigate('/stadtteile')}><div className="between"><p className="lbl">{t("Frankfurt diese Woche")}</p><Tag von="api" /></div><p className="sm"><b className="num" style={{ fontSize: 24 }}>{t(city.weekXp.toLocaleString(getLocale()))}</b> {t(" / ")}{t(city.goalXp.toLocaleString(getLocale()))} {t(" XP")}</p><Bar value={city.weekXp} max={city.goalXp} /></button>)}
    <details className="card home-more"><summary>{t("Weitere Angebote")}</summary><div className="col" style={{ gap: 9, marginTop: 12 }}>
      <button className="btn" onClick={() => navigate('/essen')}><Icon name="leaf" size={18} />{t("Essen retten")}</button>
      <button className="btn" onClick={() => navigate('/wissen')}><Icon name="info" size={18} />{t("Was mache ich damit?")}</button>
      {t(me.role === 'driver' && <button className="btn" onClick={() => navigate('/touren')}>{t("Meine Sammeltouren")}</button>)}
      <button className="btn" onClick={() => navigate('/integrationen')}>{t("Verbindungen und Datenquellen")}</button>
      <button className="btn" onClick={() => { void signOut().catch(() => setError('Abmelden fehlgeschlagen. Bitte erneut versuchen.')) }}>{t("Abmelden")}</button>
      {t(error && <p role="alert">{t(error)}</p>)}
    </div></details>
  </Screen>
}
