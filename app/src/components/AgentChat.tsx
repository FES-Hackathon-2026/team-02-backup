import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon, { type IconName } from './Icon'
import { api } from '../lib/client'
import { t, getLanguage } from './../lib/i18n'

/**
 * Fessie, as a conversation.
 *
 * WHAT IT ACTUALLY IS, so nobody demos it as something it is not: this is
 * not a language model. It does two things, both real —
 *
 *   it looks a thing up   every question goes to /api/fes/abc, whose lookup
 *                         already matches free text against entry aliases,
 *                         so "wo kommt die batterie hin" finds `batterie`.
 *                         The answer is the actual FES rule, not generated
 *                         prose, which is why it can be trusted and why it
 *                         says "ich weiß es nicht" instead of inventing.
 *   it takes you places   the tools below the thread are the fourteen
 *                         destinations this app has, one tap away.
 *
 * Written as a chat because a question is how people arrive at a disposal
 * rule — not because there is a model behind it.
 */

interface Line {
  id: number
  from: 'agent' | 'you'
  text: string
  /** the ABC entry an answer came from, so the full rule is one tap away */
  entry?: { id: string; name: string }
  /** how it was answered: an exact rule, the model, or neither */
  source?: 'lookup' | 'model' | 'none'
}

interface AssistantReply {
  answer: string
  entry: { id: string; name: string } | null
  source: 'lookup' | 'model' | 'none'
}

/** The handful worth reaching without opening the full index. */
const TOOLS: { to: string; icon: IconName; label: string }[] = [
  { to: '/scan', icon: 'camera', label: 'Scannen' },
  { to: '/abholung', icon: 'truck', label: 'Abholung' },
  { to: '/markt', icon: 'market', label: 'Markt' },
  { to: '/essen', icon: 'leaf', label: 'Essen' },
  { to: '/kalender', icon: 'calendar', label: 'Termine' },
  { to: '/quests', icon: 'quest', label: 'Quests' },
]

/** Chrome and Edge only; Firefox and Safari have no implementation. */
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null
}

export default function AgentChat({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [lines, setLines] = useState<Line[]>([
    {
      id: 0,
      from: 'agent',
      text: 'Frag mich, wo etwas hingehört — oder nimm unten eine Abkürzung.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<Recognition | null>(null)

  const canListen = recognitionCtor() !== null

  // Keep the newest line in view without moving the page behind the sheet.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines, busy])

  useEffect(() => () => recRef.current?.stop(), [])

  async function ask(question: string) {
    const text = question.trim()
    if (text === '' || busy) return

    setDraft('')
    setBusy(true)
    setLines((l) => [...l, { id: l.length, from: 'you', text }])

    try {
      const reply = await api.post<AssistantReply>('/api/assistant', { question: text })
      setLines((l) => [
        ...l,
        {
          id: l.length,
          from: 'agent',
          text: reply.answer,
          entry: reply.entry ?? undefined,
          // An exact rule and a sentence a model wrote are different claims,
          // even when the model was holding the rules.
          source: reply.source,
        },
      ])
    } catch {
      setLines((l) => [
        ...l,
        { id: l.length, from: 'agent', text: 'Ich komme gerade nicht an die Daten.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  function toggleVoice() {
    const Ctor = recognitionCtor()
    if (!Ctor) return

    if (listening) {
      recRef.current?.stop()
      return
    }

    const rec = new Ctor()
    rec.lang = getLanguage() === 'en' ? 'en-GB' : 'de-DE'
    rec.interimResults = false
    rec.continuous = false
    // Straight to the question: dictating and then pressing send is two
    // steps for something that was one sentence.
    rec.onresult = (e) => void ask(e.results[0][0].transcript)
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div className="agent-chat">
      <div className="agent-thread" role="log" aria-live="polite">
        {lines.map((l) => (
          <div key={l.id} className={l.from === 'you' ? 'agent-line you' : 'agent-line'}>
            <p>{t(l.text)}</p>
            {l.source === 'model' && (
              <span className="agent-source xs">{t('von Fessie formuliert')}</span>
            )}
            {l.entry && (
              <button className="agent-entry-link xs" onClick={() => go(`/wissen?category=${l.entry!.id}`)}>
                {t('Ganze Regel')} <Icon name="chevron" size={13} />
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="agent-line">
            <span className="spinner sm" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* The common tools, always reachable without scrolling the thread. */}
      <div className="agent-tools">
        {TOOLS.map((tool) => (
          <button key={tool.to} className="agent-tool" onClick={() => go(tool.to)}>
            <Icon name={tool.icon} size={17} />
            <span className="xs">{t(tool.label)}</span>
          </button>
        ))}
      </div>

      <form
        className="agent-input"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(draft)
        }}
      >
        <input
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('Wo kommt … hin?')}
          aria-label={t('Frage an Fessie')}
          disabled={busy}
        />

        {/* Only where the browser actually has speech recognition. Chrome and
            Edge do; Firefox and Safari do not, and a mic that does nothing is
            worse than no mic. */}
        {canListen && (
          <button
            type="button"
            className={listening ? 'icobtn agent-mic on' : 'icobtn agent-mic'}
            onClick={toggleVoice}
            aria-pressed={listening}
            aria-label={t(listening ? 'Aufnahme beenden' : 'Per Sprache fragen')}
          >
            <Icon name={listening ? 'cross' : 'mic'} size={19} />
          </button>
        )}

        <button
          type="submit"
          className="icobtn agent-send"
          disabled={busy || draft.trim() === ''}
          aria-label={t('Fragen')}
        >
          <Icon name="chevron" size={19} />
        </button>
      </form>
    </div>
  )
}
