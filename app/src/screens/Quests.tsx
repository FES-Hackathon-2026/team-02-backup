import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import Icon from '../components/Icon'
import Map, { type MapMarker } from '../components/Map'
import Screen from '../components/Screen'
import { Coin, Label, Tag, Thumb } from '../components/ui'
import {
  api,
  ApiError,
  useApi,
  type Quest,
  type QuestDetail,
  type QuestHazardRefusal,
  type QuestMine,
  type ScanResult,
} from '../lib/client'
import { FRANKFURT_CENTRE } from '../lib/frankfurt'
import { useSession } from '../lib/session'

const RADIUS = [3, 10, 30] as const
type Tab = 'offen' | 'meine' | 'pruefen'

const TABS: { id: Tab; label: string }[] = [
  { id: 'offen', label: 'Offen' },
  { id: 'meine', label: 'Meine' },
  { id: 'pruefen', label: 'Gegenprüfen' },
]

const km = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`

const STATUS: Record<string, { label: string; tone: 'plain' | 'warn' }> = {
  open: { label: 'offen', tone: 'plain' },
  claimed: { label: 'übernommen', tone: 'warn' },
  submitted: { label: 'eingereicht', tone: 'warn' },
  confirmed: { label: 'bestätigt', tone: 'plain' },
}

/**
 * Quests on a real map.
 *
 * Three things happen here: reporting what you just photographed, taking on
 * something somebody else reported, and answering the one question that
 * releases a stranger's credit. The map is the point — a list of addresses
 * is not how anybody decides to walk somewhere.
 */
export default function Quests() {
  const navigate = useNavigate()
  const location = useLocation()
  const { me } = useSession()

  /** A scan that routed here wants to become a report. */
  const scan = (location.state as { scan?: ScanResult } | null)?.scan ?? null

  const [tab, setTab] = useState<Tab>('offen')
  const [radius, setRadius] = useState<number>(RADIUS[2])
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Position sorts the list and draws the radius. Refusing costs nothing —
  // the centre of Frankfurt is used instead and everything still works.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => undefined,
      { timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  const from = pos ?? FRANKFURT_CENTRE

  const open = useApi<{ quests: Quest[] }>(
    `/api/quests?lat=${from.lat}&lon=${from.lon}&r=${radius}`,
  )
  const mine = useApi<QuestMine>(`/api/quests/mine?lat=${from.lat}&lon=${from.lon}&r=${radius}`)

  const quests = open.data?.quests ?? []
  const reviewable = mine.data?.reviewable ?? []
  const meine = useMemo(
    () => [...(mine.data?.claimed ?? []), ...(mine.data?.reported ?? [])],
    [mine.data],
  )

  const shown = tab === 'offen' ? quests : tab === 'meine' ? meine : reviewable.map((r) => r.quest)

  /* The open list comes from content.js and carries no author id, so "this
     is mine" is answered from my own reported list rather than guessed. */
  const reported = useMemo(
    () => new Set((mine.data?.reported ?? []).map((q) => q.id)),
    [mine.data],
  )

  const markers: MapMarker[] = shown.map((q) => ({
    id: q.id,
    lat: q.lat,
    lon: q.lon,
    badge: tab === 'pruefen' ? '?' : `${q.xp}`,
    label: q.title,
    tone: q.status === 'confirmed' ? 'done' : q.status === 'open' ? 'open' : 'claimed',
  }))

  const centre = useMemo(() => {
    const chosen = shown.find((q) => q.id === selected)
    return chosen ? { lat: chosen.lat, lon: chosen.lon } : from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from.lat, from.lon, shown.length])

  async function claim(questId: string) {
    setBusy(questId)
    setNote(null)
    try {
      const result = await api.post<QuestDetail>(`/api/quests/${questId}/claim`)
      navigate(`/quests/${questId}/nachweis`, { state: { detail: result } })
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
      open.reload()
      mine.reload()
    } finally {
      setBusy(null)
    }
  }

  const loading = open.loading && quests.length === 0

  return (
    <Screen
      title="Quests"
      sub={
        loading
          ? 'wird geladen …'
          : tab === 'pruefen'
            ? `${reviewable.length} warten auf eine zweite Meinung`
            : `${shown.length} im Umkreis von ${radius} km`
      }
      tabs
      action={
        <button className="icobtn" aria-label="Melden" onClick={() => navigate('/scan')}>
          <Icon name="camera" size={21} />
        </button>
      }
    >
      {scan && <Melden scan={scan} onDone={() => { open.reload(); mine.reload() }} />}

      <Map
        centre={centre}
        markers={markers}
        me={pos}
        radiusKm={pos ? radius : undefined}
        selectedId={selected}
        onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
        height={236}
      />

      <p className="xs mut" style={{ margin: '-4px 2px 0' }}>
        Karte und Orte: OpenStreetMap (ODbL). Keine Kachel braucht einen Schlüssel — deshalb
        funktioniert die Karte auch, wenn am Demo-Tag ein Konto abläuft.
      </p>

      <div className="chips scroll">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="chip"
            aria-pressed={t.id === tab}
            onClick={() => {
              setTab(t.id)
              setSelected(null)
            }}
          >
            {t.label}
            {t.id === 'pruefen' && reviewable.length > 0 && ` · ${reviewable.length}`}
          </button>
        ))}
        <span className="sep" />
        {RADIUS.map((r) => (
          <button key={r} className="chip" aria-pressed={r === radius} onClick={() => setRadius(r)}>
            {r} km
          </button>
        ))}
      </div>

      {note && (
        <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
          <span className="sm">{note}</span>
        </div>
      )}

      {loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}

      {open.error && tab === 'offen' && (
        <div className="empty">
          <Icon name="cross" size={24} />
          {open.error.message}
        </div>
      )}

      {/* ---------------- Gegenprüfen ---------------- */}
      {tab === 'pruefen' && (
        <>
          <div className="card sky tight">
            <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name="users" size={18} />
              <span className="grow xs">
                <b className="sm" style={{ display: 'block', marginBottom: 2 }}>
                  Eine Frage, zwanzig Sekunden
                </b>
                Zwei übereinstimmende Antworten geben die Gutschrift frei. Anonym, und du siehst
                das Urteil der Regeln erst, nachdem du geantwortet hast — sonst wärst du keine
                zweite Meinung mehr.
              </span>
              <Coin>+{mine.data?.reviewXp ?? 15}</Coin>
            </span>
          </div>

          {!mine.loading && reviewable.length === 0 && (
            <div className="empty">
              <Icon name="check" size={24} />
              Gerade ist nichts zu prüfen. Sobald jemand in deiner Nähe einen Nachweis einreicht,
              steht er hier.
            </div>
          )}

          <div className="col" style={{ gap: 10 }}>
            {reviewable.map((task) => (
              <button
                key={task.submissionId}
                className="card tight row"
                style={{ gap: 11, alignItems: 'flex-start', textAlign: 'left' }}
                onClick={() => navigate(`/review/${task.submissionId}`)}
              >
                {task.beforePhotoId ? (
                  <img
                    src={`/api/photos/${task.beforePhotoId}`}
                    alt=""
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <Thumb icon="quest" size={46} />
                )}
                <span className="grow">
                  <b className="sm">{task.quest.title}</b>
                  <span className="xs mut" style={{ display: 'block', marginTop: 3 }}>
                    {task.answers} von {task.quorum} Antworten · {task.quest.district ?? 'Frankfurt'}
                    {task.quest.distanceKm !== undefined && ` · ${km(task.quest.distanceKm)}`}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------------- Offen / Meine ---------------- */}
      {tab !== 'pruefen' && !loading && shown.length === 0 && (
        <div className="empty">
          <Icon name="quest" size={26} />
          {tab === 'meine'
            ? 'Du hast noch nichts gemeldet und nichts übernommen.'
            : 'Hier ist gerade alles sauber. Melde etwas über das Foto.'}
        </div>
      )}

      {tab !== 'pruefen' && (
        <div className="col" style={{ gap: 10 }}>
          {shown.map((q) => {
            const status = STATUS[q.status] ?? STATUS.open
            const isMine =
              reported.has(q.id) || me?.id === (q as { createdById?: number }).createdById
            return (
              <div
                key={q.id}
                className="card tight"
                style={
                  q.id === selected
                    ? { borderColor: 'var(--blue-deep)', gap: 10 }
                    : { gap: 10 }
                }
              >
                <button
                  className="row"
                  style={{
                    gap: 11,
                    alignItems: 'flex-start',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onClick={() => setSelected((cur) => (cur === q.id ? null : q.id))}
                >
                  {q.photoId ? (
                    <img
                      src={`/api/photos/${q.photoId}`}
                      alt=""
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 12,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <Thumb icon="quest" size={46} />
                  )}

                  <span className="grow">
                    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <b className="sm">{q.title}</b>
                      <Label tone={status.tone}>{status.label}</Label>
                      {q.openForDays >= 3 && q.status === 'open' && (
                        <Label tone="warn">seit {q.openForDays} Tagen</Label>
                      )}
                    </span>
                    {q.note && (
                      <span className="xs mut" style={{ display: 'block', marginTop: 3 }}>
                        {q.note}
                      </span>
                    )}
                    <span className="row xs mut" style={{ gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                      <span className="row" style={{ gap: 5 }}>
                        <Icon name="pin" size={14} />
                        {q.district ?? 'Frankfurt'}
                        {q.distanceKm !== undefined && ` · ${km(q.distanceKm)}`}
                      </span>
                      {q.createdBy && (
                        <span className="row" style={{ gap: 5 }}>
                          <Icon name="users" size={14} />
                          {q.createdBy}
                        </span>
                      )}
                    </span>
                  </span>
                  <Coin>+{q.xp}</Coin>
                </button>

                {q.id === selected && (
                  <div className="row" style={{ gap: 8 }}>
                    {q.status === 'open' && !isMine && (
                      <button
                        className="btn primary grow"
                        disabled={busy === q.id}
                        onClick={() => void claim(q.id)}
                      >
                        {busy === q.id ? 'einen Moment …' : `Übernehmen · 2 Std. für dich`}
                      </button>
                    )}
                    {q.status === 'open' && isMine && (
                      <span className="xs mut grow">
                        Deine Meldung. Wegräumen darf sie jemand anderes — sonst wären Melden und
                        Erledigen ein Klick.
                      </span>
                    )}
                    {q.status !== 'open' && (
                      <button
                        className="btn grow"
                        onClick={() => navigate(`/quests/${q.id}/nachweis`)}
                      >
                        Nachweis ansehen
                      </button>
                    )}
                    <button
                      className="btn"
                      aria-label="Weg dorthin"
                      onClick={() => navigate(`/route/${q.id}`)}
                    >
                      <Icon name="route" size={17} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------
   Melden — what a scan turns into when the route was "Als Quest melden".
   ------------------------------------------------------------------ */

function Melden({ scan, onDone }: { scan: ScanResult; onDone: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(scan.subtype ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<QuestHazardRefusal | null>(null)
  const [done, setDone] = useState<QuestDetail | null>(null)

  /* The hard rule, and it is checked on both sides: a hazardous find never
     becomes a claimable quest. The screen refuses before the server has to,
     so there is not even a form to fill in. */
  const hazard = scan.hazard ?? refusal?.hazard ?? null

  if (hazard) {
    return (
      <div className="card" style={{ borderColor: 'var(--alert)', gap: 10 }}>
        <span className="row" style={{ gap: 8 }}>
          <Icon name="shield" size={20} />
          <b>Das wird keine Quest</b>
        </span>
        <p className="sm" style={{ margin: 0 }}>
          Gefahrstoffe räumt niemand freiwillig weg, und ReMain bezahlt auch niemanden dafür. FES
          sagt es Freiwilligen bei Sauberkeitsaktionen ausdrücklich: Farbeimer, Ölkanister und
          Autobatterien nicht einsammeln, sondern den Fundort melden.
        </p>
        <button className="btn primary" onClick={() => navigate(`/erkannt/${scan.photoId}`)}>
          Zum sicheren Weg
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="card" style={{ gap: 10 }}>
        <span className="row" style={{ gap: 8 }}>
          <Icon name="check" size={20} />
          <b>{done.quest.title} steht auf der Karte</b>
        </span>
        <p className="sm mut" style={{ margin: 0 }}>
          {done.message}
        </p>
        {done.award && (
          <span className="row between">
            <span className="row" style={{ gap: 7 }}>
              <Coin star>+{done.award.xp} XP</Coin>
              <Tag von="estimate">Schätzung</Tag>
            </span>
            <button
              className="btn sm"
              onClick={() => navigate(`/nachweis/${done.award?.actionId}`)}
            >
              Beleg
            </button>
          </span>
        )}
        {done.award?.blocked && done.award.hint && (
          <p className="xs mut" style={{ margin: 0 }}>
            {done.award.hint}
          </p>
        )}
      </div>
    )
  }

  async function melden() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<QuestDetail>('/api/quests', {
        title,
        note,
        photoId: scan.photoId,
        category: scan.category,
      })
      setDone(result)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'hazard_not_a_quest') {
        // The server saw something the screen did not. It wins.
        setRefusal({ hazard: {} } as unknown as QuestHazardRefusal)
        setError(err.message)
      } else {
        setError(err instanceof ApiError ? err.message : 'Das Melden hat nicht geklappt.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ gap: 11 }}>
      <span className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
        <img
          src={`/api/photos/${scan.photoId}`}
          alt=""
          style={{ width: 56, height: 56, borderRadius: 13, objectFit: 'cover', flexShrink: 0 }}
        />
        <span className="grow">
          <b className="sm" style={{ display: 'block' }}>
            Als Quest melden
          </b>
          <span className="xs mut">
            Dein Foto wird das Vorher-Bild. Wer es wegräumt, fotografiert dieselbe Stelle noch
            einmal — daraus entsteht der Nachweis.
          </span>
        </span>
      </span>

      <input
        className="field"
        value={title}
        maxLength={80}
        placeholder="Was liegt da? „Müllsack an der Bushaltestelle“"
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="field"
        value={note}
        maxLength={200}
        placeholder="Hinweis für die Person, die hingeht (optional)"
        onChange={(e) => setNote(e.target.value)}
      />

      {error && (
        <p className="xs" style={{ margin: 0, color: 'var(--alert)' }}>
          {error}
        </p>
      )}

      <button
        className="btn primary"
        disabled={busy || title.trim().length < 3}
        onClick={() => void melden()}
      >
        {busy ? 'wird gemeldet …' : 'Melden'}
      </button>
      <p className="xs mut" style={{ margin: 0 }}>
        Der Standort kommt aus deinem Foto. Ohne ihn kann niemand hingehen und niemand
        gegenprüfen — deshalb ist er Pflicht.
      </p>
    </div>
  )
}
