import { useState } from 'react'

import DecisionSheet from './DecisionSheet'
import Icon, { type IconName } from './Icon'
import { t } from './../lib/i18n'
import type { Badge } from '../lib/client'

/**
 * Bragging, kept small.
 *
 * An achievement is worth sharing for about five seconds, so this is a sheet
 * and not a screen: the moment, the networks, and a quiet way to copy.
 *
 * WHAT EACH NETWORK ACTUALLY SUPPORTS — this is the whole design constraint:
 *
 *   WhatsApp, X, Telegram   real share URLs. A link opens their composer
 *                           with the text already in it, on web and on a
 *                           phone. These can be plain links.
 *   Instagram               has NO such URL. There is no address that opens
 *                           a composer, and no amount of query-string
 *                           cleverness invents one. The only way a website
 *                           reaches Instagram is the operating system's own
 *                           share sheet, via navigator.share.
 *
 * So Instagram is shown only where navigator.share exists — on a phone. A
 * button that looks like the others and silently does nothing would be
 * exactly the kind of thing this product spends its time removing.
 *
 * Text, not a generated image. An image would look better in a feed, but it
 * means a canvas, embedded fonts and a File the browser must be willing to
 * hand over — three things that fail quietly on someone else's phone.
 */

const HASHTAG = '#ReMain #Frankfurt'

function shareText(badge: Badge): string {
  return `${badge.title} — ${badge.note} ${HASHTAG}`
}

/** Brand marks live here, not in Icon: that set is one-colour stroked paths. */
const MARKS: Record<string, { label: string; brand: string; path: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    brand: '#25D366',
    path: 'M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-2.9-1.3-4.8-4.3-5-4.5-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.2 1.4 2.5 1.5.3.1.4.1.6-.1l.9-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.2.1.7-.1 1.3z',
  },
  x: {
    label: 'X',
    brand: '#0f1419',
    path: 'M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.3-8.3L2.3 3h6.3l4.4 5.8L17.5 3zm-1.1 16.2h1.7L7.7 4.7H5.9l10.5 14.5z',
  },
  telegram: {
    label: 'Telegram',
    brand: '#229ED9',
    path: 'M21.9 4.3 18.8 19c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.8 12.8 2 11.3c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.3 1.6z',
  },
  instagram: {
    label: 'Instagram',
    brand: '#E4405F',
    // Drawn, not filled: the camera is a rounded square, a lens and a dot,
    // and as one filled path those three collapse into a blob at 21px.
    path: '',
  },
}

function Mark({ id }: { id: keyof typeof MARKS }) {
  if (id === 'instagram') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="21"
        height="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
      <path d={MARKS[id].path} fill="currentColor" />
    </svg>
  )
}

export default function ShareBadge({
  badge,
  icon,
  onClose,
}: {
  badge: Badge
  icon: IconName
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  const text = shareText(badge)
  const encoded = encodeURIComponent(text)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  /** The three that a plain link can actually reach. */
  const links: { id: keyof typeof MARKS; href: string }[] = [
    { id: 'whatsapp', href: `https://wa.me/?text=${encoded}` },
    { id: 'x', href: `https://twitter.com/intent/tweet?text=${encoded}` },
    { id: 'telegram', href: `https://t.me/share/url?url=&text=${encoded}` },
  ]

  async function systemShare() {
    try {
      await navigator.share({ title: badge.title, text })
    } catch {
      // A cancelled share rejects exactly like a failed one, so say nothing.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setFailed(false)
    } catch {
      // Clipboard access is refused over plain HTTP — which is exactly how
      // this app is opened on a phone across the LAN.
      setFailed(true)
    }
  }

  return (
    <DecisionSheet title={t('Geschafft')} onClose={onClose}>
      {/* Earning something should feel like earning something. The rays turn
          once behind the medal on open, the medal lands a beat later, and
          both stop — a moment, not an animation still running while somebody
          reads. prefers-reduced-motion gets the same card, still. */}
      <div className="share-card">
        <span className="share-card-burst" aria-hidden="true" />
        <span className="share-card-icon">
          <Icon name={icon} size={26} />
        </span>
        <span className="share-card-kicker xs">{t('Erreicht')}</span>
        <b className="h2">{t(badge.title)}</b>
        <span className="xs mut">{t(badge.note)}</span>
        <span className="share-card-tag xs">{HASHTAG}</span>
      </div>

      {/* One row, each in its own brand colour so the target is recognised
          before it is read. Instagram only appears where the OS share sheet
          exists, because that is the only route it has. */}
      <div className="share-targets">
        {links.map((l) => (
          <a
            key={l.id}
            className="share-target"
            style={{ color: MARKS[l.id].brand }}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${t('Teilen auf')} ${MARKS[l.id].label}`}
          >
            <Mark id={l.id} />
            <span className="xs">{MARKS[l.id].label}</span>
          </a>
        ))}

        {canShare && (
          <button
            className="share-target"
            style={{ color: MARKS.instagram.brand }}
            onClick={() => void systemShare()}
            aria-label={`${t('Teilen auf')} Instagram`}
          >
            <Mark id="instagram" />
            <span className="xs">Instagram</span>
          </button>
        )}
      </div>

      {/* Quietest, and last: it is the fallback, not the offer. */}
      <button className="btn ghost sm share-copy" onClick={() => void copy()}>
        {t(copied ? 'Kopiert' : 'Text kopieren')}
      </button>

      {failed && (
        <p className="xs mut" style={{ margin: 0 }}>
          {t('Kopieren ist hier nicht erlaubt — Text markieren und von Hand kopieren.')}
        </p>
      )}
    </DecisionSheet>
  )
}
