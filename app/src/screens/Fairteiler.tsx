import { t, getLocale } from './../lib/i18n'
import { useSession } from '../lib/session'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag, Thumb } from '../components/ui'
import {
  ApiError,
  api,
  useApi,
  type FoodHistory,
  type FoodItem,
  type FoodNearby,
  type FoodPickupResult,
  type FoodState,
} from '../lib/client'

/**
 * Essen retten — the only screen in ReMain backed by a live partner API.
 *
 * Two things are worth doing differently here.
 *
 * The order. Sorting by distance answers the wrong question: the nearest
 * Fairteiler may hold nothing urgent while a basket three kilometres away
 * expires tonight. The server ranks by net effect per minute of effort and
 * hands back the sentence explaining each rank, so what the list shows and
 * what it sorted by are the same number.
 *
 * The lock. A Geschäftsrettung needs a foodsharing verification, and when it
 * is missing the interface answers 403. The entries stay in the list, greyed,
 * with the reason and what it would take — hiding them would hide the reason,
 * and a silent failure is the thing this product is built against. The screen
 * acts as one fixed foodsharing account (see `actingUser` in the route), so
 * what is locked here is what is locked for the person using the app.
 */

const SOURCE_ICON = {
  food_share_point: 'leaf',
  basket: 'gift',
  business: 'market',
} as const

const SOURCE_LABEL = {
  food_share_point: 'Fairteiler',
  basket: 'Korb',
  business: 'Geschäft',
} as const

type Filter = 'alle' | 'basket' | 'food_share_point' | 'business'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'alle', label: 'Alles' },
  { id: 'basket', label: 'Körbe' },
  { id: 'food_share_point', label: 'Fairteiler' },
  { id: 'business', label: 'Geschäfte' },
]

const km = (value: number | null) =>
  value === null ? null : value < 1 ? `${Math.round(value * 1000)} m` : `${value.toLocaleString(getLocale(), { maximumFractionDigits: 1 })} km`

function expiry(hoursLeft: number | null) {
  if (hoursLeft === null) return null
  if (hoursLeft <= 0) return 'abgelaufen'
  if (hoursLeft < 1) return 'läuft in unter 1 h ab'
  if (hoursLeft < 24) return `läuft in ${Math.round(hoursLeft)} h ab`
  return `läuft in ${Math.round(hoursLeft / 24)} Tagen ab`
}

const uhr = (iso: string) =>
  new Date(iso).toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function Fairteiler() {
  const { refresh } = useSession()
  const [filter, setFilter] = useState<Filter>('alle')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<FoodPickupResult | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [alle, setAlle] = useState(false)

  const state = useApi<FoodState>('/api/foodsharing/state')
  const nearby = useApi<FoodNearby>('/api/foodsharing/nearby')
  const history = useApi<FoodHistory>(showHistory ? '/api/foodsharing/history' : null)

  const lock = nearby.data?.lock ?? state.data?.lock ?? null
  const items = (nearby.data?.items ?? []).filter(
    (i) => filter === 'alle' || i.source === filter,
  )

  async function run(path: string, body: unknown, key: string) {
    setBusy(key)
    setProblem(null)
    setNote(null)
    try {
      const response = await api.post<unknown>(path, body)
      void refresh()
      return response
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'offline', 'Keine Verbindung zum Server.'),
      )
      return null
    } finally {
      setBusy(null)
    }
  }

  async function abholen(item: FoodItem) {
    const answer = (await run(
      '/api/foodsharing/pickup',
      { source: item.source, sourceId: item.sourceId },
      item.key,
    )) as FoodPickupResult | null
    if (!answer) return
    setResult(answer)
    nearby.reload()
    if (showHistory) history.reload()
  }

  async function anfragen(item: FoodItem) {
    const answer = await run(
      '/api/foodsharing/request',
      { basketId: item.sourceId },
      `req:${item.key}`,
    )
    if (!answer) return
    setNote('Anfrage gestellt — der Korb ist jetzt für dich reserviert.')
    nearby.reload()
  }

  return (
    <Screen
      back
      title={t("Essen retten")}
      sub={t(state.error?.code === 'no_key' ? 'foodsharing ist gerade nicht verfügbar' : 'Lebensmittel in deiner Nähe abholen')}
    >
      {/* Which foodsharing account this is, and what it may do. Read-only:
          the person signed into ReMain has one account, so the screen shows
          it rather than offering a choice. */}
      <details className="card tight"><summary>{t("foodsharing-Konto und Freigaben")}</summary>
        <div className="between" style={{ marginBottom: 9 }}>
          <span className="lbl">{t("Dein foodsharing-Konto")}</span>
          <Tag von="api" icon />
        </div>
        <div className="row" style={{ gap: 8 }}>
          {t(state.loading && <span className="spinner" />)}
          {t(state.data && (
            <>
              <Icon
                name={state.data.acting.verification.is_verified ? 'shield' : 'clock'}
                size={15}
                stroke={2.2}
                className="ico"
              />
              <b className="sm grow">
                {t(state.data.acting.display_name ?? `Nutzer ${state.data.acting.id}`)}
              </b>
              <Label tone={state.data.acting.verification.is_verified ? 'plain' : 'warn'}>
                {t(state.data.acting.verification.is_verified ? 'verifiziert' : 'nicht verifiziert')}
              </Label>
            </>
          ))}
        </div>
        <p className="xs mut" style={{ margin: '9px 0 0' }}>
          {t("Der Schlüssel liegt auf dem Server. Verifiziert heißt: Geschäftsrettungen sind freigeschaltet.")}</p>
      </details>

      {/* What just happened. */}
      {t(result && <Erfolg result={result} onClose={() => setResult(null)} />)}

      {t(note && (
        <div className="card tight sky row" style={{ gap: 9 }}>
          <Icon name="check" size={18} />
          <span className="sm grow">{t(note)}</span>
        </div>
      ))}

      {t(problem && <Fehler error={problem} onClose={() => setProblem(null)} />)}

      {/* Why a whole category is closed — with the way out, not a dead end. */}
      {t(lock && (
        <div className="card tight" style={{ borderColor: 'var(--stone)' }}>
          <div className="row" style={{ gap: 9, marginBottom: 7 }}>
            <Icon name="shield" size={18} className="ico" />
            <b className="sm grow">{t(lock.title)}</b>
            <Label tone="warn">{t("gesperrt")}</Label>
          </div>
          <p className="sm mut" style={{ margin: 0 }}>
            {t(lock.why)} {t(lock.what)}
          </p>
          {t(lock.nextStep && (
            <p className="xs mut" style={{ margin: '7px 0 0' }}>
              {t("foodsharing nennt als nächsten Schritt: ")}<code>{t(lock.nextStep)}</code>
            </p>
          ))}
        </div>
      ))}

      <div className="chips scroll">
        {t(FILTERS.map((f) => (
          <button
            key={f.id}
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {t(f.label)}
          </button>
        )))}
      </div>

      {t(nearby.loading && (
        <div className="empty">
          <span className="spinner" />
          {t("Fragt foodsharing …")}</div>
      ))}

      {t(nearby.error && (
        <div className="card tight">
          <b className="sm">{t("foodsharing antwortet nicht")}</b>
          <p className="sm mut" style={{ margin: '5px 0 10px' }}>{t(nearby.error.code === 'no_key' ? 'foodsharing ist noch nicht verbunden. Nach Einrichtung des Zugangs erscheinen hier verfügbare Rettungen.' : nearby.error.message)}</p><Link className="btn sm" to="/integrationen">{t("Verbindung ansehen")}</Link>
          <button className="btn sm" onClick={() => nearby.reload()}>
            {t("Nochmal versuchen")}</button>
        </div>
      ))}

      {/* The point of ranking is that the first entry means something. It gets
          the room and the argument; the rest stay a list you can scan. */}
      {t(items.length > 0 && (
        <div>
          <p className="lbl" style={{ marginBottom: 9 }}>{t("Lohnt sich jetzt am meisten")}</p>
          <Eintrag
            item={items[0]}
            busy={busy}
            gross
            onPickup={() => void abholen(items[0])}
            onRequest={() => void anfragen(items[0])}
          />
        </div>
      ))}

      {t(items.length > 1 && (
        <div>
          <div className="between" style={{ marginBottom: 9 }}>
            <p className="lbl">{t("Danach")}</p>
            <span className="xs mut">{t(items.length - 1)} {t(" weitere")}</span>
          </div>
          <div className="col" style={{ gap: 9 }}>
            {t(items.slice(1, alle ? undefined : 9).map((item) => (
              <Eintrag
                key={item.key}
                item={item}
                busy={busy}
                onPickup={() => void abholen(item)}
                onRequest={() => void anfragen(item)}
              />
            )))}
          </div>
          {t(!alle && items.length > 9 && (
            <button className="btn sm" style={{ width: '100%', marginTop: 10 }} onClick={() => setAlle(true)}>
              {t("Alle ")}{t(items.length)} {t(" zeigen")}</button>
          ))}
        </div>
      ))}

      {t(!nearby.loading && !nearby.error && items.length === 0 && (
        <div className="empty">
          <Icon name="leaf" size={26} />
          {t("In diesem Umkreis ist gerade nichts zu retten.")}</div>
      ))}

      {/* The order is a computed claim, so the arithmetic behind it is
          readable rather than asserted. */}
      {t(nearby.data && (
        <details className="card tight flat">
          <summary className="sm" style={{ fontWeight: 700, cursor: 'pointer' }}>
            {t("Wie diese Reihenfolge zustande kommt")}</summary>
          <p className="sm mut" style={{ margin: '9px 0 7px' }}>
            {t("Sortiert nach ")}<b>{t("Netto-Wirkung je Aufwandsminute")}</b>{t(", nicht nach Entfernung. Die Wirkung ist eine Schätzung aus diesen Annahmen — die Schnittstelle nennt keine Mengen:")}</p>
          <ul className="xs mut" style={{ margin: 0, paddingLeft: 17 }}>
            {t(nearby.data.assumptions.map((a) => (
              <li key={a} style={{ marginBottom: 4 }}>
                {t(a)}
              </li>
            )))}
          </ul>
          <p className="xs mut" style={{ margin: '9px 0 0' }}>
            {t("Weg gerechnet ab ")}{t(nearby.data.at.lat.toLocaleString(getLocale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }))}{t(", ")}{t(nearby.data.at.lon.toLocaleString(getLocale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }))} {t(" — dem Mittelpunkt deines Stadtteils, solange du keinen Standort freigibst.")}</p>
        </details>
      ))}

      {/* The proof after the fact: the partner's own history, next to ours. */}
      <button
        className="card tight row"
        onClick={() => setShowHistory((v) => !v)}
        /* button.card sets display:block and outranks .row — say it again */
        style={{ display: 'flex', gap: 10 }}
      >
        <Icon name="clock" size={19} className="ico" />
        <span className="grow sm" style={{ fontWeight: 700 }}>
          {t("Deine foodsharing-Historie")}</span>
        <Icon name={showHistory ? 'up' : 'down'} size={18} className="ico" />
      </button>

      {t(showHistory && (
        <div className="col" style={{ gap: 9 }}>
          {t(history.loading && (
            <div className="empty">
              <span className="spinner" />
            </div>
          ))}
          {t(history.data?.pickups.length === 0 && (
            <p className="sm mut" style={{ margin: 0 }}>
              {t("Noch keine Abholung auf diesem Zugang.")}</p>
          ))}
          {t((history.data?.pickups ?? []).slice(0, 12).map((p) => (
            <div key={p.id} className="card tight row" style={{ gap: 10 }}>
              <Thumb icon="leaf" size={38} />
              <span className="grow">
                <span className="sm" style={{ display: 'block', fontWeight: 600 }}>
                  {t(p.name ?? `Abholung #${p.id}`)}
                </span>
                <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                  {t("#")}{t(p.id)} {t(" · ")}{t(uhr(p.pickedUpAt))}
                  {t(p.wasTrial && ' · Einführungsabholung')}
                </span>
              </span>
              {t(p.actionId ? (
                <Link className="xs" to={`/nachweis/${p.actionId}`} style={{ fontWeight: 700 }}>
                  {t("Nachweis")}</Link>
              ) : (
                <Label>{t(p.creditedElsewhere ? 'anderer Person' : 'ohne ReMain')}</Label>
              ))}
            </div>
          )))}
          <p className="xs mut" style={{ margin: 0 }}>
            {t("Diese Liste kommt aus ")}<b>{t("GET /users/me/pickups")}</b> {t(" der foodsharing-API. Ein Eintrag mit Nachweis wurde hier gutgeschrieben; einer ohne ist außerhalb von ReMain entstanden.")}</p>
        </div>
      ))}
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function Eintrag({
  item,
  busy,
  gross = false,
  onPickup,
  onRequest,
}: {
  item: FoodItem
  busy: string | null
  /** the lead entry: the one the ranking is an argument for */
  gross?: boolean
  onPickup: () => void
  onRequest: () => void
}) {
  const ablauf = expiry(item.hoursLeft)
  const entfernung = km(item.distanceKm)
  const gesperrt = item.locked || item.ownBasket === true
  const arbeitet = busy === item.key

  const co2 = (
    <Tag von="estimate" icon>
      {t("≈ ")}{t(item.co2eNet.toLocaleString(getLocale(), { maximumFractionDigits: 1 }))} {t(" kg CO₂e")}</Tag>
  )

  /* The rest of the list: one line of what, one line of how far. */
  if (!gross) {
    return (
      <div
        className="card tight row"
        style={{ gap: 10, alignItems: 'flex-start', ...(gesperrt ? { opacity: 0.62 } : {}) }}
      >
        <Thumb icon={SOURCE_ICON[item.source]} size={38} />
        <div className="grow">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <b className="sm">{item.title}</b>
            {t(item.urgencyFactor > 1 && <Label tone="warn">{t(ablauf)}</Label>)}
          </div>
          <div className="row xs mut" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span>{t(SOURCE_LABEL[item.source])}</span>
            {t(entfernung && <span>{t("· ")}{t(entfernung)}</span>)}
            <span>{t("· ")}{t(item.minutes)} {t(" Min")}</span>
            {t(co2)}
          </div>
          {t(gesperrt && (
            <p className="xs mut" style={{ margin: '5px 0 0' }}>
              {t(item.ownBasket
                ? 'Dein eigener Korb — foodsharing antwortet darauf mit 400.'
                : (item.lock?.why ?? 'Gesperrt.'))}
            </p>
          ))}
        </div>
        <button className="btn sm" disabled={gesperrt || busy !== null} onClick={onPickup}>
          {t(arbeitet ? <span className="spinner" /> : 'Abholen')}
        </button>
      </div>
    )
  }

  /* The lead entry, with the reason it leads. */
  return (
    <div className={gesperrt ? 'card' : 'card sky'} style={gesperrt ? { opacity: 0.62 } : undefined}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Thumb icon={SOURCE_ICON[item.source]} size={46} />
        <div className="grow">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <b className="sm">{item.title}</b>
            <Label>{t(SOURCE_LABEL[item.source])}</Label>
            {t(item.urgencyFactor > 1 && <Label tone="warn">{t(ablauf)}</Label>)}
          </div>

          {/* The estimate is carried by the tag, so the sentence next to it
              says what it cost rather than repeating what it saved. */}
          <div className="row" style={{ gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
            {t(co2)}
            <span className="sm">{t("für ")}{t(item.minutes)} {t(" Min Aufwand")}</span>
          </div>

          <div className="row xs mut" style={{ gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {t(entfernung && <span>{t(entfernung)}</span>)}
            {t(item.co2eTravel > 0 && (
              <span>
                {t("· abzüglich")}{t(' ')}
                {t(item.co2eTravel.toLocaleString(getLocale(), { maximumFractionDigits: 2 }))} {t(" kg Anfahrt")}</span>
            ))}
            {t(item.openingHours && <span>{t("· ")}{t(item.openingHours)}</span>)}
          </div>

          {t(item.foodTypes && item.foodTypes.length > 0 && (
            <div className="xs mut" style={{ marginTop: 5 }}>{t(item.foodTypes.join(' · '))}</div>
          ))}

          {t(item.ownBasket && (
            <p className="xs mut" style={{ margin: '7px 0 0' }}>
              {t("Dein eigener Korb — foodsharing antwortet darauf mit 400.")}</p>
          ))}
          {t(item.locked && item.lock && (
            <p className="xs mut" style={{ margin: '7px 0 0' }}>{t(item.lock.why)}</p>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button
          className="btn primary sm grow"
          disabled={gesperrt || busy !== null}
          onClick={onPickup}
        >
          {t(arbeitet ? <span className="spinner" /> : 'Abholung abschließen')}
        </button>
        {t(item.source === 'basket' && !gesperrt && (
          <button className="btn sm" disabled={busy !== null} onClick={onRequest}>
            {t(busy === `req:${item.key}` ? <span className="spinner" /> : 'Erst anfragen')}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The moment the product is built for: an outside system has confirmed what
 * we claim. Every line here names where it came from — the pickup id and the
 * timestamp from foodsharing, the credit from our ledger, the kilograms from
 * an assumption and labelled accordingly.
 */
function Erfolg({ result, onClose }: { result: FoodPickupResult; onClose: () => void }) {
  return (
    <div className="card sky">
      <div className="between" style={{ marginBottom: 9 }}>
        <span className="h3">{t("Abholung bestätigt")}</span>
        <button className="icobtn bare" onClick={onClose} aria-label={t("Schließen")}>
          <Icon name="cross" size={18} />
        </button>
      </div>

      <div className="col" style={{ gap: 7 }}>
        <div className="between">
          <span className="sm mut">{t("foodsharing-Abholung")}</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="sm">{t("#")}{t(result.pickup.id)}</b>
            <Tag von="api" icon />
          </span>
        </div>
        <div className="between">
          <span className="sm mut">{t("Zeitstempel der Schnittstelle")}</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="sm">{t(uhr(result.pickup.pickedUpAt))}</b>
            <Tag von="api" />
          </span>
        </div>
        <div className="between">
          <span className="sm mut">{t("Gerettet, geschätzt")}</span>
          <span className="row" style={{ gap: 6 }}>
            <b className="sm">
              {t("≈ ")}{t(result.estimate.co2eKg.toLocaleString(getLocale(), { maximumFractionDigits: 1 }))} {t(" kg CO₂e")}</b>
            <Tag von="estimate" />
          </span>
        </div>
      </div>

      <div className="sep" style={{ margin: '11px 0' }} />

      {t(result.award && !result.blocked ? (
        <div className="between">
          <Coin star>
            {t("+")}{t(result.award.xp)} {t(" XP · ")}{t(result.award.coins)} {t(" Münzen")}</Coin>
          <Link className="sm" to={`/nachweis/${result.award.actionId}`} style={{ fontWeight: 700 }}>
            {t("Nachweis öffnen")}</Link>
        </div>
      ) : (
        <div>
          <b className="sm">
            {t(result.credited ? 'Gezählt, aber nicht bepunktet' : 'Schon gutgeschrieben')}
          </b>
          <p className="sm mut" style={{ margin: '4px 0 0' }}>
            {t(result.credited ? (result.hint ?? result.message) : result.message)}
          </p>
          {t(result.award && (
            <Link className="sm" to={`/nachweis/${result.award.actionId}`} style={{ fontWeight: 700 }}>
              {t("Nachweis öffnen")}</Link>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The partner's refusals, shown as what they are.
 *
 * 400, 403 and 409 each mean something specific here and each has a different
 * way out. Collapsing them into "hat nicht geklappt" would throw away the only
 * part that helps.
 */
function Fehler({ error, onClose }: { error: ApiError; onClose: () => void }) {
  const advice =
    error.status === 409
      ? 'Jemand war schneller, oder der Korb ist abgelaufen. Die Liste ist aktualisiert.'
      : error.status === 400
        ? 'Eigene Körbe kann man nicht selbst abholen — such dir einen fremden.'
        : error.status === 403
          ? 'Körbe und Fairteiler gehen trotzdem, dafür braucht foodsharing keine Verifikation.'
          : null

  return (
    <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
      <div className="row" style={{ gap: 9 }}>
        <Icon name="info" size={18} className="ico" />
        <div className="grow">
          <b className="sm">{t(error.message)}</b>
          {t(advice && (
            <p className="sm mut" style={{ margin: '4px 0 0' }}>
              {t(advice)}
            </p>
          ))}
          <p className="xs mut" style={{ margin: '6px 0 0' }}>
            {t("foodsharing antwortet: ")}{t(error.status)} {t(error.code)}
          </p>
        </div>
        <button className="icobtn bare" onClick={onClose} aria-label={t("Schließen")}>
          <Icon name="cross" size={18} />
        </button>
      </div>
    </div>
  )
}
