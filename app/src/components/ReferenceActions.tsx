import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DecisionSheet from './DecisionSheet'
import Icon from './Icon'
import { Bar, Coin } from './ui'
import { api, useApi } from '../lib/client'
import { useSession } from '../lib/session'

export interface Progression {
  bonuses: { actionId: number; title: string; xp: number; createdAt: string }[]
  weekly: { week: string; count: number; goal: number; xp: number; earned: boolean }
  invitation: { code: string; xp: number }
  quiz: { xp: number; completed: boolean }
  latestLevelBonus: { xp: number; actionId: number } | null
}
export function WeeklyGoal() {
  const data = useApi<Progression>('/api/progression')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  if (data.error) return <button className="btn sm" onClick={data.reload}>Wochenziel erneut laden</button>
  if (!data.data) return null
  const weekly = data.data.weekly
  return <>
    <button className="card tight" onClick={() => setOpen(true)}><div className="between" style={{ marginBottom: 9 }}><b className="sm">Wochenziel · {Math.min(weekly.count, weekly.goal)}/{weekly.goal}</b><Coin>+{weekly.xp}</Coin></div><Bar value={weekly.count} max={weekly.goal} /></button>
    {open && <DecisionSheet title="Dein Wochenziel" onClose={() => setOpen(false)}><p>Fünf bewertete Aktionen in einer Kalenderwoche bringen einmalig 30 Bonus-XP. Bonusgutschriften zählen nicht als zusätzliche Aktionen. Die Woche beginnt montags in Frankfurt.</p><p className="sm">{weekly.earned ? 'Geschafft! Der Bonus ist bereits gutgeschrieben.' : `Noch ${Math.max(0, weekly.goal - weekly.count)} Aktionen bis zum Bonus.`}</p><button className="btn primary" onClick={() => { setOpen(false); navigate('/wirkung') }}>Deine Wirkung ansehen</button></DecisionSheet>}
  </>
}
export function InviteNeighbour() {
  const data = useApi<Progression>('/api/progression')
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const url = new URL(import.meta.env.BASE_URL, window.location.origin)
  if (data.data) url.searchParams.set('invite', data.data.invitation.code)
  async function copy() {
    try { await navigator.clipboard.writeText(url.href); setMessage('Einladungslink kopiert.') }
    catch { setMessage('Bitte den Link markieren und kopieren.') }
  }
  return <>
    <button className="card row" disabled={!data.data} onClick={() => setOpen(true)}><Icon name="users" size={23} /><span className="grow"><b>Nachbar:in einladen</b><span className="xs mut" style={{ display: 'block' }}>Nach der ersten bewerteten Foto-Aktion</span></span><Coin>+50</Coin></button>
    {data.error && <button className="btn sm" onClick={data.reload}>Einladung erneut laden</button>}
    {open && <DecisionSheet title="Gemeinsam für Frankfurt" onClose={() => setOpen(false)}><p>Teile diesen Link. Meldet sich darüber eine neue Person an und bestätigt ihre erste bewertete Aktion mit Foto, erhältst du einmalig 50 Bonus-XP.</p><label className="sm">Dein Einladungslink<input className="field" readOnly value={url.href} onFocus={e => e.target.select()} /></label><button className="btn primary" onClick={() => void copy()}>Link kopieren</button>{message && <p role="status">{message}</p>}</DecisionSheet>}
  </>
}
interface QuizResult { passed: boolean; correct: boolean[]; explanations: string[]; credit?: { xp: number; coins: number; actionId: number; repeat: boolean } }
export function KnowledgeQuiz() {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const quiz = useApi<{ questions: { id: string; title: string; options: string[] }[] }>(open ? '/api/knowledge/quiz' : null)
  const { refresh } = useSession()
  const navigate = useNavigate()
  async function submit() {
    if (busy || !quiz.data) return
    setBusy(true); setError('')
    try {
      const response = await api.post<QuizResult>('/api/knowledge/quiz', { answers: quiz.data.questions.map((_, i) => answers[i]) })
      setResult(response); void refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Antworten konnten nicht geprüft werden.') }
    finally { setBusy(false) }
  }
  return <>
    <button className="card row" onClick={() => setOpen(true)}><Icon name="spark" size={22} /><span className="grow"><b>3 kurze Fragen dazu</b><span className="xs mut" style={{ display: 'block' }}>Wissen testen · einmaliger Bonus</span></span><Coin>+10</Coin></button>
    {open && <DecisionSheet title="Abfallwissen testen" onClose={() => setOpen(false)} busy={busy}>
      {quiz.loading && <p role="status">Fragen laden …</p>}
      {(quiz.error || error) && <div role="alert"><p>{error || quiz.error?.message}</p>{quiz.error && <button className="btn" onClick={quiz.reload}>Erneut laden</button>}</div>}
      {!result?.passed && quiz.data?.questions.map((q, i) => <fieldset className="quiz-question" key={q.id}><legend>{i + 1}. {q.title}</legend>{q.options.map((option, index) => <label className="quiz-answer" key={option}><input type="radio" name={`quiz-${q.id}`} checked={answers[i] === index} onChange={() => { setAnswers(a => ({ ...a, [i]: index })); setResult(null) }} disabled={busy} />{option}</label>)}</fieldset>)}
      {result && !result.passed && <div role="status"><b>Noch nicht alles richtig.</b>{result.explanations.map((text, i) => !result.correct[i] && <p className="sm" key={text}>{text}</p>)}</div>}
      {result?.passed ? <><p role="status">Alle drei richtig! {result.credit?.repeat ? 'Dein Quizbonus wurde bereits gutgeschrieben.' : `+${result.credit?.xp ?? 0} XP gutgeschrieben.`}</p><button className="btn primary" onClick={() => { setOpen(false); navigate(`/nachweis/${result.credit!.actionId}`) }}>Nachweis ansehen</button></> : <button className="btn primary" disabled={busy || !quiz.data || Object.keys(answers).length !== 3} onClick={() => void submit()}>{busy ? 'Wird geprüft …' : 'Antworten prüfen'}</button>}
    </DecisionSheet>}
  </>
}

export function BonusReceipts() {
  const data = useApi<Progression>('/api/progression')
  const navigate = useNavigate()
  if (!data.data?.bonuses.length) return null
  return <details className="card tight"><summary>Bonusgutschriften</summary><div className="col" style={{ gap: 8 }}>{data.data.bonuses.map(b => <button className="btn" key={b.actionId} onClick={() => navigate(`/nachweis/${b.actionId}`)}><span className="grow">{b.title}</span><Coin>+{b.xp}</Coin></button>)}</div></details>
}
