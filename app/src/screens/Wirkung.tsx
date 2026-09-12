import { t, getLocale } from './../lib/i18n'
import { BonusReceipts } from '../components/ReferenceActions'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'

import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import ShareBadge from '../components/ShareBadge'
import { Bar, Coin, Label, Tag, type Herkunft } from '../components/ui'
import { useApi, type Badge, type Impact, type Season } from '../lib/client'
import { de } from '../lib/de'
import { useSession } from '../lib/session'

/**
 * Wirkung — what one person has actually caused, and what the city has.
 *
 * The whole screen is built around one rule: a number and its provenance
 * are never separated. The three blocks under „Dein Beitrag" are the three
 * tiers, in that order and visibly apart — bestätigt from the ledger, deine
 * Angabe typed by the person, Schätzung computed from assumptions we print.
 * Mixing them into one grid of pretty figures would be the easy version and
 * also the dishonest one.
 *
 * The server does all of the arithmetic (`GET /api/impact`). Nothing here
 * adds up a point, and the CO₂ figure opens the receipts it was summed from.
 */

const kg = (value: number, digits = 1) =>
  value.toLocaleString(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })

const zahl = (value: number) => value.toLocaleString(getLocale())

const BADGE_ICON: Record<string, IconName> = {
  check: 'check',
  spark: 'spark',
  clock: 'clock',
}

export default function Wirkung() {
  const navigate = useNavigate()
  const { me } = useSession()
  const [share, setShare] = useState<Badge | null>(null)
  const impact = useApi<Impact>('/api/impact')
  const season = useApi<Season>('/api/season')

  if (!me) return null

  const data = impact.data
  const city = season.data?.city
  const saison = season.data?.season
  const problem = impact.error ?? season.error

  return (
    <Screen
      title={t("Wirkung")}
      tabs
      /* A tab AND a drill-in: the level tile on Start comes straight here,
         and arriving that way with no way back is the one navigation dead
         end in the app. Screen's back falls back to "/" when there is no
         history, so opening the tab directly still behaves. */
      back
      action={
        <button
          className="icobtn"
          onClick={() => navigate('/integrationen')}
          aria-label={t("Woher diese Zahlen kommen")}
        >
          <Icon name="info" size={21} />
        </button>
      }
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
              impact.reload()
              season.reload()
            }}
          >
            {t(de.action.retry)}
          </button>
        </div>
      ))}

      {t(impact.loading && !data && (
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{t(de.state.loading)}</p>
        </div>
      ))}

      {t(data && (
        <>
          <div className="impact-grid">
            <div className="card"><Icon name="check" size={21} /><Tag von="api" /><Stat wert={zahl(data.confirmed.actions)} label={t("Aktionen")} stark /></div>
            <div className="card"><Icon name="market" size={21} /><Tag von="input" /><Stat wert={zahl(data.stated.handedOver)} label={t("Dinge weitergegeben")} stark /></div>
            <div className="card"><Icon name="leaf" size={21} /><Tag von="estimate" /><Stat wert={`${kg(data.estimated.netCo2)} kg`} label={t("CO₂e netto vermieden")} stark /></div>
            <div className="card"><Icon name="clock" size={21} /><Tag von="api" /><Stat wert={zahl(data.streak.weeks)} label={t("Wochen in Folge")} stark /></div>
          </div>
          <details className="impact-details"><summary>{t("Dein Beitrag · Zahlen und Nachweise")}</summary><div className="col" style={{ gap: 12, marginTop: 12 }}>
          {/* --- bestätigt ------------------------------------------------ */}
          <div className="card">
            <div className="between" style={{ marginBottom: 12 }}>
              <p className="lbl" style={{ margin: 0 }}>
                {t("Dein Beitrag")}</p>
              <Tag von="api" icon />
            </div>

            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}
            >
              <Stat wert={zahl(data.confirmed.actions)} label={t("bestätigte Aktionen")} stark />
              <Stat wert={zahl(data.confirmed.xp)} label={t("XP gesamt")} stark />
              <Stat wert={zahl(data.confirmed.coins)} label={t("Münzen frei")} />
            </div>

            {t(data.confirmed.kinds.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 13 }}>
                {t(data.confirmed.kinds.map((k) => (
                  <Label key={k.kind}>
                    {t(k.count)}{t("× ")}{t(k.label)}
                  </Label>
                )))}
              </div>
            ))}

            {t(data.confirmed.actions === 0 && (
              <p className="sm mut" style={{ margin: '11px 0 0', lineHeight: 1.5 }}>
                {t("Hier steht noch nichts, weil du noch nichts gemacht hast. Ein Foto von etwas, das am Gehweg steht, ist der kürzeste Weg zur ersten Zeile.")}</p>
            ))}

            <div className="sep" style={{ margin: '13px 0 11px' }} />
            <div className="between" style={{ marginBottom: 6 }}>
              <span className="xs mut">
                {t("Level ")}{t(data.confirmed.level)} {t(" · noch")}{t(' ')}
                {t(zahl(Math.max(0, data.confirmed.levelEnd - data.confirmed.xp)))} {t(" XP bis Level")}{t(' ')}
                {t(data.confirmed.level + 1)}
              </span>
            </div>
            <Bar
              value={data.confirmed.xp - data.confirmed.levelStart}
              max={Math.max(1, data.confirmed.levelEnd - data.confirmed.levelStart)}
            />
          </div>

          {/* --- Schätzung ------------------------------------------------ */}
          <div className="card">
            <div className="between" style={{ marginBottom: 10 }}>
              <p className="lbl" style={{ margin: 0 }}>
                {t("CO₂e vermieden")}</p>
              <Tag von="estimate" icon />
            </div>

            <div className="row" style={{ alignItems: 'baseline', gap: 7 }}>
              <span className="num" style={{ fontSize: 30, color: 'var(--blue-deep)' }}>
                {t(kg(data.estimated.netCo2, 1))}
              </span>
              <span className="sm mut">{t("kg CO₂e netto")}</span>
            </div>

            <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.55 }}>
              {t(data.estimated.formula)}{t(". Anfahrt wird abgezogen, nicht weggelassen.")}</p>

            {t(data.estimated.note && (
              <p className="xs mut" style={{ margin: '7px 0 0', lineHeight: 1.55 }}>
                {t(data.estimated.note)}
              </p>
            ))}

            {t(data.estimated.contributions.length > 0 && (
              <>
                <div className="sep" style={{ margin: '12px 0 10px' }} />
                <p className="xs mut" style={{ margin: '0 0 8px' }}>
                  {t("Woraus sich das zusammensetzt — jede Zeile führt zu ihrem Nachweis:")}</p>
                <div className="col" style={{ gap: 7 }}>
                  {t(data.estimated.contributions.map((c) => (
                    <Link
                      key={c.actionId}
                      to={`/nachweis/${c.actionId}`}
                      className="between"
                      style={{ gap: 10, textDecoration: 'none', color: 'inherit' }}
                    >
                      <span className="sm grow" style={{ minWidth: 0 }}>
                        {t(c.title ?? c.label)}
                      </span>
                      <span className="sm num" style={{ color: 'var(--ink2)', flex: 'none' }}>
                        {t(c.netCo2 >= 0 ? '+' : '−')}
                        {t(kg(Math.abs(c.netCo2), 2))} {t(" kg")}</span>
                      <Icon name="chevron" size={16} className="ico" />
                    </Link>
                  )))}
                </div>
              </>
            ))}

            {t(data.estimated.assumptions.length > 0 && (
              <>
                <div className="sep" style={{ margin: '12px 0 10px' }} />
                <p className="xs mut" style={{ margin: '0 0 7px' }}>
                  {t("Gerechnet mit diesen offengelegten Annahmen:")}</p>
                <div className="col" style={{ gap: 6 }}>
                  {t(data.estimated.assumptions.map((a) => (
                    <p key={a.id} className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
                      <b style={{ color: 'var(--ink2)' }}>
                        {t(a.label)}{t(": ")}{t(a.value.toLocaleString(getLocale()))} {t(a.unit)}
                      </b>{t(' ')}
                      {t("— ")}{t(a.source)}
                    </p>
                  )))}
                </div>
              </>
            ))}
          </div>

          {/* --- deine Angabe --------------------------------------------- */}
          {t((data.stated.volumeM3 > 0 ||
            data.stated.handedOver > 0 ||
            data.stated.questsReported > 0) && (
            <div className="card">
              <div className="between" style={{ marginBottom: 11 }}>
                <p className="lbl" style={{ margin: 0 }}>
                  {t("Von dir angegeben")}</p>
                <Tag von="input" />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                  gap: 12,
                }}
              >
                <Stat wert={`${kg(data.stated.volumeM3, 1)} m³`} label={t("zur Abholung gemeldet")} />
                <Stat wert={zahl(data.stated.handedOver)} label={t("Dinge weitergegeben")} />
                <Stat wert={zahl(data.stated.questsReported)} label={t("Quests gemeldet")} />
              </div>
              <p className="xs mut" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                {t("Das Volumen hast du selbst angegeben. Wir haben es nicht nachgemessen und geben es deshalb nicht als gemessenen Wert aus.")}</p>
            </div>
          ))}

          {/* --- Wochen in Folge ------------------------------------------ */}
          <div className="card tight row" style={{ gap: 12 }}>
            <Spot icon="clock" />
            <span className="grow">
              <b className="sm" style={{ display: 'block' }}>
                {t(data.streak.weeks === 0
                  ? 'Noch keine Woche in Folge'
                  : `${data.streak.weeks} ${data.streak.weeks === 1 ? 'Woche' : 'Wochen'} in Folge aktiv`)}
              </b>
              <span className="xs mut">
                {t(data.streak.note ??
                  (data.streak.sinceLabel
                    ? `ununterbrochen seit ${data.streak.sinceLabel}`
                    : 'Eine Aktion pro Woche genügt — belohnt wird Regelmäßigkeit, nicht Menge.'))}
              </span>
            </span>
            <Tag von="api" />
          </div>

          {t(city && <p className="xs mut">{t(city.formula)}</p>)}
          </div></details>

          {/* --- Frankfurt zusammen --------------------------------------- */}
          {t(city && saison && (
            <button className="card sky" onClick={() => navigate('/stadtteile')}>
              <div className="between" style={{ marginBottom: 8 }}>
                <b className="h3">{t("Frankfurt diese Woche")}</b>
                <Tag von="api" icon />
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
                <span className="num" style={{ fontSize: 24, color: 'var(--blue-deep)' }}>
                  {t(zahl(city.weekXp))}
                </span>
                <span className="sm mut">{t("von ")}{t(zahl(city.goalXp))} {t(" XP Wochenziel")}</span>
              </div>
              <Bar value={city.weekXp} max={city.goalXp} />

              <div
                className="row"
                style={{ gap: 10, paddingTop: 11, marginTop: 11, borderTop: '1px solid var(--sky)' }}
              >
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b className="sm" style={{ display: 'block' }}>
                    {t("Saison ")}{t(saison.number)} {t(" · Woche ")}{t(saison.week)} {t(" von ")}{t(saison.weeks)}
                  </b>
                  <span className="xs mut">
                    {t("noch ")}{t(saison.daysLeft)} {t(saison.daysLeft === 1 ? 'Tag' : 'Tage')} {t(" · Stadtteile ansehen")}</span>
                </span>
                <Icon name="chevron" size={19} className="ico" />
              </div>
            </button>
          ))}

          {/* --- Abzeichen ------------------------------------------------ */}
          <div>
            <p className="lbl" style={{ marginBottom: 10 }}>
              {t("Abzeichen")}</p>
            <div className="badge-grid">
              {t(data.badges.map((b) => (
                <details key={b.id} className="card tight badge-card"><summary>
                  <span
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 13,
                      background: b.earned ? 'var(--sky)' : 'var(--paper)',
                      border: b.earned ? 'none' : '1.5px dashed var(--line)',
                      color: b.earned ? 'var(--blue-deep)' : 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <Icon name={BADGE_ICON[b.icon] ?? 'star'} size={21} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="sm" style={{ display: 'block' }}>
                      {t(b.title)}
                    </b>

                  </span>
                  </summary><p className="xs mut">{t(b.note)}</p>
                    {/* State and action on one line. Share only on a badge actually
                        earned — offering to brag about something not done yet is an
                        announcement nobody asked for. */}
                    <div className="badge-foot">
                      {t(b.earned ? (
                        <Tag von="api" icon>{t("erreicht")}</Tag>
                      ) : (
                        <span className="xs mut num">{t(b.value)}{t("/")}{t(b.goal)}</span>
                      ))}
                      {t(b.earned && (
                        <button className="btn ghost sm" onClick={() => setShare(b)}>
                          {t("Teilen")}
                        </button>
                      ))}
                    </div>
                </details>
              )))}
            </div>
          </div>

          <BonusReceipts />
          {/* --- Münzen --------------------------------------------------- */}
          {/* The row lives inside the button: `button.card` is display:block
              in the design system, so a `row` class on the button itself
              would be ignored. */}
          <button className="card tight" onClick={() => navigate('/belohnungen')}>
            <span className="row" style={{ gap: 11 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'var(--gold-soft)',
                  color: 'var(--gold-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="star" size={21} stroke={2} />
              </span>
              <span className="grow" style={{ textAlign: 'left' }}>
                <b className="sm" style={{ display: 'block' }}>
                  {t("Münzen einlösen")}</b>
                <span className="xs mut">
                  {t(data.confirmed.coins === 0
                    ? 'Noch nichts zu holen — die erste Aktion bringt die ersten Münzen.'
                    : 'Kaffee, Kurzstrecke, Reparaturbonus')}
                </span>
              </span>
              <Coin>{t(data.confirmed.coins)}</Coin>
            </span>
          </button>

          {/* Folded shut: a standing disclosure, not a thing to read every
              visit. It opens on a tap and costs no height until then. */}
          <details className="card dashed tight">
            <summary className="xs mut">{t("Woher diese Zahlen kommen")}</summary>
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {t(data.note)}
            </p>
          </details>
        </>
      ))}

      {t(share && (
        <ShareBadge
          badge={share}
          icon={BADGE_ICON[share.icon] ?? 'star'}
          onClose={() => setShare(null)}
        />
      ))}
    </Screen>
  )
}

function Stat({
  wert,
  label,
  von,
  stark = false,
}: {
  wert: string
  label: string
  von?: Herkunft
  stark?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="num"
        style={{ fontSize: 24, color: stark ? 'var(--blue-deep)' : 'var(--ink2)' }}
      >
        {t(wert)}
      </div>
      <div className="xs mut" style={{ marginTop: 2, lineHeight: 1.3 }}>
        {t(label)}
      </div>
      {t(von && (
        <div style={{ marginTop: 5 }}>
          <Tag von={von} />
        </div>
      ))}
    </div>
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
