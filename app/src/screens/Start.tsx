import { useNavigate } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import CollectionOpportunity from '../components/CollectionOpportunity'
import { Bar, Coin, Label, Tag, Thumb } from '../components/ui'
import {
  useApi,
  type FesCalendar,
  type PickupNotices,
  type MarketItem,
  type Quest,
  type Season,
} from '../lib/client'
import { useSession } from '../lib/session'

export default function Start() {
  const navigate = useNavigate()
  const { me, signOut } = useSession()
  const quests = useApi<{ quests: Quest[] }>('/api/quests')
  const market = useApi<{ items: MarketItem[] }>('/api/market')
  const season = useApi<Season>('/api/season')
  const kalender = useApi<FesCalendar>('/api/fes/calendar')
  const notices = useApi<PickupNotices>('/api/fes/notifications')

  if (!me) return null

  const quest = quests.data?.quests[0]
  const item = market.data?.items[0]
  // The real collection calendar for this Stadtteil, not a fixture. It is
  // still a rebuilt service, so the line below says „simuliert" — but the
  // date, the fraction and the cycle are the ones phase 5 computes.
  const naechste = kalender.data?.dates[0] ?? null

  const spanne = me.levelEnd - me.levelStart
  const imLevel = me.xp - me.levelStart
  const grad = spanne > 0 ? (imLevel / spanne) * 360 : 0
  // The weekly goal is computed by the server from how many people are
  // actually active and what the city managed last week — not a round
  // number picked here. Phase 10 owns both the figure and its formula.
  const city = season.data?.city ?? null

  return (
    <Screen
      title={`Moin, ${me.name}`}
      sub={`Level ${me.level} · ${me.district.name}`}
      tabs
      action={
        <button className="icobtn" onClick={() => navigate('/mitteilungen')} aria-label="Mitteilungen">
          <Icon name="bell" size={21} />
        </button>
      }
    >
      <div className="between">
        <button className="btn sm" onClick={() => navigate('/mitteilungen')}>Mitteilungen {notices.data?.unread ? `(${notices.data.unread})` : ''}</button>
        <button className="btn sm" onClick={() => void signOut()}>Abmelden</button>
      </div>
      {kalender.data?.dates.find(d => d.own) && <button className="card sky" onClick={() => navigate(`/abholung/${kalender.data!.dates.find(d => d.own)!.pickupId}`)}>
        <div className="between"><b>Deine nächste Abholung</b><Tag von="simulated" /></div>
        <p className="sm">{kalender.data.dates.find(d => d.own)!.label} · {kalender.data.dates.find(d => d.own)!.window}</p>
        <span className="xs mut">Details, Gegenstände und Erinnerungen</span>
      </button>}
      <CollectionOpportunity />
      <button className="btn" onClick={() => navigate('/touren')}>{me.role === 'driver' ? 'Meine Sammeltouren' : 'Fahrer:innen-Ansicht · Demo'}</button>
      {/* progress — the only place the reward colour appears on this screen */}
      <div className="card row" style={{ gap: 14 }}>
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: '50%',
            flex: 'none',
            background: `conic-gradient(var(--blue-deep) 0 ${grad}deg, var(--sky) ${grad}deg 360deg)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="num" style={{ fontSize: 20, color: 'var(--blue-deep)' }}>
              {me.level}
            </span>
          </div>
        </div>

        <div className="grow">
          <div className="between" style={{ marginBottom: 5 }}>
            <span className="h3">
              {me.xp.toLocaleString('de-DE')} / {me.levelEnd.toLocaleString('de-DE')} XP
            </span>
            <Coin star>{me.coins}</Coin>
          </div>
          <div className="sm mut">
            {me.xp === 0 ? (
              <>Noch keine Aktion — das Foto unten ist der Anfang.</>
            ) : (
              <>
                Noch {(me.levelEnd - me.xp).toLocaleString('de-DE')} XP bis{' '}
                <b style={{ color: 'var(--ink)' }}>Level {me.level + 1}</b>
              </>
            )}
          </div>
          <div className="row xs mut" style={{ gap: 6, marginTop: 6 }}>
            <span className="dot" style={{ background: 'var(--blue)' }} />
            {me.actions} bestätigte {me.actions === 1 ? 'Aktion' : 'Aktionen'}
          </div>
        </div>
      </div>

      {/* the one hero action of the whole app */}
      <button
        className="card row"
        onClick={() => navigate('/scan')}
        style={{
          gap: 13,
          border: 'none',
          background: 'var(--blue-deep)',
          color: 'var(--on-blue)',
          padding: '17px 16px',
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'rgba(255,255,255,.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Icon name="camera" size={23} />
        </span>
        <span className="grow">
          <span className="h2" style={{ display: 'block', color: 'inherit' }}>
            Foto machen
          </span>
          <span className="sm" style={{ display: 'block', color: 'var(--on-blue2)', marginTop: 2 }}>
            Sperrmüll, Fundstück oder Frage — ReMain ordnet es ein
          </span>
        </span>
        <Icon name="chevron" size={20} style={{ color: 'var(--on-blue3)' }} />
      </button>

      {naechste && (
        <button className="card tight row" onClick={() => navigate('/kalender')} style={{ gap: 12 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--sky)',
              color: 'var(--blue-deep)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="calendar" size={21} />
          </span>
          <span className="grow">
            <span className="sm" style={{ display: 'block', fontWeight: 700 }}>
              {naechste.titel} · {naechste.label}
            </span>
            <span className="xs mut" style={{ display: 'block' }}>
              {naechste.window} · Abfuhrtermine für {me.district.name}{' '}
              <Tag von="simulated" />
            </span>
          </span>
          <Icon name="chevron" size={20} className="ico" />
        </button>
      )}

      <div>
        <div className="between" style={{ marginBottom: 9 }}>
          <p className="lbl">In deiner Nähe</p>
          <button
            className="xs"
            onClick={() => navigate('/quests')}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--blue-deep)',
              fontWeight: 700,
              padding: 0,
            }}
          >
            Alle Quests
          </button>
        </div>

        <div className="col" style={{ gap: 9 }}>
          {quests.loading && (
            <div className="empty">
              <span className="spinner" />
            </div>
          )}

          {quest && (
            <button className="card tight row" onClick={() => navigate('/quests')} style={{ gap: 11 }}>
              <Thumb icon="quest" />
              <span className="grow">
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <b className="sm">{quest.title}</b>
                  {quest.openForDays >= 3 && (
                    <Label tone="warn">seit {quest.openForDays} Tagen</Label>
                  )}
                </span>
                <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                  {quest.district ?? 'Frankfurt'}
                  {quest.distanceKm !== undefined && ` · ${quest.distanceKm.toLocaleString('de-DE')} km`}
                </span>
              </span>
              <Coin>+{quest.xp}</Coin>
            </button>
          )}

          {item && (
            <button className="card tight row" onClick={() => navigate('/markt')} style={{ gap: 11 }}>
              <Thumb icon="wrench" />
              <span className="grow">
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <b className="sm">{item.title}</b>
                  <Tag von="input">{item.defect}</Tag>
                </span>
                <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                  {item.district} · kostenlos abzugeben
                </span>
              </span>
              <Icon name="chevron" size={19} className="ico" />
            </button>
          )}

          {/* A real failure gets a real sentence — the phase marker that used
              to stand here made a working screen look unfinished. */}
          {quests.error && (
            <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
              <Icon name="info" size={18} className="ico" />
              <span className="sm grow">
                {quests.error.status === 0
                  ? 'Keine Verbindung zum Server. Die Quests erscheinen, sobald du wieder online bist.'
                  : quests.error.message}
              </span>
              <button className="btn sm" onClick={() => quests.reload()}>
                Nochmal versuchen
              </button>
            </div>
          )}
        </div>
      </div>

      {city && (
        <button className="card sky" onClick={() => navigate('/stadtteile')}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="h3">Frankfurt diese Woche</span>
            <Tag von="api" icon />
          </div>
          <div className="row" style={{ alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
            <span className="num" style={{ fontSize: 24, color: 'var(--blue-deep)' }}>
              {city.weekXp.toLocaleString('de-DE')}
            </span>
            <span className="sm mut">
              von {city.goalXp.toLocaleString('de-DE')} XP Wochenziel
            </span>
          </div>
          <Bar value={city.weekXp} max={city.goalXp} />
          <p className="xs mut" style={{ margin: '8px 0 0', textAlign: 'left' }}>
            {city.activePeople} {city.activePeople === 1 ? 'Person' : 'Personen'} aktiv · Ziel und
            Rechenweg auf der Stadtteil-Seite
          </p>
        </button>
      )}
    </Screen>
  )
}
