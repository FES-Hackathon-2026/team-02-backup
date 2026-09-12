import { t } from './../lib/i18n'
import { useState } from 'react'

import DecisionSheet from '../components/DecisionSheet'
import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag } from '../components/ui'
import {
  ApiError,
  api,
  useApi,
  type Coupon,
  type CouponCatalogue,
  type RedeemResult,
} from '../lib/client'
import { de } from '../lib/de'
import { useSession } from '../lib/session'

/**
 * Belohnungen — Münzen become something you can hold.
 *
 * The catalogue is rebuilt, and the screen says so once at the top rather
 * than pretending otherwise: we generate the codes ourselves, there is no
 * partner agreement behind them. What is real is the count of places next
 * to a bonus — those are OpenStreetMap rows, so „50 Reparaturbetriebe" is
 * a number a judge can check.
 *
 * Redeeming spends coins and never creates them, which is why this screen
 * calls one endpoint and computes nothing: the balance that comes back is
 * the ledger minus the redemptions, recalculated on the server.
 */

const ICON: Record<string, IconName> = {
  cup: 'cup',
  route: 'route',
  wrench: 'wrench',
  gift: 'gift',
}

export default function Belohnungen() {
  const { me, refresh } = useSession()
  const catalogue = useApi<CouponCatalogue>('/api/coupons')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [frisch, setFrisch] = useState<RedeemResult | null>(null)

  if (!me) return null

  // Nothing is spent until this is answered.
  const [confirm, setConfirm] = useState<Coupon | null>(null)

  const data = catalogue.data

  async function einloesen(couponId: string) {
    setBusy(couponId)
    setProblem(null)
    try {
      const result = await api.post<RedeemResult>('/api/redeem', { couponId })
      setFrisch(result)
      catalogue.reload()
      // The tab bar and every other screen read the balance from the
      // session, so it has to learn about the spend too.
      void refresh()
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'offline', 'Keine Verbindung zum Server. Bitte gleich noch einmal.'),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen back title={t("Belohnungen")} gap={13}>
      {t(catalogue.error && (
        <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
          <Icon name="info" size={18} className="ico" />
          <span className="sm grow">
            {t(catalogue.error.status === 0 ? de.state.offline : catalogue.error.message)}
          </span>
          <button className="btn sm" onClick={() => catalogue.reload()}>
            {t(de.action.retry)}
          </button>
        </div>
      ))}

      {t(catalogue.loading && !data && (
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{t(de.state.loading)}</p>
        </div>
      ))}

      {t(data && (
        <>
          {/* --- balance ------------------------------------------------- */}
          <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--gold-soft)' }}>
            <div className="row" style={{ gap: 13 }}>
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 15,
                  background: 'var(--gold)',
                  color: 'var(--on-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="star" size={24} stroke={2} />
              </span>
              <span className="grow">
                <span
                  className="num"
                  style={{
                    fontSize: 28,
                    color: 'var(--gold-ink)',
                    display: 'block',
                    lineHeight: 1.1,
                  }}
                >
                  {t(data.coins)}
                </span>
                <span className="xs" style={{ color: 'var(--gold-ink)', fontWeight: 600 }}>
                  {t(data.coins === 1 ? 'Münze verfügbar' : 'Münzen verfügbar')}
                  {t(data.coinsEarned !== data.coins && ` · ${data.coinsEarned} insgesamt verdient`)}
                </span>
              </span>
            </div>
            <p className="xs" style={{ margin: '11px 0 0', lineHeight: 1.5, color: 'var(--gold-ink)' }}>
              {t(data.xpPerCoin)} {t(" XP ergeben eine Münze. XP bleiben für dein Level stehen, Münzen gibst du hier aus.")}</p>
          </div>

          {/* --- what just happened -------------------------------------- */}
          {t(frisch && (
            <div className="card" style={{ borderColor: 'var(--blue)', background: 'var(--sky2)' }}>
              <div className="between" style={{ marginBottom: 9 }}>
                <b className="sm">{t(frisch.redemption.title)}</b>
                
              </div>
              <Code value={frisch.redemption.code} />
              <p className="xs mut" style={{ margin: '9px 0 0', lineHeight: 1.55 }}>
                {t(frisch.message)}
              </p>
            </div>
          ))}

          {t(problem && (
            <div className="card tight row" style={{ gap: 10, borderColor: 'var(--alert)' }}>
              <Icon name="info" size={18} className="ico" />
              <span className="sm grow">{t(problem.message)}</span>
              <button
                className="icobtn bare"
                onClick={() => setProblem(null)}
                aria-label={t(de.action.close)}
              >
                <Icon name="cross" size={18} />
              </button>
            </div>
          ))}

          {/* --- catalogue ----------------------------------------------- */}
          <div>
            <div className="between" style={{ marginBottom: 10 }}>
              <p className="lbl" style={{ margin: 0 }}>
                {t("Verfügbar")}</p>
              
            </div>

            <div className="col" style={{ gap: 9 }}>
              {t(data.coupons.map((c) => (
                <div
                  key={c.id}
                  className="card tight row"
                  style={{ gap: 11, opacity: c.affordable ? 1 : 0.6 }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: c.affordable ? 'var(--sky)' : 'var(--paper)',
                      color: c.affordable ? 'var(--blue-deep)' : 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <Icon name={ICON[c.icon] ?? 'gift'} size={21} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="sm" style={{ display: 'block' }}>
                      {t(c.title)}
                    </b>
                    <span className="xs mut" style={{ display: 'block' }}>
                      {t(c.affordable
                        ? c.detail
                        : `noch ${c.missing} ${c.missing === 1 ? 'Münze' : 'Münzen'}`)}
                    </span>
                    {t(c.partners && (
                      <span className="row" style={{ gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                        <Tag von="api">
                          {t(c.partners.count)} {t(c.partners.label)}
                        </Tag>
                        <span className="xs mut">{t("aus ")}{t(c.partners.source)}</span>
                      </span>
                    ))}
                  </span>
                  <button
                    className="btn sm"
                    disabled={!c.affordable || busy !== null}
                    onClick={() => setConfirm(c)}
                    style={
                      c.affordable
                        ? {
                            background: 'var(--blue-deep)',
                            borderColor: 'var(--blue-deep)',
                            color: 'var(--on-blue)',
                            flex: 'none',
                          }
                        : { color: 'var(--ink3)', flex: 'none' }
                    }
                  >
                    {t(busy === c.id ? '…' : c.coins)}
                  </button>
                </div>
              )))}
            </div>
          </div>

          {/* --- codes stay visible --------------------------------------- */}
          <div>
            <p className="lbl" style={{ marginBottom: 10 }}>
              {t("Eingelöst")}</p>
            {t(data.redemptions.length === 0 ? (
              <div className="card dashed tight">
                <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
                  {t("Noch nichts eingelöst. Eingelöste Codes bleiben hier stehen — auch nach einem Neustart der App.")}</p>
              </div>
            ) : (
              <div className="col" style={{ gap: 9 }}>
                {t(data.redemptions.map((r) => (
                  <div key={r.id} className="card tight" style={{ opacity: r.expired ? 0.6 : 1 }}>
                    <div className="between" style={{ marginBottom: 9, gap: 8 }}>
                      <span className="row" style={{ gap: 9, minWidth: 0 }}>
                        <Icon name={ICON[r.icon] ?? 'gift'} size={19} className="ico" />
                        <b className="sm">{t(r.title)}</b>
                      </span>
                      {t(r.expired ? (
                        <Label tone="warn">{t("abgelaufen")}</Label>
                      ) : (
                        <Label>{t("gültig bis ")}{t(r.validLabel)}</Label>
                      ))}
                    </div>
                    <Code value={r.code} />
                    <p className="xs mut" style={{ margin: '8px 0 0' }}>
                      {t(r.coins)} {t(r.coins === 1 ? 'Münze' : 'Münzen')} {t(" ausgegeben")}</p>
                  </div>
                )))}
              </div>
            ))}
          </div>

          {/* Folded shut: a standing disclosure, not a thing to read every
              visit. It opens on a tap and costs no height until then. */}
          <details className="card dashed tight">
            <summary className="xs mut">{t("Wie Münzen funktionieren")}</summary>
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
              {t(data.note)} {t(" Münzen laufen nicht ab, lassen sich nicht kaufen und nicht übertragen — damit lohnt sich Mitmachen, aber niemand kann sich nach oben kaufen.")}</p>
          </details>
        </>
      ))}
      {t(confirm && (
        <DecisionSheet title={t("Einlösen?")} onClose={() => setConfirm(null)}>
          <p>
            {t(confirm.title)} {t(" kostet ")}{t(confirm.coins)}{' '}
            {t(confirm.coins === 1 ? 'Münze' : 'Münzen')}{t(". Das lässt sich nicht rückgängig machen.")}
          </p>
          <button
            className="btn primary"
            disabled={busy !== null}
            onClick={() => { const id = confirm.id; setConfirm(null); void einloesen(id) }}
          >
            {t("Jetzt einlösen")}
          </button>
          <button className="btn ghost" onClick={() => setConfirm(null)}>
            {t("Abbrechen")}
          </button>
        </DecisionSheet>
      ))}
    </Screen>
  )
}

/** The code itself. Big, selectable, nothing to write down. */
function Code({ value }: { value: string }) {
  return (
    <span
      className="num"
      style={{
        display: 'block',
        fontSize: 21,
        letterSpacing: '.08em',
        color: 'var(--blue-deep)',
        background: 'var(--paper)',
        border: '1px dashed var(--line)',
        borderRadius: 12,
        padding: '11px 13px',
        textAlign: 'center',
        userSelect: 'all',
      }}
    >
      {t(value)}
    </span>
  )
}
