import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import CollectionOpportunity from '../components/CollectionOpportunity'
import { Tag } from '../components/ui'
import { api, useApi, type PickupNotices } from '../lib/client'

export default function Mitteilungen() {
  const navigate = useNavigate()
  const data = useApi<PickupNotices>('/api/fes/notifications')
  const [error, setError] = useState('')
  useEffect(() => { const timer = setInterval(data.reload, 30_000); return () => clearInterval(timer) }, [data.reload])
  async function open(id: string, pickupId: string) {
    try { await api.post(`/api/fes/notifications/${id}/read`); navigate(`/abholung/${pickupId}`) }
    catch (e) { setError((e as Error).message) }
  }
  return <Screen back title="Mitteilungen" sub={`${data.data?.unread ?? 0} ungelesen`}>
    <p className="sm mut">Deine Abholungen und eingeschalteten Erinnerungen. Demo-Termine bleiben als simuliert gekennzeichnet.</p>
    <CollectionOpportunity />
    {data.loading && <p role="status">Mitteilungen laden …</p>}
    {(data.error || error) && <div role="alert"><p>{error || data.error?.message}</p><button className="btn" onClick={() => { setError(''); data.reload() }}>Erneut laden</button></div>}
    {data.data?.notifications.length === 0 && <div className="card"><h2 className="h2">Noch keine Mitteilungen</h2><p>Nach deiner ersten Anmeldung findest du hier den Termin und seine Änderungen.</p><button className="btn" onClick={() => navigate('/abholung')}>Abholung planen</button></div>}
    {data.data?.notifications.map(n => <button key={n.id} className={n.read ? 'card' : 'card sky'} onClick={() => void open(n.id, n.pickupId)}>
      <div className="between"><b>{n.read ? 'Abholung' : 'Neu · Abholung'}</b><Tag von="simulated" /></div><p className="sm">{n.message}</p><span className="xs mut">{n.at.slice(0, 10).split('-').reverse().join('.')} · {n.at.slice(11, 16)} Uhr</span></button>)}
  </Screen>
}
