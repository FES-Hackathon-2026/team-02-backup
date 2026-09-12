import { WeeklyGoal } from '../components/ReferenceActions'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Bar, Coin, Tag, Thumb } from '../components/ui'
import { useApi, type FesCalendar, type PickupNotices, type MarketItem, type Quest, type Season, type Impact, type FoodNearby, type VytalState, type VytalStatus } from '../lib/client'
import { useSession } from '../lib/session'

export default function Start() {
  const navigate = useNavigate()
  const { me, signOut } = useSession()
  const [error, setError] = useState('')
  const quests = useApi<{ quests: Quest[] }>('/api/quests')
  const market = useApi<{ items: MarketItem[] }>('/api/market')
  const season = useApi<Season>('/api/season')
  const impact = useApi<Impact>('/api/impact')
  const kalender = useApi<FesCalendar>('/api/fes/calendar')
  const food = useApi<FoodNearby>('/api/foodsharing/nearby')
  const reusable = useApi<VytalState>('/api/vytal/containers')
  const reusableStatus = useApi<VytalStatus>('/api/vytal/status')
  const notices = useApi<PickupNotices>('/api/fes/notifications')
  if (!me) return null
  const quest = quests.data?.quests[0]
  const item = market.data?.items[0]
  const next = kalender.data?.dates.find(d => !d.own)
  const foodTop = food.data?.items.find(item => !item.locked)
  const activeContainers = reusable.data?.active ?? []
  const overdue = activeContainers.some(item => item.overdue)
  const nextReturn = activeContainers.reduce<number | null>((value, item) => item.hoursLeft === null ? value : value === null ? item.hoursLeft : Math.min(value, item.hoursLeft), null)
  const city = season.data?.city
  const progress = Math.min(100, Math.max(0, 100 * (me.xp - me.levelStart) / Math.max(1, me.levelEnd - me.levelStart)))
  return <Screen title={`Hallo ${me.name}`} sub={`Level ${me.level} · ${me.district.name}`} tabs action={
    <span className="row"><button className="icobtn" aria-label="Einstellungen" onClick={() => navigate('/einstellungen')}><Icon name="settings" size={21} /></button><button className="icobtn notification-button" onClick={() => navigate('/mitteilungen')} aria-label={`Mitteilungen${notices.data?.unread ? `, ${notices.data.unread} ungelesen` : ''}`}>
      <Icon name="bell" size={21} />{!!notices.data?.unread && <span className="notification-dot" />}
    </button></span>
  }>
    <div className="card row home-progress">
      <button className="level-water" style={{ background: `linear-gradient(to top, var(--blue-deep) ${progress}%, var(--sky) ${progress}%)` }} onClick={() => navigate('/wirkung')} aria-label={`Level ${me.level}, ${Math.round(progress)} Prozent zum nächsten Level`}><span>{me.level}</span></button>
      <div className="grow"><b>{me.xp.toLocaleString('de-DE')} XP</b><span className="xs mut row" style={{ gap: 5, marginTop: 4 }}><Icon name="clock" size={13} />{impact.data ? `${impact.data.streak.weeks} ${impact.data.streak.weeks === 1 ? 'Woche' : 'Wochen'}` : `${me.actions} ${me.actions === 1 ? 'Aktion' : 'Aktionen'}`}</span></div>
      <button className="reward-link" onClick={() => navigate('/belohnungen')} aria-label={`${me.coins} Münzen einlösen`}><Coin star>{me.coins}</Coin></button>
    </div>
    <button className="card row scan-hero" onClick={() => navigate('/scan')}>
      <span className="hero-camera"><Icon name="camera" size={25} /></span>
      <span className="grow"><b className="h2">Gegenstand scannen</b><span className="row hero-modes"><Icon name="truck" size={16} /><Icon name="pin" size={16} /><Icon name="info" size={16} /><span className="xs">Erkennen und richtig weitergeben</span></span></span><Icon name="chevron" size={20} />
    </button>
    <WeeklyGoal />
    <button className="card tight row" onClick={() => navigate('/essen')}><Thumb icon="leaf" /><span className="grow"><b className="sm">Essen retten</b><span className="xs mut" style={{ display: 'block' }}>{food.error ? 'foodsharing antwortet gerade nicht — erneut versuchen' : foodTop ? `${foodTop.title}${foodTop.hoursLeft == null ? '' : ` · noch ${Math.max(1, Math.round(foodTop.hoursLeft))} h`}` : 'Offene Angebote und Fairteiler entdecken'}</span></span><Icon name="chevron" size={17} /></button>
    {reusableStatus.data?.configured && <button className="card tight row" onClick={() => navigate('/mehrweg')}><Thumb icon="cup" /><span className="grow"><b className="sm">{activeContainers.length ? `${activeContainers.length} Mehrweg-Behälter offen` : 'Mehrweg statt Einweg'}</b><span className="xs mut" style={{ display: 'block', color: overdue ? 'var(--alert)' : undefined }}>{reusable.error ? 'Vytal-Konto prüfen — Details öffnen' : overdue ? 'Rückgabe überfällig' : nextReturn !== null ? `Rückgabe in ${Math.max(1, Math.round(nextReturn))} Stunden` : `Ausgabe und Rücknahme an der ${reusable.data?.station ?? 'ReMain-Station'}`}</span></span><Icon name="chevron" size={17} /></button>}
    {next && <button className="card tight row" onClick={() => navigate('/kalender')}><Thumb icon="calendar" /><span className="grow"><b className="sm">{next.titel}</b><span className="xs mut" style={{ display: 'block' }}>{next.label} · {next.window}</span></span><Tag von="simulated" /><Icon name="chevron" size={17} /></button>}
    <section><div className="between" style={{ marginBottom: 9 }}><p className="lbl">In deiner Nähe</p><button className="text-link" onClick={() => navigate('/quests')}>Karte</button></div>
      <div className="nearby-grid">
        <button className="card tight" onClick={() => navigate('/quests')}><Thumb icon="quest" /><b>{quest?.title ?? 'Quests entdecken'}</b><span className="xs mut">{quest ? `${quest.district ?? 'Frankfurt'} · +${quest.xp} XP` : 'Gemeinsam aufräumen'}</span></button>
        <button className="card tight" onClick={() => navigate(item ? `/markt/${item.id}` : '/markt')}><Thumb icon="wrench" /><b>{item?.title ?? 'Reparatur-Markt'}</b><span className="xs mut">{item?.district ?? 'Dinge weitergeben'}</span></button>
        <button className="card tight" onClick={() => navigate('/mehrweg')}><Thumb icon="cup" /><b>Mehrweg</b><span className="xs mut">Rückgaben & Orte</span></button>
      </div>
    </section>
    {(quests.error || market.error || kalender.error || impact.error || season.error || notices.error) && <div className="card tight" role="alert"><p className="sm">Einige Daten konnten nicht geladen werden.</p><button className="btn sm" onClick={() => { quests.reload(); market.reload(); kalender.reload(); impact.reload(); season.reload(); notices.reload() }}>Erneut laden</button></div>}
    {city && <button className="card sky" onClick={() => navigate('/stadtteile')}><div className="between"><p className="lbl">Frankfurt diese Woche</p><Tag von="api" /></div><p className="sm"><b className="num" style={{ fontSize: 24 }}>{city.weekXp.toLocaleString('de-DE')}</b> / {city.goalXp.toLocaleString('de-DE')} XP</p><Bar value={city.weekXp} max={city.goalXp} /></button>}
    <details className="card home-more"><summary>Weitere Angebote</summary><div className="col" style={{ gap: 9, marginTop: 12 }}>
      <button className="btn" onClick={() => navigate('/essen')}><Icon name="leaf" size={18} />Essen retten</button>
      <button className="btn" onClick={() => navigate('/wissen')}><Icon name="info" size={18} />Was mache ich damit?</button>
      {me.role === 'driver' && <button className="btn" onClick={() => navigate('/touren')}>Meine Sammeltouren</button>}
      <button className="btn" onClick={() => navigate('/integrationen')}>Verbindungen und Datenquellen</button>
      <button className="btn" onClick={() => { void signOut().catch(() => setError('Abmelden fehlgeschlagen. Bitte erneut versuchen.')) }}>Abmelden</button>
      {error && <p role="alert">{error}</p>}
    </div></details>
  </Screen>
}
