import PhotoCompare from '../components/PhotoCompare'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Map from '../components/Map'
import Screen from '../components/Screen'
import { Coin, Label, Tag, type Herkunft } from '../components/ui'
import {
  api,
  ApiError,
  type QuestDetail,
  type QuestSignal,
  type QuestStep,
} from '../lib/client'
import { useSession } from '../lib/session'

/** The signal's own provenance, in the product's vocabulary. */
const HERKUNFT: Record<QuestSignal['tier'], Herkunft> = {
  confirmed: 'api',
  input: 'input',
  estimated: 'estimate',
  simulated: 'simulated',
}

const MARK: Record<QuestSignal['verdict'], { icon: 'check' | 'cross' | 'info'; sign: string }> = {
  pass: { icon: 'check', sign: '+' },
  fail: { icon: 'cross', sign: '−' },
  unknown: { icon: 'info', sign: '±' },
}

const VERDICT: Record<string, { title: string; tone: 'plain' | 'warn' }> = {
  plausible: { title: 'Die Belege tragen', tone: 'plain' },
  pending: { title: 'Zwei Leute werden gefragt', tone: 'warn' },
  unmatched: { title: 'Die Belege passen nicht zusammen', tone: 'warn' },
}

/* ------------------------------------------------------------------
   The after-photo. Downscaled and re-encoded on the device — which is
   what actually drops the EXIF block, the GPS tag included. Position
   and capture time then travel as explicit fields the person agreed to.
   ------------------------------------------------------------------ */

const MAX_EDGE = 1280
const MAX_BYTES = 180_000

async function verkleinern(source: HTMLImageElement): Promise<{ blob: Blob; hash: string }> {
  const sw = source.naturalWidth
  const sh = source.naturalHeight
  if (!sw || !sh) throw new Error('Das Bild ist leer.')

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)

  const encode = (quality: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht speichern.'))),
        'image/jpeg',
        quality,
      ),
    )

  let blob = await encode(0.82)
  for (const quality of [0.7, 0.6, 0.5]) {
    if (blob.size <= MAX_BYTES) break
    blob = await encode(quality)
  }
  return { blob, hash: dHash(source) }
}

/**
 * The same 64-bit difference hash the server computes, as a fallback.
 *
 * The server normally does this itself from the stored bytes, which is the
 * version that counts. A browser can forge this one, so it is tagged „deine
 * Angabe" and can never carry a verdict alone — it only fills in when the
 * server could not read the file at all.
 */
function dHash(source: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(source, 0, 0, 9, 8)
  const { data } = ctx.getImageData(0, 0, 9, 8)

  const grey = (x: number, y: number) => {
    const i = (y * 9 + x) * 4
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let hex = ''
  for (let y = 0; y < 8; y++) {
    let nibble = 0
    let bits = 0
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (grey(x, y) > grey(x + 1, y) ? 1 : 0)
      if (++bits === 4) {
        hex += nibble.toString(16)
        nibble = 0
        bits = 0
      }
    }
  }
  return hex
}

function bildAusDatei(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Diese Datei ist kein Bild.'))
    }
    img.src = url
  })
}

/* ------------------------------------------------------------------ */

/**
 * One quest, from gemeldet to bestätigt, with the proof written out.
 *
 * The claim of this screen — and of the product — is that a number can be
 * defended. So the four signals are each shown with what they measured, what
 * it was worth, and where the value came from; and the sentence under the
 * verdict says plainly that the arithmetic decided and the model only
 * advised. Hiding any of that would make the credit a matter of trust, which
 * is exactly what it is meant not to be.
 */
export default function QuestProof() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { me, refresh } = useSession()

  const passed = (location.state as { detail?: QuestDetail } | null)?.detail ?? null

  const [detail, setDetail] = useState<QuestDetail | null>(passed)
  const [loading, setLoading] = useState(passed === null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(passed?.message ?? null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ortRef = useRef<{ lat: number; lon: number } | null>(null)

  const load = () => {
    if (!id) return
    api
      .get<QuestDetail>(`/api/quests/${id}/proof`)
      .then(setDetail)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Keine Verbindung zum Server.'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        ortRef.current = { lat: p.coords.latitude, lon: p.coords.longitude }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  async function einreichen(file: File) {
    if (!id) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const img = await bildAusDatei(file)
      const { blob, hash } = await verkleinern(img)

      const ort = ortRef.current
      const form = new FormData()
      if (ort) {
        form.append('lat', String(ort.lat))
        form.append('lon', String(ort.lon))
      }
      form.append('takenAt', new Date().toISOString())
      form.append('file', blob, 'nachher.jpg')

      const photo = await api.upload<{ id: string }>('/api/photos', form)
      const result = await api.post<QuestDetail>(`/api/quests/${id}/submit`, {
        photoId: photo.id,
        hash,
      })
      setDetail(result)
      void refresh()
      setMessage(result.message ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Der Nachweis ließ sich nicht senden.')
    } finally {
      setBusy(false)
    }
  }

  async function zurueckgeben() {
    if (!id) return
    setBusy(true)
    try {
      const result = await api.post<QuestDetail>(`/api/quests/${id}/release`)
      setDetail(result)
      void refresh()
      setMessage(result.message ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Screen back title="Nachweis" sub="wird geladen …">
        <div className="empty">
          <span className="spinner" />
        </div>
      </Screen>
    )
  }

  if (!detail) {
    return (
      <Screen back title="Nachweis">
        <div className="empty">
          <Icon name="cross" size={24} />
          {error ?? 'Diese Quest gibt es nicht.'}
        </div>
      </Screen>
    )
  }

  const { quest, submission, review, credit } = detail
  const isClaimer = quest.claimedBy === me?.id
  const isSubmitter = submission?.userId === me?.id
  const canSubmit = isClaimer && quest.status === 'claimed'
  const verdict = submission ? (VERDICT[submission.verdict] ?? VERDICT.pending) : null

  return (
    <Screen
      back
      title={quest.title}
      sub={`${quest.district ?? 'Frankfurt'} · ${quest.xp} XP`}
      footer={
        canSubmit ? (
          <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'wird geprüft …' : 'Nachher-Foto aufnehmen'}
          </button>
        ) : undefined
      }
    >
      <Kette chain={detail.chain} />

      {message && (
        <div className="card sky tight">
          <span className="sm">{message}</span>
        </div>
      )}
      {error && (
        <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
          <span className="sm">{error}</span>
        </div>
      )}

      {/* ------- the two photos ------- */}
      {quest.photoId && submission?.photoId ? <PhotoCompare before={quest.photoId} after={submission.photoId} /> : <div className="row" style={{ gap: 10 }}>
        <Foto id={quest.photoId} label="Vorher" by={quest.createdBy} />
        <Foto
          id={submission?.photoId ?? null}
          label="Nachher"
          by={submission?.userName ?? null}
          empty={canSubmit ? 'Noch kein Foto' : 'Steht noch aus'}
        />
      </div>}

      {quest.note && (
        <p className="sm mut" style={{ margin: 0 }}>
          {quest.note}
        </p>
      )}

      {/* ------- taking it on ------- */}
      {detail.canClaim && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              setDetail(await api.post<QuestDetail>(`/api/quests/${quest.id}/claim`))
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Übernehmen · 2 Stunden für dich
        </button>
      )}
      {!detail.canClaim && detail.claimBlockedWhy && !submission && (
        <p className="xs mut" style={{ margin: 0 }}>
          {detail.claimBlockedWhy}
        </p>
      )}

      {canSubmit && quest.claimSecondsLeft !== null && (
        <div className="card sky tight">
          <span className="row between">
            <span className="row" style={{ gap: 7 }}>
              <Icon name="clock" size={17} />
              <b className="sm">Noch {Math.round(quest.claimSecondsLeft / 60)} Min. für dich</b>
            </span>
            <button className="btn sm" disabled={busy} onClick={() => void zurueckgeben()}>
              Zurückgeben
            </button>
          </span>
          <p className="xs mut" style={{ margin: '6px 0 0' }}>
            Fotografiere dieselbe Stelle aus derselben Richtung. Der Bildvergleich sucht Bordstein,
            Wand und Pflaster — nicht den Müll.
          </p>
        </div>
      )}

      {/* ------- the verdict ------- */}
      {submission && verdict && (
        <div className="card" style={{ gap: 12 }}>
          <span className="row between">
            <span className="row" style={{ gap: 8 }}>
              <Icon name={submission.verdict === 'plausible' ? 'check' : 'shield'} size={19} />
              <b>{verdict.title}</b>
            </span>
            <Label tone={verdict.tone}>{submission.verdictLabel}</Label>
          </span>

          {submission.blind ? (
            <p className="sm mut" style={{ margin: 0 }}>
              Du kannst diesen Nachweis gegenprüfen — deshalb bleiben die vier Signale bis nach
              deiner Antwort verdeckt. Wer das Urteil der Regeln schon gelesen hat, ist keine
              zweite Meinung mehr.
            </p>
          ) : (
            <>
              {submission.score !== null && submission.maxScore !== null && (
                <span className="row" style={{ gap: 8 }}>
                  <b className="num">
                    {submission.score} / {submission.maxScore}
                  </b>
                  <span className="xs mut">Prüfpunkte</span>
                </span>
              )}

              <div className="col" style={{ gap: 10 }}>
                {(submission.signals ?? []).map((signal) => (
                  <Signal key={signal.id} signal={signal} />
                ))}
              </div>

              {submission.rule && (
                <p className="xs mut" style={{ margin: 0 }}>
                  <b>Die Regeln entscheiden, das Modell berät.</b> {submission.rule}
                </p>
              )}

              {submission.steps && submission.steps.length > 0 && (
                <details>
                  <summary className="xs mut" style={{ cursor: 'pointer' }}>
                    Rechenweg
                  </summary>
                  <ul className="xs mut" style={{ margin: '7px 0 0', paddingLeft: 17 }}>
                    {submission.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ------- peer review ------- */}
      {review && submission && (
        <div className="card" style={{ gap: 10 }}>
          <span className="row between">
            <span className="row" style={{ gap: 8 }}>
              <Icon name="users" size={18} />
              <b>Gegenprüfung</b>
            </span>
            <span className="xs mut">
              {review.counts.clean} ja · {review.counts.not_clean} nein ·{' '}
              {review.counts.cannot_see} unklar
            </span>
          </span>

          <p className="sm mut" style={{ margin: 0 }}>
            {review.outcome === 'released'
              ? `${review.quorum} übereinstimmende Antworten haben die Gutschrift freigegeben.`
              : review.outcome === 'rejected'
                ? `${review.quorum} Antworten sagen, dass es nicht sauber ist. Die Quest steht wieder auf der Karte.`
                : review.open
                  ? `Noch ${review.quorum - Math.max(review.counts.clean, review.counts.not_clean)} übereinstimmende Antwort, dann ist entschieden.`
                  : 'Entschieden.'}
          </p>

          {review.canReview && (
            <button
              className="btn primary"
              onClick={() => navigate(`/review/${submission.id}`)}
            >
              Jetzt gegenprüfen · +15 XP
            </button>
          )}
          {!review.canReview && review.why && (
            <p className="xs mut" style={{ margin: 0 }}>
              {review.why}
            </p>
          )}
          <p className="xs mut" style={{ margin: 0 }}>
            {review.note}
          </p>
        </div>
      )}

      {/* ------- the credit ------- */}
      {credit && (
        <div className="card" style={{ gap: 10 }}>
          <span className="row between">
            <span className="row" style={{ gap: 8 }}>
              <Coin star>+{credit.xp} XP</Coin>
              <Coin>+{credit.coins} Mz.</Coin>
            </span>
            <Tag von="api">plausibel</Tag>
          </span>
          <p className="xs mut" style={{ margin: 0 }}>
            Gutgeschrieben an {submission?.userName ?? 'die Person, die es weggeräumt hat'}.
          </p>
          {isSubmitter && (
            <button className="btn" onClick={() => navigate(`/nachweis/${credit.actionId}`)}>
              Beleg mit Formel ansehen
            </button>
          )}
        </div>
      )}

      {/* ------- where ------- */}
      <Map
        centre={{ lat: quest.lat, lon: quest.lon }}
        markers={[
          {
            id: quest.id,
            lat: quest.lat,
            lon: quest.lon,
            badge: `${quest.xp}`,
            label: quest.title,
            tone: quest.status === 'confirmed' ? 'done' : quest.status === 'open' ? 'open' : 'claimed',
          },
        ]}
        height={170}
        zoom={16}
        still
      />
      <p className="xs mut" style={{ margin: '-4px 2px 0' }}>
        {detail.attribution}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void einreichen(file)
        }}
      />
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function Kette({ chain }: { chain: QuestStep[] }) {
  return (
    <div className="row" style={{ gap: 0, alignItems: 'stretch' }}>
      {chain.map((step, i) => (
        <span
          key={step.id}
          className="col"
          style={{ flex: 1, gap: 5, alignItems: 'center', textAlign: 'center' }}
        >
          <span className="row" style={{ width: '100%', alignItems: 'center', gap: 0 }}>
            <i
              style={{
                flex: 1,
                height: 2,
                background: i === 0 ? 'transparent' : step.done ? 'var(--blue-deep)' : 'var(--line)',
              }}
            />
            <i
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                flexShrink: 0,
                background: step.done ? 'var(--blue-deep)' : 'var(--card)',
                border: `2px solid ${step.done ? 'var(--blue-deep)' : 'var(--line)'}`,
              }}
            />
            <i
              style={{
                flex: 1,
                height: 2,
                background:
                  i === chain.length - 1
                    ? 'transparent'
                    : chain[i + 1].done
                      ? 'var(--blue-deep)'
                      : 'var(--line)',
              }}
            />
          </span>
          <span className="xs" style={{ color: step.done ? 'var(--ink)' : 'var(--ink3)' }}>
            {step.label}
          </span>
        </span>
      ))}
    </div>
  )
}

function Foto({
  id,
  label,
  by,
  empty,
}: {
  id: string | null
  label: string
  by: string | null
  empty?: string
}) {
  return (
    <span className="col grow" style={{ gap: 5 }}>
      {id ? (
        <img
          src={`/api/photos/${id}`}
          alt={label}
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            objectFit: 'cover',
            borderRadius: 'var(--r)',
            border: '1px solid var(--line)',
          }}
        />
      ) : (
        <span
          className="empty"
          style={{
            aspectRatio: '4 / 3',
            borderRadius: 'var(--r)',
            border: '1px dashed var(--line)',
            margin: 0,
            fontSize: 12,
          }}
        >
          <Icon name="camera" size={20} />
          {empty ?? 'Kein Foto'}
        </span>
      )}
      <span className="xs mut">
        <b>{label}</b>
        {by && ` · ${by}`}
      </span>
    </span>
  )
}

function Signal({ signal }: { signal: QuestSignal }) {
  const mark = MARK[signal.verdict]
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 9,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: signal.verdict === 'fail' ? 'var(--alert-soft)' : 'var(--sky)',
          color: signal.verdict === 'fail' ? 'var(--alert)' : 'var(--blue-ink)',
        }}
      >
        <Icon name={mark.icon} size={15} stroke={2.2} />
      </span>

      <span className="grow">
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <b className="sm">{signal.label}</b>
          <Tag von={HERKUNFT[signal.tier]} />
          {signal.veto && <Label tone="warn">allein entscheidend</Label>}
        </span>
        <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
          {signal.value} · {signal.detail}
        </span>
        <span className="xs" style={{ display: 'block', marginTop: 2, color: 'var(--ink3)' }}>
          {signal.source}
        </span>
      </span>

      <b className="sm num" style={{ flexShrink: 0 }}>
        {mark.sign}
        {Math.abs(signal.points)}
      </b>
    </div>
  )
}
