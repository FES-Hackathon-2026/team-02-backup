import { t, getLocale } from './../lib/i18n'
import { InviteNeighbour } from '../components/ReferenceActions'
import { useState } from 'react'
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

const zahl = (value: number) => value.toLocaleString(getLocale())

export default function Stadtteile() {
  const [showAll, setShowAll] = useState(false)
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
      title={t("Stadtteile")}
      sub={t(data ? `Saison ${data.season.number} · Woche ${data.season.week} von ${data.season.weeks}` : undefined)}
      gap={12}
    >
      {t(problem && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            {t(problem.status === 0 ? de.state.offline : problem.message)}
          </span>
          <button
            className="btn sm"
            onClick={() => {
              season.reload()
              impact.reload()
            }}
          >
            {t(de.action.retry)}
          </button>
        </div>
      ))}

      {t(season.loading && !data && (
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{t(de.state.loading)}</p>
        </div>
      ))}

      {t(meiner && <div className="card district-goal"><p className="lbl">{t(rows[0]?.id === meiner.id ? 'Gemeinsam vorn' : 'Bis Platz 1')}</p><strong className="num">{t(zahl(Math.max(0, spitze - meiner.seasonXp)))} {t(" XP")}</strong><p className="sm mut">{t(rows[0]?.name)} {t(" führt · ")}{t(meiner.name)} {t(" auf Platz ")}{t(rows.findIndex(d => d.id === meiner.id) + 1)} {t(" von ")}{t(rows.length)}</p></div>)}
      {/* --- the season, and what the reset does ------------------------- */}
      {t(data && (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 8 }}>
            <b className="sm">
              {t("Saison ")}{t(data.season.number)} {t(" · ")}{t(data.season.startLabel)} {t(" bis ")}{t(data.season.endLabel)}
            </b>
            <Label>
              {t("noch ")}{t(data.season.daysLeft)} {t(data.season.daysLeft === 1 ? 'Tag' : 'Tage')}
            </Label>
          </div>
          <Bar
            value={data.season.weeks * 7 - data.season.daysLeft}
            max={data.season.weeks * 7}
          />
          <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.55 }}>
            {t(data.season.note)}
          </p>
        </div>
      ))}

      {/* --- own share, as a band ---------------------------------------- */}
      {t(meiner && (
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
                {t(meiner.name)}
              </b>
              <span className="xs mut" style={{ display: 'block', marginTop: 5 }}>
                {t(zahl(meiner.seasonXp))} {t(" XP diese Saison · ")}{t(meiner.people)}{t(' ')}
                {t(meiner.people === 1 ? 'Person' : 'Personen')} {t(" aktiv")}</span>
            </span>
          </div>

          <div className="sep" style={{ margin: '12px 0' }} />

          {t(band?.label ? (
            <>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span className="num" style={{ fontSize: 22, color: 'var(--blue-deep)' }}>
                  {t(band.label)}
                </span>
                <Tag von="api" />
              </div>
              <p className="xs mut" style={{ margin: '7px 0 0', lineHeight: 1.55 }}>
                {t(band.note)}
              </p>
            </>
          ) : (
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {t(band?.note ?? 'Dein Anteil erscheint, sobald die erste Aktion bestätigt ist.')}
            </p>
          ))}
        </div>
      ))}

      {t(rows.length > 8 && <button className="text-link" onClick={() => setShowAll(v => !v)}>{t(showAll ? 'Weniger Stadtteile' : `Alle ${rows.length} Stadtteile anzeigen`)}</button>)}
      {/* --- the table ---------------------------------------------------- */}
      {t(rows.length > 0 ? (
        <div className="card tight">
          <div className="between" style={{ marginBottom: 11 }}>
            <p className="lbl" style={{ margin: 0 }}>
              {t("Diese Saison")}</p>
            <Tag von="api" icon />
          </div>
          <div className="col" style={{ gap: 11 }}>
            {t((showAll ? rows : rows.slice(0, 8)).map((s, i) => {
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
                    {t(i + 1)}
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
                        {t(zahl(s.seasonXp))}
                      </span>
                    </span>
                    <span style={{ display: 'block', marginTop: 5 }}>
                      <Bar value={s.seasonXp} max={spitze} />
                    </span>
                    <span className="xs mut" style={{ display: 'block', marginTop: 4 }}>
                      {t(s.trendLabel)}
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
            }))}
          </div>
        </div>
      ) : (
        !season.loading && (
          <div className="empty">
            <p className="sm mut">
              {t("Noch hat kein Stadtteil Punkte. Die erste bestätigte Aktion eröffnet die Tabelle.")}</p>
          </div>
        )
      ))}

      {/* --- the retention engine ---------------------------------------- */}
      {t(steps.length > 0 && (
        <>
          <p className="lbl">{t("So kommt ")}{me.district.name} {t(" nach vorn")}</p>
          <div className="col" style={{ gap: 9 }}>
            {t(steps.map((step) => (
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
                      {t(step.title)}
                    </b>
                    <span className="xs mut">{t(step.detail)}</span>
                  </span>
                  <Coin>{t("+")}{t(step.xp)}</Coin>
                </span>
              </Link>
            )))}
          </div>
          {t(data?.home && (
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {t(data.home.xpNote)}
            </p>
          ))}
        </>
      ))}

      <div className="card dashed tight">
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
          {t(data?.note ??
            'Stadtteile werden verglichen, Personen nicht.')}{t(' ')}
          {t("Einzelne Personen werden nie gegeneinander gestellt — die eigene Position steht nur als Band, nie als Platz.")}</p>
      </div>
      <InviteNeighbour />
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
