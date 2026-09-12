import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from './Icon'
import { t } from '../lib/i18n'
import { tourPosition } from '../lib/dashboardTour'

const steps: { target: string; icon: IconName; title: string; description: string }[] = [
  { target: 'scan', icon: 'camera', title: 'Hier beginnt dein Scan', description: 'Tippe auf die Kamera, um einen Gegenstand zu fotografieren. ReMain zeigt dir passende Möglichkeiten zum Weitergeben, Reparieren oder Entsorgen.' },
  { target: 'notifications', icon: 'bell', title: 'Abholungen und Neuigkeiten', description: 'Über die Glocke findest du deine Mitteilungen. Hier prüfst du kommende Transporte, planst eine Abholung und behältst deine Termine im Blick.' },
  { target: 'quests', icon: 'quest', title: 'Hilf in deiner Nachbarschaft', description: 'Die Flagge führt zu den Quests. Entdecke gemeldete Stellen in deiner Nähe und hilf beim Aufräumen.' },
  { target: 'market', icon: 'market', title: 'Weitergeben statt wegwerfen', description: 'Im Reparaturmarkt kannst du Dinge anbieten, nach Angeboten suchen und Hilfe bei einer Reparatur finden.' },
  { target: 'impact', icon: 'leaf', title: 'Sieh, was du bewirkst', description: 'Das Blatt öffnet deine Wirkung. Dort findest du deine Aktionen, Fortschritte und Nachweise.' },
  { target: 'settings', icon: 'settings', title: 'Mach ReMain zu deiner App', description: 'Hier änderst du dein Profil, die Sprache und die Darstellung. Du bist startklar — probiere deinen ersten Scan aus.' },
]

export default function DashboardTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState({ top: 16, left: 16, width: 320 })
  const dialog = useRef<HTMLDialogElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const current = steps[step]

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current!
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    element.showModal()
    next.current?.focus({ preventScroll: true })
    return () => {
      element.close()
      document.documentElement.style.overflow = previousOverflow
      previous?.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-dashboard-tour="${current.target}"]`)
    if (!target) { setBounds(null); return }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    let frame = 0
    const measure = () => {
      const rect = target.getBoundingClientRect()
      setBounds(rect)
      setPosition(tourPosition(rect, { width: window.innerWidth, height: window.innerHeight }, card.current?.offsetHeight || 280))
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(target)
    if (card.current) observer.observe(card.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [current.target])

  return createPortal(<dialog ref={dialog} className="dashboard-tour" aria-labelledby="dashboard-tour-title" aria-describedby="dashboard-tour-description" onCancel={event => { event.preventDefault(); onFinish() }}>
    {bounds && <div className="dashboard-tour-spotlight" data-round={current.target === 'scan' || current.target === 'settings' || current.target === 'notifications'} aria-hidden="true" style={{ top: bounds.top - 6, left: bounds.left - 6, width: bounds.width + 12, height: bounds.height + 12 }} />}
    <div ref={card} className="dashboard-tour-card" style={position}>
      <div className="dashboard-tour-heading">
        <span className="dashboard-tour-icon"><Icon name={current.icon} size={22} /></span>
        <span className="dashboard-tour-count">{t(`${step + 1} von ${steps.length}`)}</span>
        <button className="dashboard-tour-skip" onClick={onFinish}>{t('Überspringen')}</button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <h2 id="dashboard-tour-title">{t(current.title)}</h2>
        <p id="dashboard-tour-description">{t(current.description)}</p>
      </div>
      <div className="dashboard-tour-progress" aria-hidden="true">{steps.map((item, index) => <span key={item.target} className={index <= step ? 'done' : ''} />)}</div>
      <div className="dashboard-tour-actions">
        {step > 0 && <button className="btn" onClick={() => setStep(value => value - 1)}>{t('Zurück')}</button>}
        <button ref={next} className="btn primary" onClick={() => step === steps.length - 1 ? onFinish() : setStep(value => value + 1)}>{t(step === steps.length - 1 ? 'Verstanden' : 'Weiter')}<Icon name={step === steps.length - 1 ? 'check' : 'chevron'} size={18} /></button>
      </div>
    </div>
  </dialog>, document.body)
}
