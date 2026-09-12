import mark from '../assets/remain-mark.svg?raw'
import { t } from '../lib/i18n'

/** One vector source for the app, splash, favicon and installed-app artwork. */
export default function BrandMark({ animated = false }: { animated?: boolean }) {
  return <span className={`brand-mark${animated ? ' brand-mark-animated' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: mark }} />
}

export function SplashScreen() {
  return <main className="app welcome-splash" role="status" aria-label={t('ReMain wird geladen')}>
    <div className="splash-glow" aria-hidden="true" />
    <BrandMark animated />
    <h1>{t('ReMain')}</h1>
    <p>{t('Weniger wegwerfen.')}</p>
    <span className="splash-track" aria-hidden="true"><span /></span>
    <span className="splash-place">{t('Frankfurt')}</span>
  </main>
}
