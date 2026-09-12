import { t } from './../lib/i18n'
import { useEffect, useState } from 'react'

import { getLog, subscribeToLog, type LogEntry } from '../lib/api'
import { ASSUMPTIONS } from '../lib/impact'
import type { User } from '../lib/types'

const A = ASSUMPTIONS

const RULES: { ok: boolean; title: string; detail: string }[] = [
  {
    ok: true,
    title: 'Net, not gross',
    detail:
      'Travel is subtracted from the impact. Driving 12 km by car for 1 kg of food earns nothing.',
  },
  {
    ok: true,
    title: 'Sharing = rescuing',
    detail: `Offering a basket earns ${A.pointsForOffering} points, so the mechanic does not only reward taking.`,
  },
  {
    ok: true,
    title: 'Diminishing returns',
    detail: `From the third rescue at the same place on the same day, only ${A.repeatMultiplier * 100}% counts.`,
  },
  {
    ok: true,
    title: 'Daily limit',
    detail: `At most ${A.scoredActionsPerDay} scored actions per day. Volume is not rewarded.`,
  },
  {
    ok: true,
    title: 'Urgency first',
    detail: `Baskets close to expiry count ×${A.urgentMultiplier} — what gets rescued is what would otherwise be binned.`,
  },
  {
    ok: false,
    title: 'No self-rescue',
    detail: 'The API rejects your own baskets with 400. We show the error instead of hiding it.',
  },
  {
    ok: false,
    title: 'No double counting',
    detail: 'A basket can be picked up exactly once — otherwise the API answers 409.',
  },
  {
    ok: false,
    title: 'No leaderboard',
    detail: 'No ranking against others, only a shared goal. Competition breeds hoarding.',
  },
  {
    ok: false,
    title: 'No streak pressure',
    detail: 'A break is not punished. Reminders only exist if the user sets them.',
  },
]

function useLog(): readonly LogEntry[] {
  const [, force] = useState(0)
  useEffect(() => subscribeToLog(() => force((n) => n + 1)), [])
  return getLog()
}

interface Props {
  user: User | null
}

export default function Fair({ user }: Props) {
  const log = useLog()
  const v = user?.verification

  return (
    <div className="screen" id="panel-fair" role="tabpanel">
      <h2>{t("Why you cannot farm this")}</h2>
      <div className="card">
        {t(RULES.map((r) => (
          <div
            key={r.title}
            style={{
              display: 'flex',
              gap: 10,
              padding: '11px 0',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                flex: '0 0 26px',
                height: 26,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 14,
                background: r.ok ? 'var(--accent-soft)' : 'var(--bad-soft)',
                color: r.ok ? 'var(--accent)' : 'var(--bad)',
              }}
            >
              {t(r.ok ? '✓' : '✕')}
            </div>
            <div>
              <b style={{ fontSize: 14 }}>{t(r.title)}</b>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {t(r.detail)}
              </div>
            </div>
          </div>
        )))}
      </div>

      <h2>
        {t("Verification level ")}<span className="pv pv-api">{t("API")}</span>
      </h2>
      <div className="card">
        {t(v ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <b style={{ flex: 1 }}>{t(v.status)}</b>
              <span className={`pv ${v.is_verified ? 'pv-api' : 'pv-input'}`}>
                {t(v.is_verified ? 'verified' : 'open')}
              </span>
            </div>
            <div className="tiny muted">
              {t("Quiz: ")}{t(v.quiz_passed ? 'passed' : 'open')} {t(" · Trial pickups:")}{t(' ')}
              {t(v.trial_pickups_completed)}{t("/")}{t(v.trial_pickups_required)} {t(" · Approval:")}{t(' ')}
              {t(v.mentor_approved ? 'granted' : 'open')}
              {t(v.next_step && (
                <>
                  <br />
                  {t(v.next_step)}
                </>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 8 }}>
              {t("Reward is weighted by verification level: without it ×")}{t(A.unverifiedWeight)}{t(", with it ×1.0.")}</div>
          </>
        ) : (
          <div className="small muted">{t("No user loaded.")}</div>
        ))}
      </div>

      {/* TODO(#5): the "try to cheat" buttons — pick up your own basket (400),
          pick up twice (409), business rescue while unverified (403). They are
          the most convincing part of the demo: the refusal comes from the
          server, not from our code. */}

      <h2>{t("Documented assumptions")}</h2>
      <div className="card tiny" style={{ lineHeight: 1.8 }}>
        <b>{t("Not from any interface — our own values, disclosed here:")}</b>
        <br />{t("• ")}{t(A.foodCo2PerKg)} {t(" kg CO₂e per kg of rescued food (mixed basket)")}<br />{t("• Car ")}{t(A.carCo2PerKg)} {t(" kg CO₂e/km · transit ")}{t(A.transitCo2PerKm)} {t(" kg CO₂e/km · bike and walking 0")}<br />{t("• Route = straight line × ")}{t(A.detourFactor)} {t(" (detour factor) × ")}{t(A.roundTrip)} {t(" (there and back)")}<br />{t("• On a known route only the detour is charged, because the trip happens anyway")}<br />{t("• ")}{t(A.pointsPerKgCo2)} {t(" points per kg CO₂e · daily limit ")}{t(A.scoredActionsPerDay)} {t(" · offering ")}{t(A.pointsForOffering)} {t(" points")}<br />
        <b>{t("From the API:")}</b> {t(" locations, basket data, expires_at, pickup id and time, verification status.")}<br />
        <b>{t("From the user:")}</b> {t(" amount in kg and travel mode — neither is verifiable, so neither is ever shown as a measurement.")}</div>

      <h2>{t("Proof log — every HTTP call")}</h2>
      <div className="card">
        <div className="log">
          {t(log.length === 0
            ? '—'
            : log.slice(0, 20).map((e, i) => (
                <div key={i}>
                  <span className={e.status >= 200 && e.status < 300 ? 'ok' : 'err'}>
                    {t(e.status || 'ERR')}
                  </span>{t(' ')}
                  {t(e.method)} {t(e.path)}
                  {t(e.userId !== null && ` [X-User-ID: ${e.userId}]`)} {t(e.ms)}{t("ms")}</div>
              )))}
        </div>
      </div>
    </div>
  )
}
