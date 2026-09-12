import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import DecisionSheet from '../components/DecisionSheet'
import Screen from '../components/Screen'
import Map from '../components/Map'
import { Tag } from '../components/ui'
import { api, useApi, type FesSlots, type PickupDetail } from '../lib/client'

export default function AbholungDetail() {
  const { pickupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const data = useApi<PickupDetail>(`/api/fes/pickups/${encodeURIComponent(pickupId ?? '')}`)
  const [sheet, setSheet] = useState<'cancel' | 'reschedule' | 'reminders' | 'remove' | 'issue' | null>(null)
  const [date, setDate] = useState('')
  const [itemId, setItemId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState((location.state as { saved?: boolean } | null)?.saved ? 'Abholung gespeichert. Dein Kalender und deine Mitteilungen sind aktualisiert.' : '')
  const p = data.data?.pickup
  const slots = useApi<FesSlots>(sheet === 'reschedule' && p ? `/api/fes/slots?districtId=${encodeURIComponent(p.districtId)}&volume=${p.volumeM3}` : null)
  async function change(action: string, body?: unknown) {
    if (busy || !p) return
    setBusy(true); setError('')
    try {
      await api.post(`/api/fes/pickups/${p.id}/${action}`, body)
      setSheet(null); setMessage(action === 'cancel' ? 'Termin storniert. Zukünftige Erinnerungen entfernt. Die Gutschrift bleibt als Anmeldung erhalten.' : 'Änderung gespeichert.')
      data.reload()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <Screen back title="Deine Abholung" sub={p?.reference || 'Termin laden'} action={<button className="btn sm" onClick={() => navigate('/mitteilungen')}>Mitteilungen</button>}>
    {data.loading && <p role="status">Termin wird geladen …</p>}
    {data.error && <div role="alert"><p>{data.error.message}</p><button className="btn" onClick={data.reload}>Erneut laden</button></div>}
    {message && <p className="card sky sm" role="status">{message}</p>}
    {data.data && p && <>
      <div className="card sky"><div className="between"><h1 className="h2">{data.data.tour?.status === 'collecting' ? data.data.tour.periodLabel : p.label}</h1><Tag von="simulated" /></div>
        <p>{data.data.tour ? data.data.tour.eta ? `${data.data.tour.eta} Uhr · geschätzte Ankunft` : 'Anfrage eingegangen · Ankunftsfenster folgt' : data.data.window}<br />{p.address}</p><b>{p.status === 'booked' ? 'In ReMain eingetragen' : p.status === 'cancelled' ? 'Storniert' : 'Als abgeholt markiert'}</b>
        <p className="xs mut">{data.data.note}</p></div>
      {data.data.tour && <div className="card"><h2 className="h2">Gemeinsame Tour · {data.data.tour.area}</h2>
        <p className="sm">{data.data.tour.stops} {data.data.tour.stops === 1 ? 'Stopp' : 'Stopps'} gebündelt · {data.data.tour.utilization}% modellierte Auslastung</p>
        <Map ariaLabel="Schematisches Sammelgebiet der Abholung" centre={data.data.tour.centre} markers={[]} radiusKm={2} height={180} still />
        <p className="xs mut">Schematisches Sammelgebiet um die Stadtteilmitte, kein adressgenauer Routenverlauf. {data.data.tour.note}</p>
        {data.data.tour.status === 'collecting' && <p className="sm">Buchungsfenster schließt: {data.data.tour.closesLocal.slice(0, 10).split('-').reverse().join('.')} · 23:59 Uhr. Danach erscheint dein geplantes Zeitfenster hier und in deinen Mitteilungen.</p>}
      </div>}
      {data.data.contact && <div className="card"><h2 className="h2">Deine Angaben</h2><p className="sm">{data.data.contact.fullName}<br />{data.data.contact.email}<br />{data.data.contact.phone}<br />{data.data.contact.postcode} Frankfurt am Main<br />{data.data.contact.placement}</p><Tag von="input" /></div>}
      <div className="card"><h2 className="h2">Gegenstände</h2>{data.data.items.map(item => <div key={item.id} className="row" style={{ marginTop: 12 }}>
        {item.photoId && <img className="thumb" src={`/api/photos/${encodeURIComponent(item.photoId)}`} alt={item.categoryName} width={48} height={48} />}
        <span className="grow">{item.categoryName}</span><b>{item.volumeM3.toLocaleString('de-DE')} m³</b>
        {p.status === 'booked' && item.id !== 'legacy' && data.data!.items.length > 1 && <button className="btn sm" aria-label={`${item.categoryName} entfernen`} onClick={() => { setItemId(item.id); setError(''); setSheet('remove') }}>Entfernen</button>}</div>)}
        <div className="sep" /><p className="between"><b>Gesamt</b><b>{p.volumeM3.toLocaleString('de-DE')} m³</b></p>
        {p.status === 'booked' && <button className="btn" onClick={() => navigate('/scan')}>Weiteren Gegenstand scannen</button>}</div>
      <div className="card"><h2 className="h2">Vorbereitung</h2><ul className="sm" style={{ paddingLeft: 20, lineHeight: 1.7 }}>{data.data.instructions.map(text => <li key={text}>{text}</li>)}</ul></div>
      {p.status === 'booked' && <div className="card"><h2 className="h2">Termin verwalten</h2><div className="col" style={{ gap: 10, marginTop: 12 }}>
        <button className="btn" onClick={() => { setError(''); setDate(''); setSheet('reschedule') }}>Termin verschieben</button>
        <button className="btn" onClick={() => { setError(''); setSheet('reminders') }}>{data.data.reminders ? 'Erinnerungen bearbeiten' : 'An Abholung erinnern'}</button>
        <button className="btn" onClick={() => { setError(''); setSheet('cancel') }}>Termin absagen</button>
        <button className="btn" onClick={() => { setError(''); setSheet('issue') }}>Abholung ausgeblieben?</button>
      </div></div>}
      <button className="btn" onClick={() => navigate('/kalender')}>Im Kalender ansehen</button>
      {data.data.actionId && <button className="btn" onClick={() => navigate(`/nachweis/${data.data!.actionId}`)}>Gutschrift und Nachweis</button>}
    </>}
    {sheet && p && <DecisionSheet title={sheet === 'cancel' ? 'Termin wirklich absagen?' : sheet === 'reschedule' ? 'Neuen Termin wählen' : sheet === 'remove' ? 'Gegenstand entfernen?' : sheet === 'issue' ? 'Ausgebliebene Abholung' : 'Erinnerungen in ReMain'} busy={busy} onClose={() => setSheet(null)}>
      {sheet === 'remove' && <><p>Der Gegenstand wird aus diesem Termin entfernt. Die übrige Abholung bleibt eingetragen.</p><button className="btn primary" disabled={busy} onClick={() => void change(`items/${itemId}/remove`)}>Entfernen</button></>}
      {sheet === 'issue' && <><p>Du kannst die ausgebliebene Abholung nach Ende des Zeitfensters in ReMain dokumentieren. Es wird keine Meldung an FES gesendet.</p><a className="btn" href="https://www.fes-frankfurt.de/" target="_blank" rel="noreferrer">FES kontaktieren</a><button className="btn primary" disabled={busy} onClick={() => void change('issue')}>In ReMain dokumentieren</button></>}
      {sheet === 'cancel' && <><p>{p.label} · {p.address}</p><p className="sm mut">Zukünftige Erinnerungen entfallen. Die Gutschrift bleibt als Anmeldung erhalten.</p><button className="btn primary" disabled={busy} onClick={() => void change('cancel')}>Termin absagen</button></>}
      {sheet === 'reschedule' && <><p className="sm mut">Der bisherige Termin bleibt erhalten, falls die Änderung nicht klappt.</p>
        {slots.loading && <p>Freie Termine laden …</p>}
        {slots.error && <button className="btn" onClick={slots.reload}>Termine erneut laden</button>}
        {slots.data && !slots.data.slots.some(s => s.available && s.date !== p.date) && <p>Keine anderen Termine verfügbar.</p>}
        {slots.data?.slots.filter(s => s.date !== p.date).map(s => <button className="card tight pickup-slot" key={s.date} disabled={!s.available || busy} aria-pressed={s.date === date} onClick={() => setDate(s.date)}>{s.periodLabel || s.label}<br /><span className="xs mut">{s.available ? 'Ankunftsfenster folgt nach Tourplanung' : s.reason}</span></button>)}
        <button className="btn primary" disabled={!date || busy} onClick={() => void change('reschedule', { slotDate: date })}>Neuen Termin speichern</button></>}
      {sheet === 'reminders' && <><p>Am Vorabend um 18:00 Uhr und am Abholtag um 06:00 Uhr, jeweils Frankfurter Ortszeit.</p><p className="sm mut">Erinnerungen erscheinen in deinen Mitteilungen, wenn du ReMain öffnest. Keine Push-Nachrichten, SMS oder E-Mails.</p>
        <button className="btn primary" disabled={busy} onClick={() => void change('reminders', { enabled: !data.data?.reminders })}>{data.data?.reminders ? 'Erinnerungen ausschalten' : 'Erinnerungen einschalten'}</button></>}
      {busy && <p role="status">Wird gespeichert …</p>}{error && <p role="alert">{error}</p>}
    </DecisionSheet>}
  </Screen>
}
