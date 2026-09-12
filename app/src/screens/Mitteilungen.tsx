import { t, getLocale } from './../lib/i18n'
import { BonusReceipts } from '../components/ReferenceActions'
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
  return <Screen back title={t("Mitteilungen")} sub={t(data.data?.unread ? `${data.data.unread} ${data.data.unread === 1 ? 'neue Nachricht' : 'neue Nachrichten'}` : undefined)}>
    <p className="sm mut">{t("Hier findest du deine Abholtermine und Erinnerungen. Die Abholung ist derzeit eine Demo.")}</p>
    <BonusReceipts />
    <CollectionOpportunity />
    {t(data.loading && <p role="status">{t("Mitteilungen laden …")}</p>)}
    {t((data.error || error) && <div role="alert"><p>{t(error || data.error?.message)}</p><button className="btn" onClick={() => { setError(''); data.reload() }}>{t("Erneut laden")}</button></div>)}
    {t(data.data?.notifications.length === 0 && <div className="card"><h2 className="h2">{t("Noch keine Mitteilungen")}</h2><p>{t("Nach deiner ersten Anmeldung findest du hier den Termin und seine Änderungen.")}</p></div>)}
    {t(data.data?.notifications.map(n => <button key={n.id} className={n.read ? 'card' : 'card sky'} onClick={() => void open(n.id, n.pickupId)}>
      <div className="between"><b>{t(n.read ? 'Abholung' : 'Neu · Abholung')}</b><Tag von="simulated" /></div><p className="sm">{t(n.message)}</p><span className="xs mut">{new Date(n.at).toLocaleString(getLocale(), { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })}</span></button>))}
  </Screen>
}
