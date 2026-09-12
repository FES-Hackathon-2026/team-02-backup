import { useNavigate } from 'react-router-dom'
import { useApi, type FesSlot } from '../lib/client'
import { Tag } from './ui'

export default function CollectionOpportunity() {
  const navigate = useNavigate()
  const offer = useApi<{ slot: FesSlot | null; district: string }>('/api/fes/opportunity')
  if (!offer.data?.slot) return null
  return <button className="card sky" onClick={() => navigate('/abholung')}>
    <div className="between"><b>Sammeltour in deiner Nähe</b><Tag von="simulated" /></div>
    <p className="sm">{offer.data.district} · {offer.data.slot.periodLabel || offer.data.slot.label}</p>
    <p className="xs mut">Elektro-Großgeräte und Sperrmüll gemeinsam sammeln. Gegenstand scannen oder Anfrage anlegen; dein genaues Fenster folgt nach Tourplanung.</p>
    <span className="h3">Sammelgebiet und Angaben prüfen →</span>
  </button>
}
