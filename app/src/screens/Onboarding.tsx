import { useEffect, useRef, useState } from 'react'
import BrandMark from '../components/BrandMark'
import Icon from '../components/Icon'
import LanguagePicker from '../components/LanguagePicker'
import { t } from '../lib/i18n'

const steps = [
  { title: 'Scannen', body: 'Finde heraus, wohin es gehört oder wer es noch brauchen kann.' },
  { title: 'Weitergeben', body: 'Biete Dinge an oder finde Hilfe beim Reparieren.' },
  { title: 'Abholung planen', body: 'Prüfe kommende Transporte in deinen Mitteilungen oder buche eine Abholung.' },
] as const

function Illustration({ step }: { step: number }) {
  return <div className={`welcome-art welcome-art-${step}`} aria-hidden="true">
    <div className="welcome-art-orbit" />
    <span className="welcome-art-leaf"><Icon name="leaf" size={32} /></span>
    {step === 0 ? <>
      <div className="welcome-scan-frame">
        <svg viewBox="0 0 200 210" className="welcome-chair" fill="none">
          <rect x="55" y="30" width="90" height="87" rx="22" fill="var(--blue)" />
          <path d="M72 52v42m28-42v42m28-42v42" stroke="var(--card)" strokeWidth="4" strokeLinecap="round" opacity=".55" />
          <rect x="42" y="111" width="116" height="24" rx="10" fill="var(--blue-deep)" />
          <path d="m57 135-9 48m95-48 9 48" stroke="var(--blue-ink)" strokeWidth="9" strokeLinecap="round" />
        </svg>
        <span className="welcome-scan-line" />
      </div>
    </> : step === 1 ? <>
      <div className="welcome-item welcome-item-back"><Icon name="wrench" size={60} /><span>{t('Reparieren')}</span></div>
      <div className="welcome-item welcome-item-front"><Icon name="cup" size={74} /><span>{t('Weitergeben')}</span></div>
      <span className="welcome-round-badge"><Icon name="check" size={26} /></span>
      <div className="welcome-art-label"><Icon name="pin" size={22} /><span>{t('In deiner Nähe')}</span></div>
    </> : <>
      <div className="welcome-route-line" />
      <span className="welcome-route-pin"><Icon name="pin" size={32} /></span>
      <div className="welcome-truck"><Icon name="truck" size={105} stroke={1.3} /></div>
      <div className="welcome-notice"><span className="welcome-notice-icon"><Icon name="bell" size={24} /></span><span><strong>{t('Mitteilungen')}</strong></span></div>
    </>}
  </div>
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [step])
  const current = steps[step]
  return <main className="app welcome">
    <header className="welcome-header">
      <div className="welcome-wordmark"><BrandMark /><span>{t('ReMain')}</span></div>
      <button className="welcome-text-button" onClick={onComplete}>{t('Überspringen')}</button>
    </header>
    <div className="welcome-language"><LanguagePicker /></div>
    <section className="welcome-content" key={step}>
      <Illustration step={step} />
      <div className="welcome-copy">
        <h1 ref={heading} tabIndex={-1}>{t(current.title)}</h1>
        <p className="welcome-description">{t(current.body)}</p>
      </div>
    </section>
    <footer className="welcome-footer">
      <nav className="welcome-dots" aria-label={t('Einführung')}>
        {steps.map((item, index) => <button key={item.title} aria-label={t(item.title)} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span /></button>)}
      </nav>
      <div className="welcome-actions">
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}><Icon name="back" size={20} />{t('Zurück')}</button>}
        <button className="btn primary" onClick={() => step === steps.length - 1 ? onComplete() : setStep(step + 1)}>{t(step === steps.length - 1 ? 'Los geht’s' : 'Weiter')}<Icon name="chevron" size={20} /></button>
      </div>
    </footer>
  </main>
}
