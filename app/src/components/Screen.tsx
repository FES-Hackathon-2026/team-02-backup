import { t } from './../lib/i18n'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import AgentButton from './AgentButton'
import Icon from './Icon'
import TabBar from './TabBar'
import { de } from '../lib/de'

interface Props {
  title: ReactNode
  /** the small second line under the title */
  sub?: ReactNode
  /** shows a back button and a solid, sticky top bar */
  back?: boolean
  /** a single control on the right of the top bar */
  action?: ReactNode
  /** show the bottom tab bar — true for the five top-level screens */
  tabs?: boolean
  /** the floating dino index; off only where it would obstruct */
  agent?: boolean
  /** a bar that stays put at the bottom while the body scrolls */
  footer?: ReactNode
  /** override the body's vertical rhythm */
  gap?: number
  children: ReactNode
}

/**
 * The app shell every screen sits in: top bar, scrolling body, optional
 * sticky footer and tab bar. Keeping it in one place is what makes the
 * safe-area insets and the tab-bar clearance correct everywhere at once.
 */
export default function Screen({
  title,
  sub,
  back = false,
  action,
  tabs = false,
  agent = true,
  footer,
  gap,
  children,
}: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  const heading = (
    <div className="nav-t">
      {title}
      {t(sub !== undefined && <small>{sub}</small>)}
    </div>
  )

  return (
    <div className={tabs ? 'app has-tabs' : 'app'} data-screen={location.pathname.split('/')[1] || 'start'}>
      <header className={back ? 'nav solid' : 'nav'}>
        {/* Back sits BESIDE the title, on one line — the pattern every phone
            already uses, so the arrow reads as belonging to the title rather
            than floating above it.
            It used to stack, to keep the title flush with the body's cards;
            the trade is that a screen with a back button now indents its
            title past them. The negative margin below claws most of that
            back by pulling the button into the page gutter, so the offset is
            the glyph's width rather than the whole 44px tap target. */}
        {t(back && (
          <button className="icobtn bare navback" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} aria-label={t(de.action.back)}>
            <Icon name="back" size={22} />
          </button>
        ))}
        {heading}
        {t(action)}
      </header>

      <div className="body" style={gap === undefined ? undefined : { gap }}>
        {t(children)}
      </div>

      {t(footer !== undefined && <div className="footer">{t(footer)}</div>)}
      {/* Everywhere except where it would be in the way: the camera fills
          its own screen and a floating button over a viewfinder is a button
          you press by accident while framing a photo. */}
      {t(agent && <AgentButton />)}
      {t(tabs && <TabBar />)}
    </div>
  )
}
