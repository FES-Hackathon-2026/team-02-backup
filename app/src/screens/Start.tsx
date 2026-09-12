import { t, getLocale } from './../lib/i18n'
import { WeeklyGoal } from '../components/ReferenceActions'
import { useState } from 'react'
import DashboardTour from '../components/DashboardTour'
import { finishDashboardTour, hasSeenDashboardTour } from '../lib/dashboardTour'
import { useNavigate } from 'react-router-dom'
import DecisionSheet from '../components/DecisionSheet'
import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import { Bar, Coin, Thumb } from '../components/ui'
import { useApi, type PickupNotices, type MarketItem, type Quest, type Season, type Impact } from '../lib/client'
import { useSession } from '../lib/session'

/**
 * Which services have already been explained on this device.
 *
 * The sheet earns its extra tap exactly once per service: the first time,
 * "Mehrweg" is a word you may not know, and after that it is a place you
 * have been. Storing it per service rather than as one flag means the third
 * tile still explains itself the first time it is pressed, even if the other
 * two were opened last week.
 *
 * localStorage can throw outright in a locked-down browser, so a failure
 * here simply means the explanation shows again — the harmless direction.
 */
const SEEN_KEY = 'remain.servicesSeen'

function seenServices(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function markServiceSeen(to: string): void {
  try {
    const next = [...new Set([...seenServices(), to])]
    localStorage.setItem(SEEN_KEY, JSON.stringify(next))
  } catch {
    /* the tile still works; it will just introduce itself again */
  }
}

interface ServiceTile {
  to: string
  icon: IconName
  label: string
  tip: string
  what: string
  go: string
  /** announced but not built: the tile shows, greyed, and goes nowhere */
  soon?: boolean
}

/**
 * The services.
 *
 * A tile is an icon and one word, which is enough to recognise something you
 * already know and not enough to try something you do not. Tapping therefore
 * explains first and travels second: `what` is the sentence the old
 * full-width subtitle used to carry, and the sheet's button is the trip
 * itself. One extra tap, and nobody has to guess what "Mehrweg" means before
 * committing to a screen.
 */
const SERVICES = [
  {
    to: '/essen',
    icon: 'leaf',
    label: 'Essen',
    tip: 'Fairteiler und Körbe in deiner Nähe',
    what: 'Fairteiler, Körbe und Geschäfte in Frankfurt, die Lebensmittel weitergeben statt sie wegzuwerfen. Du siehst, was gerade offen ist, wie weit es weg ist und wie lange es noch da liegt.',
    go: 'Angebote ansehen',
  },
  {
    to: '/mehrweg',
    icon: 'cup',
    label: 'Mehrweg',
    tip: 'Behälter ausleihen und zurückgeben',
    what: 'Statt Einwegverpackung leihst du einen Vytal-Behälter, benutzt ihn und gibst ihn wieder ab. ReMain ist dabei selbst eine Ausgabestelle — Ausgabe und Rücknahme laufen über uns.',
    go: 'Mehrweg öffnen',
  },
  {
    to: '/kalender',
    icon: 'calendar',
    label: 'Kalender',
    tip: 'Abfuhrtermine für deinen Stadtteil',
    what: 'Wann welche Tonne in deinem Stadtteil geleert wird, und wann Sperrmüll und Schadstoffe abgeholt werden.',
    go: 'Termine ansehen',
  },
  {
    // Announced, not built. It sits in the row greyed out because "this is
    // coming" is information, while a gap where a service will be is not —
    // and because a tile that looks live and does nothing is worse than one
    // that says so.
    to: '/spenden',
    icon: 'gift',
    label: 'Spenden',
    tip: 'Noch nicht verfügbar',
    what: 'Sachspenden an Einrichtungen im Stadtteil — wer nimmt was, und wann. Diese Funktion ist noch nicht freigeschaltet.',
    go: '',
    soon: true,
  },
] satisfies ServiceTile[]

export default function Start() {
  const navigate = useNavigate()
  const { me, signOut } = useSession()
  const [error, setError] = useState('')
  const [tourOpen, setTourOpen] = useState(() => !!me && !hasSeenDashboardTour(me.id))
  const quests = useApi<{ quests: Quest[] }>('/api/quests')
  const market = useApi<{ items: MarketItem[] }>('/api/market')
  const season = useApi<Season>('/api/season')
  const impact = useApi<Impact>('/api/impact')
  const tour = useApi<{ slot: { label: string; periodLabel?: string } | null }>('/api/fes/opportunity')
  const notices = useApi<PickupNotices>('/api/fes/notifications')
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null)
  if (!me) return null
  const quest = quests.data?.quests[0]
  const item = market.data?.items[0]
  const city = season.data?.city
  const progress = Math.min(100, Math.max(0, 100 * (me.xp - me.levelStart) / Math.max(1, me.levelEnd - me.levelStart)))
  return <Screen title={t(`Hallo ${me.name}`)} sub={t("Was möchtest du heute erledigen?")} tabs action={
    <span className="row"><button data-dashboard-tour="settings" className="icobtn" aria-label={t("Einstellungen")} onClick={() => navigate('/einstellungen')}><Icon name="settings" size={21} /></button><button data-dashboard-tour="notifications" className="icobtn notification-button" onClick={() => navigate('/mitteilungen')} aria-label={t(`Mitteilungen${notices.data?.unread ? `, ${notices.data.unread} ungelesen` : ''}${tour.data?.slot ? ', Sammeltour buchbar' : ''}`)}>
      <Icon name="bell" size={21} />{t((!!notices.data?.unread || !!tour.data?.slot) && <span className="notification-dot" />)}
    </button></span>
  }>
    {tourOpen && <DashboardTour onFinish={() => { finishDashboardTour(me.id); setTourOpen(false) }} />}
    <div className="card home-progress">
      <div className="row home-progress-top">
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
        <WeeklyGoal bare />
      </div>
    {/* Three doors, one line. They used to be full-width rows carrying a live
        subtitle each — a partner name, a Vytal account state — which made the
        top of the screen a stack of sentences to read before anything could be
        chosen. The detail still exists one tap inside each. Kalender joins them
        because it is the same kind of thing: somewhere to go, not news. */}
    <section>
      <p className="lbl" style={{ marginBottom: 9 }}>{t("Services")}</p>
      <div className="quick-grid">
        {SERVICES.map(s => (
          <button
            key={s.to}
            className="card quick-tile"
            aria-disabled={s.soon ? true : undefined}
            onClick={() => {
              // A service that is not open yet always explains itself; there
              // is nowhere to send anyone, so "seen once" does not apply.
              if (s.soon) return setService(s)
              // Known already? Go. Otherwise say what it is, once.
              if (seenServices().includes(s.to)) return navigate(s.to)
              markServiceSeen(s.to)
              setService(s)
            }}
            /* The tip is what the subtitle used to say. It shows on hover and
               on keyboard focus; a touch device has neither, and there it is
               not needed, because tapping the tile IS the explanation. The
               same sentence rides on aria-label so it is never sight-only. */
            data-tip={t(s.tip)}
            aria-label={`${t(s.label)} — ${t(s.tip)}`}
          >
            <Icon name={s.icon} size={23} />
            <span className="xs">{t(s.label)}</span>
          </button>
        ))}
      </div>
    </section>

    {t(service && (
      <DecisionSheet title={t(service.label)} onClose={() => setService(null)}>
        <p>{t(service.what)}</p>
        {t(service.go !== '' && <button className="btn primary" onClick={() => { const to = service.to; setService(null); navigate(to) }}>
          {t(service.go)}
        </button>)}
      </DecisionSheet>
    ))}
    <section><div className="between" style={{ marginBottom: 9 }}><p className="lbl">{t("In deiner Nähe")}</p></div>
      <div className="nearby-grid">
        <button className="card tight" onClick={() => navigate('/quests')}><Thumb icon="quest" /><b>{quest?.title ?? t('Quests entdecken')}</b><span className="xs mut">{t(quest ? `${quest.district ?? 'Frankfurt'} · +${quest.xp} XP` : 'Gemeinsam aufräumen')}</span></button>
        <button className="card tight" onClick={() => navigate(item ? `/markt/${item.id}` : '/markt')}><Thumb icon="wrench" /><b>{item?.title ?? t('Reparatur-Markt')}</b><span className="xs mut">{t(item?.district ?? 'Dinge weitergeben')}</span></button>
      </div>
    </section>
    {t((quests.error || market.error || tour.error || impact.error || season.error || notices.error) && <div className="card tight" role="alert"><p className="sm">{t("Einige Daten konnten nicht geladen werden.")}</p><button className="btn sm" onClick={() => { quests.reload(); market.reload(); tour.reload(); impact.reload(); season.reload(); notices.reload() }}>{t("Erneut laden")}</button></div>)}
    {t(city && <button className="card sky" onClick={() => navigate('/stadtteile')}><p className="lbl">{t("Frankfurt diese Woche")}</p><p className="sm"><b className="num" style={{ fontSize: 24 }}>{t(city.weekXp.toLocaleString(getLocale()))}</b> {t(" / ")}{t(city.goalXp.toLocaleString(getLocale()))} {t(" XP")}</p><Bar value={city.weekXp} max={city.goalXp} /></button>)}
    <button className="text-link dashboard-tour-replay" onClick={() => setTourOpen(true)}><Icon name="info" size={18} />{t('Dashboard kennenlernen')}</button>
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
