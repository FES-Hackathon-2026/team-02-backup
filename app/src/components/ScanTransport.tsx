import { t } from './../lib/i18n'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PickupResolution, type ScanResult } from '../lib/client'
import { Tag } from './ui'
import Icon from './Icon'

export default function ScanTransport({ scan }: { scan: ScanResult }) {
  const navigate = useNavigate()
  const [result, setResult] = useState<PickupResolution | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setResult(null); setError('')
    api.post<PickupResolution>('/api/fes/resolve', {
      photoId: scan.photoId, category: scan.category, volumeM3: scan.estimatedVolumeM3,
    }).then(r => { if (!cancelled) setResult(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [scan.photoId, scan.category, scan.estimatedVolumeM3, retry])
  return <div className="card sky">
    <div className="between"><h2 className="h2">{t("Deine nächste Abholung")}</h2><Tag von="simulated" /></div>
    <p className="sm pickup-status" role="status" style={{ marginTop: 10 }}>
      {t(error || (result?.pickup ? `${result.pickup.label} · ${result.pickup.window || 'Ankunftsfenster folgt'} · ${result.pickup.address}`
        : result ? 'Abholadresse ergänzen: Wir prüfen zuerst bestehende Termine. Sonst bereiten wir die früheste passende Abholung vor.' : 'Vorhandene Abholung wird geprüft …'))}
    </p>
    {t(result?.candidates?.map(p => <button key={p.id} className="card tight" style={{ marginTop: 10 }} onClick={() => navigate(`/mitteilungen?${new URLSearchParams({ photo: scan.photoId, address: p.address, district: p.districtId })}`, { state: { scan } })}>
      <b>{t(p.label)} {t(" · ")}{t(p.window || 'Ankunftsfenster folgt')}</b><p className="xs mut">{p.address} {t(" · Vorhandenen Termin prüfen und Adresse übernehmen")}</p>
    </button>))}
    {t(result?.state === 'needs_address' && !result.candidates?.length && result.slots?.find(s => s.available) && <p className="sm">{t("Nächste freie Möglichkeit im Stadtteil: ")}<b>{t(result.slots.find(s => s.available)!.periodLabel || result.slots.find(s => s.available)!.label)}</b> {t(" · Ankunftsfenster folgt nach Tourplanung. Adresse und Platzbedarf werden vor Anmeldung geprüft.")}</p>)}
    <p className="xs mut">{t("Termine sind simuliert. Eine echte FES-Buchung entsteht hier noch nicht.")}</p>
    {t(error && <button className="btn sm" onClick={() => setRetry(v => v + 1)}>{t("Erneut prüfen")}</button>)}
    <button className="btn primary" style={{ marginTop: 10 }} onClick={() => navigate(result?.pickup
      ? `/abholung/${result.pickup.id}` : `/mitteilungen?photo=${encodeURIComponent(scan.photoId)}`, { state: { scan } })}>
      <Icon name="truck" size={18} />{t(result?.pickup ? 'Eingetragenen Termin ansehen' : 'Abholung prüfen')}</button>
  </div>
}
