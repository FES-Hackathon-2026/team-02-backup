import { t, getLocale } from './../lib/i18n'
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
  return <Screen back title={t("Deine Abholung")} sub={t(p ? `Buchungsnummer ${p.reference}` : 'Dein Termin wird geladen …')} action={<button className="btn sm" onClick={() => navigate('/mitteilungen')}>{t("Mitteilungen")}</button>}>
    {t(data.loading && <p role="status">{t("Termin wird geladen …")}</p>)}
    {t(data.error && <div role="alert"><p>{t(data.error.message)}</p><button className="btn" onClick={data.reload}>{t("Erneut laden")}</button></div>)}
    {t(message && <p className="card sky sm" role="status">{t(message)}</p>)}
    {t(data.data && p && <>
      <div className="card sky"><div className="between"><h1 className="h2">{t(data.data.tour?.status === 'collecting' ? data.data.tour.periodLabel : p.label)}</h1></div>
        <p>{t(data.data.tour ? data.data.tour.eta ? `${data.data.tour.eta} Uhr · geschätzte Ankunft` : 'Anfrage eingegangen · Ankunftsfenster folgt' : data.data.window)}<br />{p.address}</p><b>{t(p.status === 'booked' ? 'In ReMain eingetragen' : p.status === 'cancelled' ? 'Storniert' : 'Als abgeholt markiert')}</b>
        <p className="xs mut">{t(data.data.note)}</p></div>
      {t(data.data.tour && <div className="card"><h2 className="h2">{t("Gemeinsame Tour · ")}{t(data.data.tour.area)}</h2>
        <p className="sm">{t(data.data.tour.stops)} {t(data.data.tour.stops === 1 ? 'Stopp' : 'Stopps')} {t(" gebündelt · ")}{t(data.data.tour.utilization)}{t("% modellierte Auslastung")}</p>
        <Map ariaLabel="Schematisches Sammelgebiet der Abholung" centre={data.data.tour.centre} markers={[]} radiusKm={2} height={180} still />
        <p className="xs mut">{t("Schematisches Sammelgebiet um die Stadtteilmitte, kein adressgenauer Routenverlauf. ")}{t(data.data.tour.note)}</p>
        {t(data.data.tour.status === 'collecting' && <p className="sm">{t("Buchungsfenster schließt: ")}{t(data.data.tour.closesLocal.slice(0, 10).split('-').reverse().join('.'))} {t(" · 23:59 Uhr. Danach erscheint dein geplantes Zeitfenster hier und in deinen Mitteilungen.")}</p>)}
      </div>)}
      {t(data.data.contact && <div className="card"><h2 className="h2">{t("Deine Angaben")}</h2><p className="sm">{data.data.contact.fullName}<br />{data.data.contact.email}<br />{t(data.data.contact.phone)}<br />{t(data.data.contact.postcode)} {t(" Frankfurt am Main")}<br />{t(data.data.contact.placement)}</p><Tag von="input" /></div>)}
      <div className="card"><h2 className="h2">{t("Gegenstände")}</h2>{t(data.data.items.map(item => <div key={item.id} className="row" style={{ marginTop: 12 }}>
        {t(item.photoId && <img className="thumb" src={`/api/photos/${encodeURIComponent(item.photoId)}`} alt={t(item.categoryName)} width={48} height={48} />)}
        <span className="grow">{t(item.categoryName)}</span><b>{t(item.volumeM3.toLocaleString(getLocale()))} {t(" m³")}</b>
        {t(p.status === 'booked' && item.id !== 'legacy' && data.data!.items.length > 1 && <button className="btn sm" aria-label={t(`${item.categoryName} entfernen`)} onClick={() => { setItemId(item.id); setError(''); setSheet('remove') }}>{t("Entfernen")}</button>)}</div>))}
        <div className="sep" /><p className="between"><b>{t("Gesamt")}</b><b>{t(p.volumeM3.toLocaleString(getLocale()))} {t(" m³")}</b></p>
        {t(p.status === 'booked' && <button className="btn" onClick={() => navigate('/scan')}>{t("Weiteren Gegenstand scannen")}</button>)}</div>
      <div className="card"><h2 className="h2">{t("Vorbereitung")}</h2><ul className="sm" style={{ paddingLeft: 20, lineHeight: 1.7 }}>{t(data.data.instructions.map(text => <li key={text}>{t(text)}</li>))}</ul></div>
      {t(p.status === 'booked' && <div className="card"><h2 className="h2">{t("Termin verwalten")}</h2><div className="col" style={{ gap: 10, marginTop: 12 }}>
        <button className="btn" onClick={() => { setError(''); setDate(''); setSheet('reschedule') }}>{t("Termin verschieben")}</button>
        <button className="btn" onClick={() => { setError(''); setSheet('reminders') }}>{t(data.data.reminders ? 'Erinnerungen bearbeiten' : 'An Abholung erinnern')}</button>
        <button className="btn" onClick={() => { setError(''); setSheet('cancel') }}>{t("Termin absagen")}</button>
        <button className="btn" onClick={() => { setError(''); setSheet('issue') }}>{t("Abholung ausgeblieben?")}</button>
      </div></div>)}
      <button className="btn" onClick={() => navigate('/kalender')}>{t("Im Kalender ansehen")}</button>
      {t(data.data.actionId && <button className="btn" onClick={() => navigate(`/nachweis/${data.data!.actionId}`)}>{t("Gutschrift und Nachweis")}</button>)}
    </>)}
    {t(sheet && p && <DecisionSheet title={t(sheet === 'cancel' ? 'Termin wirklich absagen?' : sheet === 'reschedule' ? 'Neuen Termin wählen' : sheet === 'remove' ? 'Gegenstand entfernen?' : sheet === 'issue' ? 'Ausgebliebene Abholung' : 'Erinnerungen in ReMain')} busy={busy} onClose={() => setSheet(null)}>
      {t(sheet === 'remove' && <><p>{t("Der Gegenstand wird aus diesem Termin entfernt. Die übrige Abholung bleibt eingetragen.")}</p><button className="btn primary" disabled={busy} onClick={() => void change(`items/${itemId}/remove`)}>{t("Entfernen")}</button></>)}
      {t(sheet === 'issue' && <><p>{t("Du kannst die ausgebliebene Abholung nach Ende des Zeitfensters in ReMain dokumentieren. Es wird keine Meldung an FES gesendet.")}</p><a className="btn" href="https://www.fes-frankfurt.de/" target="_blank" rel="noreferrer">{t("FES kontaktieren")}</a><button className="btn primary" disabled={busy} onClick={() => void change('issue')}>{t("In ReMain dokumentieren")}</button></>)}
      {t(sheet === 'cancel' && <><p>{t(p.label)} {t(" · ")}{p.address}</p><p className="sm mut">{t("Zukünftige Erinnerungen entfallen. Die Gutschrift bleibt als Anmeldung erhalten.")}</p><button className="btn primary" disabled={busy} onClick={() => void change('cancel')}>{t("Termin absagen")}</button></>)}
      {t(sheet === 'reschedule' && <><p className="sm mut">{t("Der bisherige Termin bleibt erhalten, falls die Änderung nicht klappt.")}</p>
        {t(slots.loading && <p>{t("Freie Termine laden …")}</p>)}
        {t(slots.error && <button className="btn" onClick={slots.reload}>{t("Termine erneut laden")}</button>)}
        {t(slots.data && !slots.data.slots.some(s => s.available && s.date !== p.date) && <p>{t("Keine anderen Termine verfügbar.")}</p>)}
        {t(slots.data?.slots.filter(s => s.date !== p.date).map(s => <button className="card tight pickup-slot" key={s.date} disabled={!s.available || busy} aria-pressed={s.date === date} onClick={() => setDate(s.date)}>{t(s.periodLabel || s.label)}<br /><span className="xs mut">{t(s.available ? 'Ankunftsfenster folgt nach Tourplanung' : s.reason)}</span></button>))}
        <button className="btn primary" disabled={!date || busy} onClick={() => void change('reschedule', { slotDate: date })}>{t("Neuen Termin speichern")}</button></>)}
      {t(sheet === 'reminders' && <><p>{t("Am Vorabend um 18:00 Uhr und am Abholtag um 06:00 Uhr, jeweils Frankfurter Ortszeit.")}</p><p className="sm mut">{t("Erinnerungen erscheinen in deinen Mitteilungen, wenn du ReMain öffnest. Keine Push-Nachrichten, SMS oder E-Mails.")}</p>
        <button className="btn primary" disabled={busy} onClick={() => void change('reminders', { enabled: !data.data?.reminders })}>{t(data.data?.reminders ? 'Erinnerungen ausschalten' : 'Erinnerungen einschalten')}</button></>)}
      {t(busy && <p role="status">{t("Wird gespeichert …")}</p>)}{t(error && <p role="alert">{t(error)}</p>)}
    </DecisionSheet>)}
  </Screen>
}
