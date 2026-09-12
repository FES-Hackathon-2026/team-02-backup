import { t } from './../lib/i18n'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApi, type FesSlot } from '../lib/client'
import { Tag } from './ui'

export default function CollectionOpportunity() {
  const navigate = useNavigate()
  const location = useLocation()
  const offer = useApi<{ slot: FesSlot | null; district: string }>('/api/fes/opportunity')
  const proceed = () => navigate(`/abholung${location.search}`, { state: location.state })
  if (offer.loading) return <p role="status">{t("Sammeltouren werden geprüft …")}</p>
  if (offer.error) return <div className="card" role="alert"><p>{t("Sammeltouren konnten nicht geladen werden.")}</p><button className="btn" onClick={offer.reload}>{t("Erneut laden")}</button></div>
  if (!offer.data?.slot) return <div className="card"><h2 className="h2">{t("Sperrmüll-Abholung")}</h2><p className="sm">{t("Aktuell keine freie Sammeltour im Stadtteil. Prüfe deine Adresse und vorhandene Anmeldungen.")}</p><button className="btn" onClick={proceed}>{t("Abholung prüfen")}</button></div>
  return <button className="card sky" onClick={proceed}>
    <div className="between"><b>{t("Sperrmüll-Abholung in deiner Nähe")}</b><Tag von="simulated" /></div>
    <p className="sm">{t((location.search || location.state?.scan) ? 'Dein Gegenstand wird im nächsten Schritt übernommen. ' : '')}{offer.data.district} {t(" · ")}{t(offer.data.slot.periodLabel || offer.data.slot.label)}</p>
    <p className="xs mut">{t("Melde Möbel oder große Elektrogeräte zur Abholung an. Deine Abholzeit erhältst du, sobald die Tour geplant ist.")}</p>
    <span className="h3">{t("Abholung anmelden →")}</span>
  </button>
}
