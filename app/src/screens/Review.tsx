import { t } from './../lib/i18n'
import { useSession } from '../lib/session'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Coin, Label, Tag, type Herkunft } from '../components/ui'
import {
  api,
  ApiError,
  type QuestAnswer,
  type QuestDetail,
  type QuestSignal,
} from '../lib/client'

const HERKUNFT: Record<QuestSignal['tier'], Herkunft> = {
  confirmed: 'api',
  input: 'input',
  estimated: 'estimate',
  simulated: 'simulated',
}

const OPTIONS: { id: QuestAnswer; label: string; hint: string; icon: 'check' | 'cross' | 'info' }[] = [
  {
    id: 'clean',
    label: 'Ja, sauber',
    hint: 'Das, was auf dem ersten Bild lag, ist weg.',
    icon: 'check',
  },
  {
    id: 'not_clean',
    label: 'Nein',
    hint: 'Es liegt noch da, oder das zweite Bild zeigt einen anderen Ort.',
    icon: 'cross',
  },
  {
    id: 'cannot_see',
    label: 'Kann ich nicht sehen',
    hint: 'Zu dunkel, zu nah, falscher Ausschnitt — die ehrlichste Antwort, wenn sie stimmt.',
    icon: 'info',
  },
]

/**
 * Gegenprüfen — one question, twenty seconds, anonymous.
 *
 * This is the part of the product that cannot be automated away. Four
 * signals get a clean-up most of the way, and where they do not, a person
 * who knows the corner decides. Two matching answers release a stranger's
 * credit; the answer is stored without being shown to anybody as "who said
 * what", and the only thing kept against a name is that this person already
 * answered — which is the rule that stops one phone voting twice.
 *
 * The signals stay hidden until the answer is in. A reviewer who has just
 * read „die Regeln sagen plausibel" is no longer a second opinion, and this
 * screen is only worth something as a second opinion.
 */
export default function Review() {
  const { submissionId } = useParams()
  const navigate = useNavigate()
  const { refresh } = useSession()

  const [detail, setDetail] = useState<QuestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<QuestAnswer | null>(null)
  const [result, setResult] = useState<QuestDetail | null>(null)

  useEffect(() => {
    if (!submissionId) return
    api
      .get<QuestDetail>(`/api/reviews/${submissionId}`)
      .then(setDetail)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Keine Verbindung zum Server.'),
      )
      .finally(() => setLoading(false))
  }, [submissionId])

  async function antworten(answer: QuestAnswer) {
    if (!submissionId) return
    setBusy(answer)
    setError(null)
    try {
      const answered = await api.post<QuestDetail>(`/api/reviews/${submissionId}`, { answer })
      void refresh()
      setResult(answered)
      setDetail(answered)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die Antwort kam nicht an.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <Screen back title={t("Foto prüfen")}>
        <div className="empty">
          <span className="spinner" />
        </div>
      </Screen>
    )
  }

  if (!detail?.submission) {
    return (
      <Screen back title={t("Foto prüfen")}>
        <div className="empty">
          <Icon name="cross" size={24} />
          {t(error ?? 'Zu diesem Nachweis gibt es nichts zu prüfen.')}
        </div>
      </Screen>
    )
  }

  const { quest, submission, review } = detail
  const answered = result !== null || review?.mine != null

  return (
    <Screen
      back
      title={t("Foto prüfen")}
      sub={t(answered ? 'Danke für deine Rückmeldung' : 'Wurde der Ort aufgeräumt?')}
    >
      {/* ------- the two photos, as large as they go ------- */}
      <div className="review-photos">
        <Bild id={quest.photoId} label={t("Vorher")} sub={t(quest.createdBy ?? 'gemeldet')} />
        <Bild
          id={submission.photoId}
          label={t("Nachher")}
          sub={t(submission.userName ?? 'eingereicht')}
        />
      </div>

      <div className="card tight" style={{ gap: 4 }}>
        <b className="sm">{quest.title}</b>
        <span className="xs mut">
          {t(quest.district ?? 'Frankfurt')}
          {t(quest.note ? ` · ${quest.note}` : '')}
        </span>
      </div>

      {t(error && (
        <div className="card tight" style={{ borderColor: 'var(--alert)' }}>
          <span className="sm">{t(error)}</span>
        </div>
      ))}

      {/* ------- the question ------- */}
      {t(!answered && review?.canReview && (
        <>
          <h2 className="h2" style={{ margin: '2px 0 0' }}>
            {t(review.question)}
          </h2>
          <div className="col" style={{ gap: 9 }}>
            {t(OPTIONS.map((option) => (
              <button
                key={option.id}
                className="card tight row"
                style={{ gap: 11, alignItems: 'flex-start', textAlign: 'left' }}
                disabled={busy !== null}
                onClick={() => void antworten(option.id)}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--sky)',
                    color: 'var(--blue-ink)',
                  }}
                >
                  <Icon name={option.icon} size={17} stroke={2.2} />
                </span>
                <span className="grow">
                  <b className="sm">{t(option.label)}</b>
                  <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                    {t(option.hint)}
                  </span>
                </span>
                {t(busy === option.id && <span className="spinner" />)}
              </button>
            )))}
          </div>
          <p className="xs mut" style={{ margin: 0 }}>
            {t(review.note)} {t(" Zwei übereinstimmende Antworten entscheiden. Für deine Antwort bekommst du 15 XP — egal wie sie ausfällt.")}</p>
        </>
      ))}

      {t(!answered && review && !review.canReview && (
        <div className="card tight">
          <span className="row" style={{ gap: 8 }}>
            <Icon name="info" size={17} />
            <span className="sm">{t(review.why ?? 'Diesen Nachweis prüfst du nicht.')}</span>
          </span>
        </div>
      ))}

      {/* ------- after the answer ------- */}
      {t(answered && (
        <div className="card" style={{ gap: 11 }}>
          <span className="row between">
            <span className="row" style={{ gap: 8 }}>
              <Icon name="check" size={19} />
              <b>{t("Antwort gespeichert")}</b>
            </span>
            {t(result?.award && <Coin star>{t("+")}{t(result.award.xp)} {t(" XP")}</Coin>)}
          </span>

          <p className="sm mut" style={{ margin: 0 }}>
            {t(result?.message ??
              `Deine Antwort zählt. ${review?.counts.clean ?? 0} ja, ${review?.counts.not_clean ?? 0} nein.`)}
          </p>

          {t(result?.award?.blocked && result.award.hint && (
            <p className="xs mut" style={{ margin: 0 }}>
              {t(result.award.hint)}
            </p>
          ))}

          {t(result?.outcome === 'released' && result.released && (
            <span className="row" style={{ gap: 7 }}>
              <Label tone="plain">{t("freigegeben")}</Label>
              <span className="xs mut">
                {t(submission.userName ?? 'Die Person')} {t(" bekommt ")}{t(result.released.xp)} {t(" XP.")}</span>
            </span>
          ))}

          {t(result?.award && (
            <button
              className="btn"
              onClick={() => navigate(`/nachweis/${result.award?.actionId}`)}
            >
              {t("Dein Beleg")}</button>
          ))}
        </div>
      ))}

      {/* ------- what the rules had found, revealed afterwards ------- */}
      {t(answered && submission.signals && (
        <div className="card" style={{ gap: 11 }}>
          <span className="row between">
            <b className="sm">{t("Was die Regeln gefunden hatten")}</b>
            <Label tone={submission.verdict === 'plausible' ? 'plain' : 'warn'}>
              {t(submission.verdictLabel)}
            </Label>
          </span>
          <p className="xs mut" style={{ margin: 0 }}>
            {t("Erst jetzt sichtbar — vorher hätte es deine Antwort vorgeprägt.")}{t(submission.score !== null && ` ${submission.score} von ${submission.maxScore} Prüfpunkten.`)}
          </p>

          <div className="col" style={{ gap: 9 }}>
            {t(submission.signals.map((signal) => (
              <div key={signal.id} className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: signal.verdict === 'fail' ? 'var(--alert-soft)' : 'var(--sky)',
                    color: signal.verdict === 'fail' ? 'var(--alert)' : 'var(--blue-ink)',
                  }}
                >
                  <Icon
                    name={signal.verdict === 'pass' ? 'check' : signal.verdict === 'fail' ? 'cross' : 'info'}
                    size={13}
                    stroke={2.2}
                  />
                </span>
                <span className="grow">
                  <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <b className="xs">{t(signal.label)}</b>
                    <Tag von={HERKUNFT[signal.tier]} />
                  </span>
                  <span className="xs mut" style={{ display: 'block', marginTop: 2 }}>
                    {t(signal.value)} {t(" · ")}{t(signal.detail)}
                  </span>
                </span>
              </div>
            )))}
          </div>

          {t(submission.rule && (
            <p className="xs mut" style={{ margin: 0 }}>
              <b>{t("Die Regeln entscheiden, das Modell berät.")}</b> {t(submission.rule)}
            </p>
          ))}

          <button className="btn" onClick={() => navigate(`/quests/${quest.id}/nachweis`)}>
            {t("Ganzen Nachweis ansehen")}</button>
        </div>
      ))}
    </Screen>
  )
}

function Bild({ id, label, sub }: { id: string | null; label: string; sub: string }) {
  return (
    <span className="col" style={{ gap: 5, position: 'relative' }}>
      {t(id ? (
        <img
          src={`/api/photos/${id}`}
          alt={t(label)}
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
          style={{ aspectRatio: '4 / 3', borderRadius: 'var(--r)', margin: 0 }}
        >
          <Icon name="camera" size={20} />
          {t("Kein Foto")}</span>
      ))}
      <span className="xs mut">
        <b>{t(label)}</b> {t(" · ")}{t(sub)}
      </span>
    </span>
  )
}
