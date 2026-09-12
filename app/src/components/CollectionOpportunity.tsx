import { useLocation, useNavigate } from 'react-router-dom'
import { useApi, type FesSlot } from '../lib/client'
import { Tag } from './ui'

export default function CollectionOpportunity() {
  const navigate = useNavigate()
  const location = useLocation()
  const offer = useApi<{ slot: FesSlot | null; district: string }>('/api/fes/opportunity')
  const proceed = () => navigate(`/abholung${location.search}`, { state: location.state })
  if (offer.loading) return <p role="status">Sammeltouren werden geprüft …</p>
  if (offer.error) return <div className="card" role="alert"><p>Sammeltouren konnten nicht geladen werden.</p><button className="btn" onClick={offer.reload}>Erneut laden</button></div>
  if (!offer.data?.slot) return <div className="card"><h2 className="h2">Sperrmüll-Abholung</h2><p className="sm">Aktuell keine freie Sammeltour im Stadtteil. Prüfe deine Adresse und vorhandene Anmeldungen.</p><button className="btn" onClick={proceed}>Abholung prüfen</button></div>
  return <button className="card sky" onClick={proceed}>
    <div className="between"><b>Sperrmüll-Abholung in deiner Nähe</b><Tag von="simulated" /></div>
    <p className="sm">{(location.search || location.state?.scan) ? 'Dein Gegenstand wird im nächsten Schritt übernommen. ' : ''}{offer.data.district} · {offer.data.slot.periodLabel || offer.data.slot.label}</p>
    <p className="xs mut">Melde Möbel oder große Elektrogeräte zur Abholung an. Deine Abholzeit erhältst du, sobald die Tour geplant ist.</p>
    <span className="h3">Abholung anmelden →</span>
  </button>
}
