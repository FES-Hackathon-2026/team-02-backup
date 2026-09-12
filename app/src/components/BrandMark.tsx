import Icon from './Icon'
import { t } from '../lib/i18n'

/** The leaf and returning orbit represent keeping materials in use. */
export default function BrandMark({ animated = false }: { animated?: boolean }) {
  return <span className={`brand-mark${animated ? ' brand-mark-animated' : ''}`} aria-hidden="true">
    <svg className="brand-orbit" viewBox="0 0 100 100" fill="none">
      <path d="M78 24A37 37 0 1 0 86 58" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="m65 23 14 1-1-14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <Icon name="leaf" size={42} stroke={1.6} />
  </span>
}

export function SplashScreen() {
  return <main className="app welcome-splash" role="status" aria-label={t('ReMain wird geladen')}>
    <div className="splash-glow" aria-hidden="true" />
    <BrandMark animated />
    <h1>{t('ReMain')}</h1>
    <p>{t('Gutes bleibt im Kreislauf.')}</p>
    <span className="splash-track" aria-hidden="true"><span /></span>
    <span className="splash-place">{t('Für dich. Für Frankfurt.')}</span>
  </main>
}
