import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

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
  footer,
  gap,
  children,
}: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className={tabs ? 'app has-tabs' : 'app'} data-screen={location.pathname.split('/')[1] || 'start'}>
      <header className={back ? 'nav solid' : 'nav'}>
        {back && (
          <button className="icobtn bare" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} aria-label={de.action.back}>
            <Icon name="back" size={22} />
          </button>
        )}
        <div className="nav-t">
          {title}
          {sub !== undefined && <small>{sub}</small>}
        </div>
        {action}
      </header>

      <div className="body" style={gap === undefined ? undefined : { gap }}>
        {children}
      </div>

      {footer !== undefined && <div className="footer">{footer}</div>}
      {tabs && <TabBar />}
    </div>
  )
}
