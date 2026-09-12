import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AgentChat from './AgentChat'
import DecisionSheet from './DecisionSheet'
import DinoMark from './DinoMark'
import Icon, { type IconName } from './Icon'
import { t } from './../lib/i18n'

/**
 * Fessie: one place that reaches everything.
 *
 * Five tabs and a scattering of cards cannot hold twenty screens, so most of
 * this app is reachable only by remembering which card leads where. This is
 * the index — every destination, grouped by what a person is trying to do,
 * one tap from anywhere.
 *
 * It floats above the tab bar rather than taking a sixth tab, because a tab
 * implies a place you go and this is a way of getting to places. It sits on
 * the right, clear of the raised camera button in the middle.
 *
 * The mascot itself lives in DinoMark, which currently holds a PLACEHOLDER
 * silhouette — see the note there before showing this to FES.
 */

interface Destination {
  to: string
  icon: IconName
  label: string
}

const GROUPS: { title: string; items: Destination[] }[] = [
  {
    title: 'Loswerden',
    items: [
      { to: '/scan', icon: 'camera', label: 'Gegenstand scannen' },
      { to: '/abholung', icon: 'truck', label: 'Sperrmüll anmelden' },
      { to: '/wissen', icon: 'info', label: 'Was mache ich damit?' },
      { to: '/kalender', icon: 'calendar', label: 'Abfuhrtermine' },
    ],
  },
  {
    title: 'Weitergeben',
    items: [
      { to: '/markt', icon: 'market', label: 'Reparatur-Markt' },
      { to: '/essen', icon: 'leaf', label: 'Essen retten' },
      { to: '/mehrweg', icon: 'cup', label: 'Mehrweg' },
    ],
  },
  {
    title: 'Mitmachen',
    items: [
      { to: '/quests', icon: 'quest', label: 'Quests' },
      { to: '/wirkung', icon: 'shield', label: 'Deine Wirkung' },
      { to: '/stadtteile', icon: 'users', label: 'Stadtteile' },
      { to: '/belohnungen', icon: 'gift', label: 'Belohnungen' },
    ],
  },
  {
    title: 'Deins',
    items: [
      { to: '/mitteilungen', icon: 'bell', label: 'Mitteilungen' },
      { to: '/einstellungen', icon: 'settings', label: 'Einstellungen' },
      { to: '/integrationen', icon: 'link', label: 'Integrationen' },
    ],
  },
]

/**
 * Where the button was last put down.
 *
 * Offsets from the bottom-right of the viewport rather than absolute
 * coordinates: a rotated phone or a resized window would otherwise strand it
 * off-screen. Clamped on every move for the same reason.
 */
const SPOT_KEY = 'remain.fessieSpot'
const SIZE = 48
const EDGE = 12

function readSpot(): { right: number; bottom: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SPOT_KEY) ?? 'null')
    if (typeof raw?.right !== 'number' || typeof raw?.bottom !== 'number') return null
    return raw
  } catch {
    return null
  }
}

function writeSpot(spot: { right: number; bottom: number }): void {
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify(spot))
  } catch {
    /* it simply starts in its corner again next time */
  }
}

export default function AgentButton() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState(readSpot)
  const drag = useRef<{
    id: number
    x: number
    y: number
    from: { right: number; bottom: number }
    moved: boolean
  } | null>(null)

  /**
   * Drag to move, tap to open — from one press.
   *
   * Under six pixels of travel is a tap: fingers wobble, and treating every
   * wobble as a drag would mean the button could not be opened on a phone at
   * all. Past six it stops being a tap, which is also why opening happens on
   * pointerup rather than through onClick.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: spot ?? {
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.bottom,
      },
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return

    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true

    // Clamped, so it can never be dragged off-screen and stranded there.
    setSpot({
      right: Math.min(Math.max(d.from.right - dx, EDGE), window.innerWidth - SIZE - EDGE),
      bottom: Math.min(Math.max(d.from.bottom - dy, EDGE), window.innerHeight - SIZE - EDGE),
    })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d.moved) {
      // Read through the setter rather than the closed-over `spot`: the last
      // pointermove may not have been committed to this render yet, and
      // persisting a stale position would put the button back where it was
      // one frame ago on the next load.
      setSpot((current) => {
        if (current) writeSpot(current)
        return current
      })
    } else {
      setOpen(true)
    }
  }

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <>
      <button
        className="agent-fab"
        style={spot ? { right: spot.right, bottom: spot.bottom, left: 'auto', marginLeft: 0 } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        aria-haspopup="dialog"
        aria-label={t('Fessie — alles auf einen Blick. Zum Verschieben ziehen.')}
      >
        <DinoMark size={27} />
      </button>

      {open && (
        <DecisionSheet title={t('Fessie')} onClose={() => setOpen(false)}>
          <AgentChat onClose={() => setOpen(false)} />

          {/* The full index, folded: the six tools above cover the common
              case, and the other eight destinations are a tap away rather
              than a wall of buttons under every conversation. */}
          <details className="agent-all">
            <summary className="lbl">{t('Alle Bereiche')}</summary>
            <div className="agent-groups">
              {GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="lbl agent-group-title">{t(group.title)}</p>
                  <div className="agent-grid">
                    {group.items.map((d) => (
                      <button key={d.to} className="agent-item" onClick={() => go(d.to)}>
                        <Icon name={d.icon} size={19} />
                        <span className="xs">{t(d.label)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </DecisionSheet>
      )}
    </>
  )
}
