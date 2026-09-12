import { t, getLocale } from './../lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag } from '../components/ui'
import { api, useApi, type QuestDetail, type RouteComparison, type RouteLeg, type RouteOption } from '../lib/client'
import { STADTTEILE } from '../lib/frankfurt'
import { useSession } from '../lib/session'

/**
 * Phase 8 — the way to an action, with its cost shown.
 *
 * The screen exists because a journey is part of an action's impact, and a
 * product that hides it is quietly lying. So all four ways are listed, the
 * car included, each with the arithmetic that produced its number, and the
 * car's row says plainly that it earns nothing.
 *
 * Location: nothing is read from the device until the person asks for it, it
 * stops the moment they say so, and the coordinate is rounded before it is
 * sent. Without it the comparison starts from the centre of their Stadtteil,
 * which needs no permission at all.
 */

/** ~11 m. Enough to pick the right stop, not enough to point at a front door. */
const PRECISION = 4
const round = (v: number) => Math.round(v * 10 ** PRECISION) / 10 ** PRECISION

/** 9.7 -> "9,7". German decimal comma, everywhere a distance is printed. */
const km = (v: number) => v.toLocaleString(getLocale(), { maximumFractionDigits: 1 })
const num = (v: number, digits: number) =>
  v.toLocaleString(getLocale(), { maximumFractionDigits: digits })

const MODE_ICON: Record<string, Parameters<typeof Icon>[0]['name']> = {
  walk: 'users',
  bike: 'route',
  transit: 'truck',
  car: 'truck',
}

interface Origin {
  lat: number
  lon: number
  label: string
  exact: boolean
}

export default function RouteScreen() {
  const { questId } = useParams()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const journey = useApi<{ journey: { mode: string; startedAt: string } | null }>(questId ? `/api/quests/${questId}/journey` : null)
  const { me } = useSession()

  // ?at=08:15 pins the comparison to a time of day. The schedule is a real one
  // and the night service is thin, so a demo at 2 a.m. would otherwise show
  // honest but useless journeys.
  const [params] = useSearchParams()
  const at = /^\d{1,2}:\d{2}$/.test(params.get('at') ?? '') ? params.get('at') : null

  const heimat = useMemo(() => {
    const s = STADTTEILE.find((d) => d.id === me?.district.id)
    return s ?? STADTTEILE[0]
  }, [me?.district.id])

  const [origin, setOrigin] = useState<Origin>({
    lat: heimat.lat,
    lon: heimat.lon,
    label: `Mitte von ${heimat.name}`,
    exact: false,
  })
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (origin.exact) return
    setOrigin({ lat: heimat.lat, lon: heimat.lon, label: `Mitte von ${heimat.name}`, exact: false })
    // only follows the district while no device position is in use
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heimat.id])

  const startLocating = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('Dieses Gerät gibt keinen Standort her.')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        // rounded here, on the device, before anything is sent
        setOrigin({
          lat: round(pos.coords.latitude),
          lon: round(pos.coords.longitude),
          label: 'Dein Standort',
          exact: true,
        })
      },
      (err) => {
        setLocating(false)
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Kein Zugriff auf den Standort — der Vergleich startet weiter in deinem Stadtteil.'
            : 'Der Standort war nicht zu ermitteln. Es bleibt beim Stadtteil.',
        )
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    )
  }, [])

  const stopLocating = useCallback(() => {
    setOrigin({ lat: heimat.lat, lon: heimat.lon, label: `Mitte von ${heimat.name}`, exact: false })
    setLocationError(null)
  }, [heimat])

  const path =
    questId === undefined
      ? null
      : `/api/mobility/routes?questId=${encodeURIComponent(questId)}` +
        `&fromLat=${origin.lat}&fromLon=${origin.lon}` +
        (at === null ? '' : `&at=${encodeURIComponent(at)}`)

  const { data, error, loading, reload } = useApi<RouteComparison>(path)

  const selected = data?.options.find(o => o.mode === open) ?? data?.options.find(o => o.mode === data.best)
  async function startJourney() {
    if (!questId || !selected || starting) return
    setStarting(true); setStartError('')
    try {
      const proof = await api.get<QuestDetail>(`/api/quests/${questId}/proof`)
      if (proof.canClaim) await api.post(`/api/quests/${questId}/claim`)
      else if (proof.role !== 'claimer') throw new Error(proof.claimBlockedWhy || 'Diese Quest steht nicht zum Übernehmen bereit.')
      await api.post(`/api/quests/${questId}/journey`, { mode: selected.mode })
      journey.reload()
    } catch (error) { setStartError(error instanceof Error ? error.message : 'Fahrt konnte nicht gestartet werden.') }
    finally { setStarting(false) }
  }
  return (
    <Screen
      back
      title={t("Dein Weg dorthin")}
      sub={t(data?.target?.title ?? 'Route wird geladen …')}
      footer={journey.data?.journey ? <button className="btn primary" onClick={() => navigate(`/quests/${questId}/nachweis`)}>{t("Am Ziel · Nachweis aufnehmen")}</button> : <button className="btn primary" disabled={!selected || starting} onClick={() => void startJourney()}>{t(starting ? 'Wird gespeichert …' : `Fahrt starten${selected ? ` · ${selected.label}` : ''}`)}</button>}
    >
      {t(startError && <p className="card tight" role="alert">{t(startError)}</p>)}
      {t(journey.data?.journey && <div className="card sky" role="status"><b>{t("Hinweg gestartet")}</b><p className="sm">{t(data?.options.find(o => o.mode === journey.data!.journey!.mode)?.label ?? journey.data.journey.mode)} {t(" · deine Angabe")}</p><p className="xs mut">{t("Verkehrsmittel gespeichert. Keine GPS-Aufzeichnung. Der Nachweis und die geltenden Regeln entscheiden über die Gutschrift.")}</p></div>)}
      {/* --- where the comparison starts, and who decides that --- */}
      <details className="card tight"><summary>{t("Start: ")}{t(origin.label)} {t(" · Ändern")}</summary>
        <div className="row" style={{ gap: 11 }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              flex: 'none',
              background: 'var(--sky)',
              color: 'var(--blue-deep)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="pin" size={19} />
          </span>
          <span className="grow">
            <span className="sm" style={{ display: 'block', fontWeight: 700 }}>
              {t("Start: ")}{t(origin.label)}
            </span>
            <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
              {t(origin.exact
                ? `Auf ${PRECISION} Nachkommastellen gerundet (${origin.lat}, ${origin.lon}) — genauer verlässt nichts dein Gerät.`
                : 'Ohne Standortfreigabe. Reicht für den Vergleich, trifft aber nicht die Haltestelle vor der Tür.')}
            </span>
          </span>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 11 }}>
          {t(origin.exact ? (
            <button className="btn sm" onClick={stopLocating}>
              <Icon name="cross" size={15} />
              {t("Standort beenden")}</button>
          ) : (
            <button className="btn sm primary" onClick={startLocating} disabled={locating}>
              {t(locating ? <span className="spinner" /> : <Icon name="pin" size={15} />)}
              {t(locating ? 'Suche …' : 'Standort verwenden')}
            </button>
          ))}
          {t(data !== null && (
            <span className="xs mut" style={{ alignSelf: 'center' }}>
              {t("Abfahrt ab ")}{t(data.atTime)}
              {t(at !== null && ' (gesetzt)')}
            </span>
          ))}
        </div>

        {t(locationError !== null && (
          <p className="xs" style={{ margin: '9px 0 0', color: 'var(--alert)' }}>
            {t(locationError)}
          </p>
        ))}
      </details>

      {t(loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      ))}

      {t(error !== null && (
        <div className="card">
          <p className="sm" style={{ margin: 0 }}>
            {t(error.code === 'mobility_data_missing'
              ? 'Die Fahrplandaten sind noch nicht gebaut.'
              : error.message)}
          </p>
          <button className="btn sm" style={{ marginTop: 11 }} onClick={reload}>
            {t("Nochmal versuchen")}</button>
        </div>
      ))}

      {t(data !== null && (
        <>
          <div className="between">
            <p className="lbl">
              {t(data.options.length)} {t(" Wege · ")}{t(km(data.directKm))} {t(" km Luftlinie")}</p>
            <span className="xs mut">{t("sparsamster zuerst")}</span>
          </div>

          <div className="col" style={{ gap: 9 }}>
            {t(data.options.map((o) => (
              <OptionCard
                key={o.mode}
                option={o}
                open={open === o.mode}
                onToggle={() => setOpen(open === o.mode ? null : o.mode)}
              />
            )))}
          </div>

          {/* --- provenance, because every number above is one of two kinds --- */}
          <div className="card flat">
            <p className="lbl" style={{ marginTop: 0 }}>
              {t("Woher die Zahlen kommen")}</p>

            {t(data.schedule !== null && (
              <p className="xs mut" style={{ margin: '0 0 9px', lineHeight: 1.5 }}>
                <Tag von="api" icon>
                  {t("Fahrplan")}</Tag>{t(' ')}
                {t(data.schedule.note)} {t(data.schedule.limitation)}
              </p>
            ))}

            <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
              <Tag von="estimate" icon>
                {t("CO₂e")}</Tag>{t(' ')}
              {t(data.assumptions.note)} {t(" Auto ")}{t(num(data.assumptions.carCo2PerKm, 3))} {t(" kg/km, ÖPNV")}{t(' ')}
              {t(num(data.assumptions.transitCo2PerKm, 3))} {t(" kg/km, Umwegfaktor")}{t(' ')}
              {t(num(data.assumptions.detourFactor, 1))}{t(", ")}{t(data.assumptions.pointsPerKgCo2)} {t(" XP je kg. Quelle: ")}{t(data.assumptions.source)}{t(".")}</p>

            <div className="sep" style={{ margin: '11px 0' }} />

            <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
              {t(data.xpNote)}
            </p>
          </div>
        </>
      ))}
    </Screen>
  )
}

/* ------------------------------------------------------------------
   One option
   ------------------------------------------------------------------ */

function OptionCard({
  option,
  open,
  onToggle,
}: {
  option: RouteOption
  open: boolean
  onToggle: () => void
}) {
  const blocked = option.xp.effect === 'none'

  return (
    <div className="card tight" style={blocked ? { borderColor: 'var(--alert-soft)' } : undefined}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            flex: 'none',
            background: blocked ? 'var(--alert-soft)' : 'var(--sky)',
            color: blocked ? 'var(--alert)' : 'var(--blue-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={MODE_ICON[option.mode] ?? 'route'} size={20} />
        </span>

        <span className="grow">
          <span className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            <b className="sm">{t(option.label)}</b>
            <span className="num sm">{t(option.minutes)} {t(" Min")}</span>
            <span className="xs mut">{t(km(option.km))} {t(" km")}</span>
          </span>
          <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
            {t(option.detail)}
          </span>
        </span>

        <span style={{ textAlign: 'right', flex: 'none' }}>
          <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
            <span className="num sm">{t(option.co2Kg.toLocaleString(getLocale(), { minimumFractionDigits: 2 }))}</span>
            <span className="xs mut">{t("kg")}</span>
          </span>
          <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
            <Icon name="chevron" size={13} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
          </span>
        </span>
      </button>

      {/* The point of the screen: what this way does to the credit. */}
      <div className="row" style={{ gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
        {t(blocked ? (
          <Label tone="warn">{t(option.xp.text)}</Label>
        ) : option.xp.effect === 'full' ? (
          <Coin star>{t(option.xp.text)}</Coin>
        ) : (
          <Coin>{t(option.xp.text)}</Coin>
        ))}
        <Tag von="estimate">
          {t(option.mode === 'car' ? 'Vergleichswert' : option.savedVsCarText)}
        </Tag>
      </div>

      {t(open && (
        <>
          <div className="sep" style={{ margin: '12px 0 11px' }} />

          <p className="xs" style={{ margin: '0 0 9px', lineHeight: 1.5 }}>
            {t(option.xp.reason)}
          </p>

          <p className="xs mut" style={{ margin: '0 0 9px', lineHeight: 1.5 }}>
            <b>{t("Rechenweg:")}</b> {t(option.formula)}
            <br />
            {t(option.co2Note)}
          </p>

          {t(option.note !== null && (
            <p className="xs mut" style={{ margin: '0 0 9px', lineHeight: 1.5 }}>
              {t(option.note)}
            </p>
          ))}

          {t(option.legs !== null && (
            <div className="col" style={{ gap: 7 }}>
              {t(option.legs.map((leg, i) => (
                <Leg key={i} leg={leg} />
              )))}
            </div>
          ))}
        </>
      ))}
    </div>
  )
}

function Leg({ leg }: { leg: RouteLeg }) {
  if (leg.kind === 'walk') {
    return (
      <div className="row xs mut" style={{ gap: 8 }}>
        <Icon name="users" size={14} className="ico" />
        <span>
          {t(leg.to !== undefined ? `Zu Fuß zur Haltestelle ${leg.to}` : `Zu Fuß ab ${leg.from}`)} {t(" ·")}{t(' ')}
          {t(Math.max(1, Math.round((leg.seconds ?? 0) / 60)))} {t(" Min")}</span>
      </div>
    )
  }

  return (
    <div className="row xs" style={{ gap: 8 }}>
      <Icon name="truck" size={14} className="ico" />
      <span className="grow">
        <b>
          {t(leg.mode)} {t(leg.line)}
        </b>{t(' ')}
        {t("Richtung ")}{t(leg.headsign)}
        <span className="mut">
          {t(' ')}
          {t("· ")}{t(leg.departTime)} {t(" ab ")}{t(leg.from)} {t(" → ")}{t(leg.arriveTime)} {t(leg.to)} {t(" (")}{t(leg.stops)} {t(" Halte)")}</span>
      </span>
    </div>
  )
}
