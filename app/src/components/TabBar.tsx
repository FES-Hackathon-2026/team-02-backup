import { t } from './../lib/i18n'
import { NavLink } from 'react-router-dom'

import Icon, { type IconName } from './Icon'
import { de } from '../lib/de'

interface Tab {
  to: string
  icon: IconName
  label: string
  /** only '/' should match exactly; the others own their subtree */
  end?: boolean
  /** the raised centre button — the product's one hero action */
  fab?: boolean
}

const TABS: Tab[] = [
  { to: '/', icon: 'home', label: de.tabs.start, end: true },
  { to: '/quests', icon: 'quest', label: de.tabs.quests },
  { to: '/scan', icon: 'camera', label: de.tabs.scan, fab: true },
  { to: '/markt', icon: 'market', label: de.tabs.markt },
  { to: '/wirkung', icon: 'leaf', label: de.tabs.wirkung },
]

export default function TabBar() {
  return (
    <nav className="tabs" aria-label={t("Hauptbereiche")}>
      {t(TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab" aria-label={t(tab.label)}>
          {t(tab.fab ? (
            <><span className="tab-fab">
              <Icon name={tab.icon} size={24} stroke={1.9} />
            </span><span className="tab-label">{t(tab.label)}</span></>
          ) : (
            <>
              <Icon name={tab.icon} size={22} />
              <span className="tab-label">{t(tab.label)}</span>
            </>
          ))}
        </NavLink>
      )))}
    </nav>
  )
}
