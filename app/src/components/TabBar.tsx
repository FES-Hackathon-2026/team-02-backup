export type TabId = 'discover' | 'receipts' | 'impact' | 'fair'

const TABS: { id: TabId; label: string; path: string }[] = [
  { id: 'discover', label: 'Discover', path: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5' },
  { id: 'receipts', label: 'Receipts', path: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  { id: 'impact', label: 'Impact', path: 'M3 20h18M6 20v-6M11 20V7M16 20v-9M21 20V4' },
  { id: 'fair', label: 'Fair', path: 'M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6z' },
]

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
}

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar" role="tablist" aria-label="Main sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={tab.path} />
          </svg>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
