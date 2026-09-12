import { Link } from 'react-router-dom'

import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import { Bar, Coin, Label, Tag } from '../components/ui'
import { useApi, type Impact, type Season, type Trend } from '../lib/client'
import { de } from '../lib/de'
import { useSession } from '../lib/session'

/**
 * Stadtteile — the table that compares places, never people.
 *
 * Two rules from the plan shape this screen more than the layout does:
 *
 *   no ranking of persons   the person's own position is a band
 *                           („aktivste 12 %"), and there is no view
 *                           anywhere that lists people by points
 *   one city total          the table shows where there is room left,
 *                           and every point still counts towards the
 *                           same weekly city goal
 *
 * The part that actually brings someone back is at the bottom: three
 * concrete next steps, each built from rows that are genuinely open right
 * now — „drei offene Quests, nächste 620 m, +250" beats „du bist Siebter"
 * every time. The server builds them (`GET /api/season`), because the XP
 * beside them come from the engine's BASE_XP and not from this file.
 */

const TREND: Record<Trend, { icon: IconName; farbe: string }> = {
  up: { icon: 'up', farbe: 'var(--blue-deep)' },
  down: { icon: 'down', farbe: 'var(--alert)' },
  flat: { icon: 'flat', farbe: 'var(--ink3)' },
  new: { icon: 'spark', farbe: 'var(--gold-ink)' },
}

const STEP_ICON: Record<string, IconName> = {
  quest: 'quest',
  shield: 'shield',
  wrench: 'wrench',
  camera: 'camera',
}

const zahl = (value: number) => value.toLocaleString('de-DE')

export default function Stadtteile() {
  const { me } = useSession()
  const season = useApi<Season>('/api/season')
  const impact = useApi<Impact>('/api/impact')

  if (!me) return null

  const data = season.data
  const rows = data?.districts ?? []
  const meiner = rows.find((s) => s.id === me.district.id)
  const spitze = rows[0]?.seasonXp ?? 1
  const band = impact.data?.percentile
  const steps = data?.home?.nextSteps ?? []
  const problem = season.error ?? impact.error

  return (
    <Screen
      back
      title="Stadtteile"
      sub={data ? `Saison ${data.season.number} · Woche ${data.season.week} von ${data.season.weeks}` : undefined}
      gap={12}
    >
      {problem && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            {problem.status === 0 ? de.state.offline : problem.message}
          </span>
          <button
            className="btn sm"
            onClick={() => {
              season.reload()
              impact.reload()
            }}
          >
            {de.action.retry}
          </button>
        </div>
      )}

      {season.loading && !data && (
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{de.state.loading}</p>
        </div>
      )}

      {/* --- the season, and what the reset does ------------------------- */}
      {data && (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 8 }}>
            <b className="sm">
              Saison {data.season.number} · {data.season.startLabel} bis {data.season.endLabel}
            </b>
            <Label>
              noch {data.season.daysLeft} {data.season.daysLeft === 1 ? 'Tag' : 'Tage'}
            </Label>
          </div>
          <Bar
            value={data.season.weeks * 7 - data.season.daysLeft}
            max={data.season.weeks * 7}
          />
          <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.55 }}>
            {data.season.note}
          </p>
        </div>
      )}

      {/* --- own share, as a band ---------------------------------------- */}
      {meiner && (
        <div className="card" style={{ borderColor: 'var(--blue)', background: 'var(--sky2)' }}>
          <div className="row" style={{ gap: 14 }}>
            <span
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                background: 'var(--blue-deep)',
                color: 'var(--on-blue)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
              }}
            >
              <Icon name="pin" size={26} />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="h2" style={{ display: 'block' }}>
                {meiner.name}
              </b>
              <span className="xs mut" style={{ display: 'block', marginTop: 5 }}>
                {zahl(meiner.seasonXp)} XP diese Saison · {meiner.people}{' '}
                {meiner.people === 1 ? 'Person' : 'Personen'} aktiv
              </span>
            </span>
          </div>

          <div className="sep" style={{ margin: '12px 0' }} />

          {band?.label ? (
            <>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span className="num" style={{ fontSize: 22, color: 'var(--blue-deep)' }}>
                  {band.label}
                </span>
                <Tag von="api" />
              </div>
              <p className="xs mut" style={{ margin: '7px 0 0', lineHeight: 1.55 }}>
                {band.note}
              </p>
            </>
          ) : (
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {band?.note ?? 'Dein Anteil erscheint, sobald die erste Aktion bestätigt ist.'}
            </p>
          )}
        </div>
      )}

      {/* --- the table ---------------------------------------------------- */}
      {rows.length > 0 ? (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 11 }}>
            <p className="lbl" style={{ margin: 0 }}>
              Diese Saison
            </p>
            <Tag von="api" icon />
          </div>
          <div className="col" style={{ gap: 11 }}>
            {rows.slice(0, 8).map((s, i) => {
              const mine = s.id === me.district.id
              const trend = TREND[s.trend] ?? TREND.flat
              return (
                <div key={s.id} className="row" style={{ gap: 11 }}>
                  <span
                    className="num"
                    style={{
                      width: 18,
                      fontSize: 14,
                      color: mine ? 'var(--blue-deep)' : 'var(--ink3)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="between">
                      <b className="sm" style={mine ? { color: 'var(--blue-deep)' } : undefined}>
                        {s.name}
                      </b>
                      <span
                        className="sm num"
                        style={mine ? { color: 'var(--blue-deep)' } : undefined}
                      >
                        {zahl(s.seasonXp)}
                      </span>
                    </span>
                    <span style={{ display: 'block', marginTop: 5 }}>
                      <Bar value={s.seasonXp} max={spitze} />
                    </span>
                    <span className="xs mut" style={{ display: 'block', marginTop: 4 }}>
                      {s.trendLabel}
                    </span>
                  </span>
                  <Icon
                    name={trend.icon}
                    size={15}
                    stroke={2.4}
                    style={{ color: trend.farbe, flex: 'none' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        !season.loading && (
          <div className="empty">
            <p className="sm mut">
              Noch hat kein Stadtteil Punkte. Die erste bestätigte Aktion eröffnet die Tabelle.
            </p>
          </div>
        )
      )}

      {/* --- the retention engine ---------------------------------------- */}
      {steps.length > 0 && (
        <>
          <p className="lbl">So kommt {me.district.name} nach vorn</p>
          <div className="col" style={{ gap: 9 }}>
            {steps.map((step) => (
              <Link
                key={step.id}
                to={step.to}
                className="card tight"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {/* `a.card` is display:block in the design system, so the row
                    has to sit inside rather than on the link itself. */}
                <span className="row" style={{ gap: 11 }}>
                  <Spot icon={STEP_ICON[step.icon] ?? 'quest'} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="sm" style={{ display: 'block' }}>
                      {step.title}
                    </b>
                    <span className="xs mut">{step.detail}</span>
                  </span>
                  <Coin>+{step.xp}</Coin>
                </span>
              </Link>
            ))}
          </div>
          {data?.home && (
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {data.home.xpNote}
            </p>
          )}
        </>
      )}

      <div className="card dashed tight">
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
          {data?.note ??
            'Stadtteile werden verglichen, Personen nicht.'}{' '}
          Einzelne Personen werden nie gegeneinander gestellt — die eigene Position steht nur als
          Band, nie als Platz.
        </p>
      </div>
    </Screen>
  )
}

function Spot({ icon }: { icon: IconName }) {
  return (
    <span
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        background: 'var(--sky)',
        color: 'var(--blue-deep)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <Icon name={icon} size={20} />
    </span>
  )
}
