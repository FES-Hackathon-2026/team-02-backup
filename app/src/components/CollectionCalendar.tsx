import { useState } from 'react'
import Icon from './Icon'
import { Tag } from './ui'
import type { FesCalendarDate } from '../lib/client'
import { FRAKTION_FARBE } from '../lib/demo'

const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export default function CollectionCalendar({ dates, selected, onSelect }: {
  dates: FesCalendarDate[]; selected: string | null; onSelect: (date: string | null) => void
}) {
  const [month, setMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1) })
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - (month.getDay() + 6) % 7)
  const days = Array.from({ length: Math.ceil(((month.getDay() + 6) % 7 + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = keyOf(new Date())
  function move(by: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1)); onSelect(null) }
  return <section className="card collection-calendar" aria-label="Abfuhrtermine im Monatskalender">
    <div className="between"><button className="icobtn bare" aria-label="Vorheriger Monat" onClick={() => move(-1)}><Icon name="back" size={18} /></button><b>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b><button className="icobtn bare" aria-label="Nächster Monat" onClick={() => move(1)}><Icon name="chevron" size={18} /></button></div>
    <div className="calendar-grid">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => <span className="xs mut" key={day}>{day}</span>)}
      {days.map(day => { const key = keyOf(day); const events = dates.filter(d => d.date.slice(0, 10) === key); return <button key={key} className={`calendar-day${day.getMonth() !== month.getMonth() ? ' outside' : ''}`} aria-pressed={selected === key} aria-current={today === key ? 'date' : undefined} aria-label={`${day.toLocaleDateString('de-DE')}, ${events.length} Termine`} onClick={() => onSelect(selected === key ? null : key)}>
        {day.getDate()}<span className="calendar-dots">{[...new Set(events.map(e => e.fraktion))].map(f => <i key={f} style={{ background: FRAKTION_FARBE[f] }} />)}</span>
      </button> })}
    </div><div className="between"><Tag von="simulated" /><button className="text-link" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); onSelect(null) }}>Heute · alle Termine</button></div>
  </section>
}
