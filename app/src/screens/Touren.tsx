import { useState } from 'react'
import DecisionSheet from '../components/DecisionSheet'
import Screen from '../components/Screen'
import { Tag } from '../components/ui'
import { api, useApi } from '../lib/client'
import { useSession } from '../lib/session'

type Stop = { id: string; address: string; name?: string; phone?: string; placement?: string; status: string; eta: string | null; volumeM3: number; kind: string; items: { category: string; volumeM3: number }[] }
type Tour = { id: string; date: string; area: string; status: string; stops: Stop[] }
const DEMO: Tour = {
  id: 'demo', date: 'Demotag', area: 'Frankfurt · Fahrzeug 3', status: 'planned', stops: [
    { id: 'demo1', address: 'Praunheim · Sammelpunkt', status: 'booked', eta: '08:00–08:15', volumeM3: 1, kind: 'fes', items: [{ category: 'Kleinelektronik-Sammelpunkt', volumeM3: 1 }] },
    { id: 'demo2', address: 'Ginnheim · Demo-Stopp', status: 'booked', eta: '08:40–09:00', volumeM3: 2, kind: 'booked', items: [{ category: 'Waschmaschine und Trockner', volumeM3: 2 }] },
    { id: 'demo3', address: 'Dornbusch · Demo-Stopp', status: 'booked', eta: '09:20–09:35', volumeM3: 1.5, kind: 'booked', items: [{ category: 'Bürostuhl und Bücherregal', volumeM3: 1.5 }] },
    { id: 'demo4', address: 'Eckenheim · Sammelpunkt', status: 'booked', eta: '09:50–10:05', volumeM3: 1, kind: 'fes', items: [{ category: 'Kleinelektronik-Sammelpunkt', volumeM3: 1 }] },
    { id: 'demo5', address: 'Hausen · Demo-Stopp', status: 'booked', eta: '10:30–10:45', volumeM3: 1.5, kind: 'booked', items: [{ category: 'Kühlschrank', volumeM3: 1.5 }] },
    { id: 'demo6', address: 'Bockenheim · Demo-Stopp', status: 'booked', eta: '11:10–11:25', volumeM3: 2, kind: 'booked', items: [{ category: 'Sofa, 2-Sitzer', volumeM3: 2 }] },
    { id: 'demo7', address: 'Altstadt · Demo-Adresse', name: 'Demo-Person', status: 'booked', eta: '13:40–14:00', volumeM3: 3.5, kind: 'booked', items: [{ category: 'Kühlschrank, Sofa und Monitor', volumeM3: 3.5 }] },
  ],
}
export default function Touren() {
  const { me } = useSession()
  const driver = me?.role === 'driver'
  const data = useApi<{ tours: Tour[] }>(driver ? '/api/fes/driver/tours' : null)
  const [demo, setDemo] = useState(DEMO)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Stop | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function action(path: string) {
    if (busy) return
    setBusy(true); setError('')
    try { await api.post(path); data.reload(); setSelected(null); setMessage('Tour aktualisiert. Betroffene Bürger:innen erhalten eine Mitteilung in ReMain.') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const tours = driver ? data.data?.tours ?? [] : [demo]
  return <Screen back title={driver ? 'Meine Sammeltouren' : 'Fahrer:innen-Demo'} sub={driver ? 'Freigeschaltete Fahrer:innen-Ansicht' : 'Getrennte Demo · Keine echten Abholadressen'}>
    {!driver && <div className="card sky"><h1 className="h2">Ein Fahrzeug, eine gemeinsame Tour</h1><p className="sm">Die Referenzreise mit sieben fiktiven Stopps. Änderungen hier betreffen nur diese Vorschau. Bürger:innen sehen in ihren echten Anfragen ausschließlich den eigenen Stopp.</p><button className="btn sm" onClick={() => { setDemo(DEMO); setMessage('Demo zurückgesetzt.') }}>Demo neu starten</button></div>}
    {data.loading && <p role="status">Touren laden …</p>}
    {data.error && <button className="btn" onClick={data.reload}>Touren erneut laden</button>}
    {message && <p className="card sky sm" role="status">{message}</p>}
    {tours.length === 0 && <p>Keine offenen Touren.</p>}
    <div className="chips">{[['all', 'Alle'], ['booked', 'Gebucht'], ['fes', 'FES-Stopps']].map(([value, label]) => <button className="chip" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {tours.map(tour => <section className="card" key={tour.id}>
      <div className="between"><h2 className="h2">{tour.area}</h2><Tag von="simulated" /></div>
      <p className="sm">{tour.date} · {tour.stops.length} Stopps · {tour.stops.reduce((sum, stop) => sum + stop.volumeM3, 0).toLocaleString('de-DE')} m³</p>
      {!driver && <p className="xs mut">Referenz-Demomodell: 34 km gemeinsame Route gegenüber ca. 91 km Einzelfahrten. ≈ 57 km Einsparung, kein Messwert.</p>}
      <svg viewBox="0 0 360 100" role="img" aria-label="Schematische Stoppreihenfolge, keine Straßenkarte" style={{ width: '100%', background: 'var(--sky2)', borderRadius: 16 }}>
        <path d="M25 55 C80 5 115 90 170 45 S260 90 335 40" fill="none" stroke="var(--blue)" strokeWidth="4" />
        {tour.stops.slice(0, 7).map((stop, i) => <g key={stop.id} transform={`translate(${25 + i * 50},${i % 2 ? 40 : 55})`}><circle r="13" fill="var(--blue-deep)" /><text textAnchor="middle" y="4" fill="var(--on-blue)" fontSize="12">{i + 1}</text></g>)}
      </svg>
      <p className="xs mut">Schematische Reihenfolge. Keine Live-Ortung oder verifizierte Straßenroute.</p>
      {driver && tour.status === 'collecting' && <button className="btn primary" disabled={busy} onClick={() => void action(`/api/fes/driver/tours/${tour.id}/plan`)}>Demo-Tour planen und Fenster zuweisen</button>}
      {tour.stops.filter(stop => filter === 'all' || stop.kind === filter).map(stop => <button key={stop.id} className="card tight" style={{ marginTop: 10 }} onClick={() => { setError(''); setSelected(stop) }}>
        <b>{stop.address}</b><p className="xs mut">{stop.eta || 'Zeitfenster folgt'} · {stop.kind === 'fes' ? 'FES-Sammelpunkt (Demo)' : 'Gebucht'} · {stop.status === 'collected' ? 'Abgeholt ✓' : 'Offen'}</p>
      </button>)}
    </section>)}
    {error && !selected && <p role="alert">{error}</p>}
    {selected && <DecisionSheet title={`${selected.address} · ${selected.eta || 'noch ungeplant'}`} busy={busy} onClose={() => setSelected(null)}>
      <Tag von="simulated" /><p>{selected.name}<br />{selected.phone}<br />{selected.placement}</p>
      <h3 className="h3">Gebuchte Gegenstände</h3><ul>{selected.items.map((item, index) => <li key={index}>{item.category} · {item.volumeM3.toLocaleString('de-DE')} m³</li>)}</ul>
      <button className="btn primary" disabled={busy || selected.status === 'collected'} onClick={() => {
        if (driver) void action(`/api/fes/driver/stops/${selected.id}/collect`)
        else { setDemo(d => ({ ...d, stops: d.stops.map(s => s.id === selected.id ? { ...s, status: 'collected' } : s) })); setSelected(null); setMessage('Demo-Stopp als abgeholt markiert. In der angebundenen Fahrer:innen-Ansicht wird eine Mitteilung gespeichert.') }
      }}>{selected.status === 'collected' ? 'Bereits abgeholt ✓' : 'Abgeholt ✓'}</button>
      {error && <p role="alert">{error}</p>}
    </DecisionSheet>}
  </Screen>
}
