import { t, getLocale } from './../lib/i18n'
import MarketPhoto from '../components/MarketPhoto'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag } from '../components/ui'
import { ApiError, api, useApi, type MarketDetail } from '../lib/client'
import { useSession } from '../lib/session'

/**
 * Phase 6 — one offer, and the handover both sides have to confirm.
 *
 * The two confirmations are the whole point. One person pressing a button is
 * a claim; two people pressing it is evidence, and only then does anything
 * reach the ledger. Nothing on this screen has a price.
 */


/** The state chain, visible rather than implied. */
const KETTE = [
  { id: 'open', label: 'eingestellt' },
  { id: 'reserved', label: 'reserviert' },
  { id: 'handed_over', label: 'übergeben' },
] as const

export default function MarktDetail() {
  const { id } = useParams()
  const { refresh } = useSession()

  const load = useApi<MarketDetail>(`/api/market/${id}`)
  // A write answers with the whole new state, so the screen never has to
  // guess what changed — it just renders the newer of the two.
  const [live, setLive] = useState<MarketDetail | null>(null)
  const [fenster, setFenster] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const d = live ?? load.data

  async function schreiben(pfad: string, body?: unknown) {
    setBusy(pfad)
    setFehler(null)
    try {
      const res = await api.post<MarketDetail>(`/api/market/${id}/${pfad}`, body)
      setLive(res)
      // A credit changes the XP in the tab bar — pull the new totals.
      if (res.award) void refresh()
    } catch (e) {
      setFehler(e instanceof ApiError ? e.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  if (load.loading && !d) {
    return (
      <Screen back title={t("Angebot")} sub={t("Reparatur-Markt")}>
        <div className="empty">
          <span className="spinner" />
        </div>
      </Screen>
    )
  }

  if (!d) {
    return (
      <Screen back title={t("Angebot")} sub={t("Reparatur-Markt")}>
        <div className="empty">
          <Icon name="market" size={26} />
          {t(load.error?.message ?? 'Dieses Angebot gibt es nicht.')}
        </div>
      </Screen>
    )
  }

  const { item, handover, role } = d
  const ichBinDran = role === 'owner' ? !handover.owner : !handover.claimer
  const andereOffen = role === 'owner' ? !handover.claimer : !handover.owner
  const gegenueber = (role === 'owner' ? item.claimerName : item.ownerName) ?? 'die andere Seite'
  const stand = KETTE.findIndex((k) => k.id === item.status)

  return (
    <Screen
      back
      title={item.title}
      sub={t(`${item.district ?? 'Frankfurt'} · kostenlos abzugeben`)}
      footer={
        item.status === 'reserved' && role !== 'visitor' ? (
          <button
            className="btn primary"
            disabled={busy !== null || !ichBinDran}
            onClick={() => void schreiben('handover')}
          >
            {t(busy === 'handover' ? (
              <span className="spinner" />
            ) : ichBinDran ? (
              <>
                <Icon name="check" size={18} stroke={2.4} />
                {t("Übergabe bestätigen")}</>
            ) : (
              `Bestätigt — es fehlt noch ${gegenueber}`
            ))}
          </button>
        ) : item.status === 'open' && role === 'visitor' ? (
          <button
            className="btn primary"
            disabled={busy !== null}
            onClick={() => void schreiben('claim', fenster ? { window: fenster } : undefined)}
          >
            {t(busy === 'claim' ? <span className="spinner" /> : 'Reservieren')}
          </button>
        ) : undefined
      }
    >
      {/* --- the thing itself --- */}
        {/* Three tiers, in the order they are wanted: what is wrong with it,
            who has it, and — quietest — where the picture came from. The
            title is gone because the screen is already named after the item
            one line above, and repeating it pushed everything actually new
            further down. The credit left the column beside a 160px image,
            where four lines of licence text wrapped at ~20 characters. */}
      <div className="card tight">
        <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
        <MarketPhoto item={item} size={132} />

          <div className="grow col" style={{ gap: 7, alignItems: 'flex-start' }}>
            <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
              <Label tone="warn">{t(item.defect)}</Label>
              {t(item.condition && <Tag von="input">{t(item.condition)}</Tag>)}
            </div>
            <span className="sm">
              {t("Von ")}<b>{t(item.ownerName ?? 'jemandem')}</b>
              {t(item.distanceKm !== undefined && ` · ${item.distanceKm.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`)}
            </span>
          </div>
        </div>
      </div>

      {/* --- where it stands --- */}
      <div className="card tight flat">
        <div className="between">
          {t(KETTE.map((k, i) => (
            <div key={k.id} className="row" style={{ gap: 7, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: i <= stand ? 'var(--blue-deep)' : 'var(--sky)',
                  color: i <= stand ? 'var(--on-blue)' : 'var(--blue-ink)',
                }}
              >
                {t(i <= stand ? <Icon name="check" size={12} stroke={2.6} /> : null)}
              </span>
              <span
                className="xs"
                style={{ color: i <= stand ? 'var(--ink)' : 'var(--ink3)', fontWeight: 600 }}
              >
                {t(k.label)}
              </span>
            </div>
          )))}
        </div>
      </div>

      {t(fehler && (
        <p className="xs" style={{ color: 'var(--alert)', margin: 0 }}>
          {t(fehler)}
        </p>
      ))}

      {/* --- reserving: agree a window --- */}
      {t(item.status === 'open' && role === 'visitor' && (
        <div className="card tight col" style={{ gap: 10 }}>
          <div>
            <b className="sm">{t("Wann würdest du es abholen?")}</b>
          </div>
          <div className="chips">
            {t(d.windowOptions.map((w) => (
              <button
                key={w.id}
                className="chip"
                aria-pressed={w.id === fenster}
                onClick={() => setFenster(w.id === fenster ? '' : w.id)}
              >
                {t(w.label)}
              </button>
            )))}
          </div>
        </div>
      ))}

      {/* --- reserved: the two confirmations --- */}
      {t(item.status !== 'open' && (
        <div className="card tight col" style={{ gap: 11 }}>
          <div className="between">
            <b className="sm">{t("Übergabe")}</b>
            {t(d.window && (
              <Label tone={handover.complete ? 'plain' : 'warn'}>
                <Icon name="clock" size={13} /> {t(d.window.label)}
              </Label>
            ))}
          </div>

          <Bestaetigung
            wer={item.ownerName ?? 'Anbieter:in'}
            rolle="gibt ab"
            fertig={handover.owner}
            selbst={role === 'owner'}
          />
          <Bestaetigung
            wer={item.claimerName ?? 'Abholer:in'}
            rolle="holt ab"
            fertig={handover.claimer}
            selbst={role === 'claimer'}
          />

          <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
            {t(handover.complete
              ? 'Beide haben bestätigt. Gutgeschrieben wurde auf beiden Seiten.'
              : role === 'visitor'
                ? `Reserviert${d.window ? ` für ${d.window.label}` : ''}.`
                : andereOffen && !ichBinDran
                  ? `Deine Bestätigung steht. Sobald ${gegenueber} bestätigt, wird gutgeschrieben.`
                  : 'Erst wenn beide bestätigt haben, entsteht eine Gutschrift. Deshalb kann niemand sich selbst Punkte geben.')}
          </p>

          {t(role !== 'visitor' && !handover.complete && (
            <button
              className="btn sm"
              disabled={busy !== null}
              onClick={() => void schreiben('release')}
              style={{ width: '100%' }}
            >
              {t(busy === 'release' ? (
                <span className="spinner" />
              ) : role === 'owner' ? (
                'Reservierung auflösen'
              ) : (
                'Reservierung zurückgeben'
              ))}
            </button>
          ))}
        </div>
      ))}

      {/* --- the credit --- */}
      {t(d.award && (
        <div className="card tight col" style={{ gap: 8 }}>
          <div className="between">
            <b className="sm">{t(d.award.blocked ? 'Gezählt, nicht bepunktet' : 'Gutgeschrieben')}</b>
            <Coin star>
              {t(d.award.xp)} {t(" XP · ")}{t(d.award.coins)} {t(" Mz.")}</Coin>
          </div>
          <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
            {t(d.award.hint ?? d.message)}
          </p>
        </div>
      ))}

      {t(d.receiptActionId !== null && (
        <Link className="btn" to={`/nachweis/${d.receiptActionId}`}>
          <Icon name="shield" size={18} />
          {t("Nachweis ansehen")}</Link>
      ))}

      {/* --- who could actually fix this --- */}
      {t(d.repairShops.length > 0 && (
        <>
          <h2 className="h3" style={{ marginBottom: -4 }}>
            {t("Wer das reparieren kann")}</h2>
          <div className="col" style={{ gap: 9 }}>
            {t(d.repairShops.map((shop) => (
              <div key={shop.id} className="card tight">
                <div className="row" style={{ gap: 11 }}>
                  <span className="thumb" style={{ width: 38, height: 38, flex: 'none' }}>
                    <Icon name="wrench" size={19} />
                  </span>
                  <span className="grow">
                    <b className="sm" style={{ display: 'block' }}>
                      {t(shop.name)}
                    </b>
                    <span className="xs mut">
                      {t(shop.addr ?? 'Adresse nicht hinterlegt')} {t(" · ")}{t(shop.distanceKm.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} {t(" km")}</span>
                  </span>
                </div>
              </div>
            )))}
          </div>
        </>
      ))}

      <p className="xs mut" style={{ lineHeight: 1.5 }}>
        {t("Kostenlos abzugeben. ReMain kennt keine Preise und keinen Weiterverkauf — was hier steht, soll benutzt werden, nicht gehandelt.")}</p>
    </Screen>
  )
}

function Bestaetigung({
  wer,
  rolle,
  fertig,
  selbst,
}: {
  wer: string
  rolle: string
  fertig: boolean
  selbst: boolean
}) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: fertig ? 'var(--blue-deep)' : 'var(--sky)',
          color: fertig ? 'var(--on-blue)' : 'var(--blue-ink)',
        }}
      >
        <Icon name={fertig ? 'check' : 'clock'} size={14} stroke={2.4} />
      </span>
      <span className="grow">
        <b className="sm" style={{ display: 'block' }}>
          {t(wer)}
          {t(selbst && <span className="mut" style={{ fontWeight: 500 }}> {t(" — du")}</span>)}
        </b>
        <span className="xs mut">
          {t(rolle)} {t(" · ")}{t(fertig ? 'bestätigt' : 'noch offen')}
        </span>
      </span>
    </div>
  )
}
