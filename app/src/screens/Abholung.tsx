import { t, getLocale } from './../lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import DecisionSheet from '../components/DecisionSheet'
import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { api, ApiError, useApi, type FesBooking, type FesCategories, type PickupResolution, type ScanResult } from '../lib/client'
import { STADTTEILE } from '../lib/frankfurt'
import { useSession } from '../lib/session'

type CartItem = { photoId?: string; category: string; volumeM3: number; label: string }
type Draft = { address: string; districtId: string; category: string; volumeM3: number; contact?: { fullName: string; email: string; phone: string; postcode: string; placement: string } }
export default function Abholung() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { me, refresh } = useSession()
  const state = location.state as { scan?: ScanResult; category?: string; volumeM3?: number } | null
  const photoId = params.get('photo') || state?.scan?.photoId || ''
  const scan = useApi<ScanResult>(photoId ? `/api/scan/${encodeURIComponent(photoId)}` : null)
  const catalog = useApi<FesCategories>('/api/fes/categories')
  const storageKey = `remain:pickup:${me?.id}:${photoId || 'manual'}`
  const [draft, setDraft] = useState<Draft>(() => {
    // A saved draft beats the defaults, but NOT an explicit query parameter:
    // the link just followed is newer than whatever was typed here before.
    // category and volume were missing from this list, so ?category= was
    // dropped as soon as a draft existed — and a draft is written on every
    // keystroke, so that meant from the second visit onward. The resolver
    // needs a collectable category before it will ask for slots at all, which
    // is why the booking screen could never show a date.
    try { const saved = sessionStorage.getItem(storageKey); if (saved) { const parsed = JSON.parse(saved) as Draft; return { ...parsed, address: params.get('address') || parsed.address, districtId: params.get('district') || parsed.districtId, category: params.get('category') || parsed.category, volumeM3: Number(params.get('volume') || parsed.volumeM3 || 1) } } } catch { /* Storage can be unavailable. */ }
    let shared: Partial<Draft> = {}
    try { shared = JSON.parse(sessionStorage.getItem(`remain:pickup-cart:${me?.id}:details`) || '{}') as Partial<Draft> } catch { /* No saved details. */ }
    return { contact: shared.contact ?? { fullName: me?.name ?? '', email: '', phone: '', postcode: '', placement: '' }, address: params.get('address') || shared.address || '', districtId: params.get('district') || shared.districtId || me?.district.id || 'bockenheim', category: params.get('category') || state?.scan?.category || state?.category || '',
      volumeM3: Number(params.get('volume') || state?.scan?.estimatedVolumeM3 || state?.volumeM3 || 1) }
  })
  const cartKey = `remain:pickup-cart:${me?.id}`
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(cartKey) || '[]') as CartItem[] } catch { return [] }
  })
  useEffect(() => { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)) } catch { /* Basket stays available in memory. */ } }, [cartKey, cart])
  const pendingStorageKey = `remain:pickup-pending:${me?.id}`
  const [recoverKey, setRecoverKey] = useState(() => { try { return sessionStorage.getItem(pendingStorageKey) || '' } catch { return '' } })
  const [recoveryError, setRecoveryError] = useState('')
  async function recover() {
    if (!recoverKey) return
    setRecoveryError('')
    try {
      const saved = await api.get<{ pickup: { id: string } }>(`/api/fes/requests/${encodeURIComponent(recoverKey)}`)
      try { sessionStorage.removeItem(pendingStorageKey); sessionStorage.removeItem(cartKey); sessionStorage.removeItem(`${cartKey}:details`); sessionStorage.removeItem(storageKey) } catch { /* Optional storage. */ }
      navigate(`/abholung/${saved.pickup.id}`, { replace: true, state: { saved: true } })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { try { sessionStorage.removeItem(pendingStorageKey) } catch { /* Optional storage. */ }; setRecoverKey('') }
      else setRecoveryError('Status noch nicht erreichbar. Bitte Verbindung prüfen und erneut abfragen.')
    }
  }
  useEffect(() => { if (recoverKey) void recover() }, [recoverKey])
  const [addressEditing, setAddressEditing] = useState(() => !draft.address.trim())
  const [itemEditing, setItemEditing] = useState(!photoId)
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (scan.data && !edited && !state?.scan && !draft.category) setDraft(d => ({ ...d, category: scan.data!.category, volumeM3: scan.data!.estimatedVolumeM3 }))
  }, [scan.data, edited])
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* Keep usable without storage. */ } }, [storageKey, draft])
  const cat = catalog.data?.categories.find(c => c.id === draft.category || c.aliases?.includes(draft.category))
  const currentItem = { photoId: photoId || undefined, category: cat?.id ?? draft.category, volumeM3: draft.volumeM3, label: scan.data?.subtype || state?.scan?.subtype || cat?.name || 'Gegenstand' }
  const others = cart.filter(i => !photoId || i.photoId !== photoId)
  const totalVolume = others.reduce((sum, i) => sum + i.volumeM3, 0) + draft.volumeM3
  const body = useMemo(() => ({ ...draft, category: cat?.id ?? draft.category, photoId: photoId || undefined,
    volumeM3: totalVolume, items: [...others, currentItem].map(({ label: _label, ...item }) => item),
  }), [draft, cat?.id, photoId, JSON.stringify(others), totalVolume])
  const fingerprint = JSON.stringify(body)
  const valid = !!cat?.collectable && Number.isFinite(draft.volumeM3) && draft.volumeM3 > 0 && totalVolume <= (catalog.data?.maxVolumeM3 ?? 6)
  const [answer, setAnswer] = useState<{ key: string; data: PickupResolution } | null>(null)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState('')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newDate, setNewDate] = useState(false)
  const result = answer?.key === fingerprint ? answer.data : null
  const requestStorageKey = `${storageKey}:request:${fingerprint}:${selected}`
  const requestKey = useMemo(() => {
    try { const previous = sessionStorage.getItem(requestStorageKey); if (previous) return previous } catch { /* Storage is optional. */ }
    return crypto.randomUUID()
  }, [requestStorageKey])
  useEffect(() => {
    let cancelled = false
    setAnswer(null); setSelected(''); setError(''); setNewDate(false)
    if (!valid) return
    const timer = setTimeout(() => {
      api.post<PickupResolution>('/api/fes/resolve', body).then(data => {
        if (cancelled) return
        setAnswer({ key: fingerprint, data }); setSelected(data.slots?.find(s => s.available)?.date ?? '')
      }).catch((e: Error) => { if (!cancelled) setError(e.message) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [fingerprint, retry, valid]) // fingerprint includes every resolver input
  const alternative = useApi<{ slots: NonNullable<PickupResolution['slots']> }>(newDate ? `/api/fes/slots?districtId=${encodeURIComponent(draft.districtId)}&volume=${totalVolume}` : null)
  // `needs_address` carries the same slot list as `available_slots` — the
  // server answers with both whenever the category and district are known.
  // Rendering only the latter meant arriving without an address showed no
  // dates at all, so a card promising "Platz buchen" opened a form with
  // nothing to book. The dates now show either way; the address is still
  // required to confirm, and the footer button stays disabled until it is
  // there, which says that far better than an empty panel did.
  const slots = newDate
    ? alternative.data?.slots
    : result?.state === 'available_slots' || result?.state === 'needs_address'
      ? result.slots
      : undefined
  const matched = !newDate && result?.state === 'existing_booking'
  const already = result?.state === 'already_booked'
  const chosen = slots?.find(s => s.date === selected && s.available)
  const ready = !recoverKey && result && !already && draft.address.trim().length >= 5 && valid && (matched || chosen)
  function editContact(values: Partial<NonNullable<Draft['contact']>>) { edit({ contact: { fullName: me?.name ?? '', email: '', phone: '', postcode: '', placement: '', ...draft.contact, ...values } }) }
  function edit(values: Partial<Draft>) { setEdited(true); setDraft(d => ({ ...d, ...values })) }
  async function submit() {
    if (!ready || busy) return
    setBusy(true); setSubmitError('')
    try { sessionStorage.setItem(requestStorageKey, requestKey); sessionStorage.setItem(pendingStorageKey, requestKey) } catch { /* Retry remains idempotent in this tab. */ }
    try {
      const response = matched
        ? await api.post<{ pickup: { id: string } }>(`/api/fes/pickups/${result!.pickup!.id}/items`, { ...body, requestKey })
        : await api.post<FesBooking>('/api/fes/pickups', { ...body, slotDate: selected, requestKey })
      try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(requestStorageKey); sessionStorage.removeItem(cartKey); sessionStorage.removeItem(`${cartKey}:details`); sessionStorage.removeItem(pendingStorageKey) } catch { /* Optional draft persistence. */ }
      void refresh()
      navigate(`/abholung/${response.pickup.id}`, { replace: true, state: { saved: true } })
    } catch (e) { setSubmitError((e as Error).message); setReview(false); if (!(e instanceof ApiError) || e.status >= 500) setRecoverKey(requestKey); else { try { sessionStorage.removeItem(pendingStorageKey) } catch { /* Optional storage. */ } } }
    finally { setBusy(false) }
  }
  return <Screen back title={t("Sperrmüll anmelden")} sub={t("Was möchtest du abholen lassen?")} footer={
    already ? <button className="btn primary" onClick={() => navigate(`/abholung/${result!.pickup!.id}`)}>{t("Vorhandenen Termin öffnen")}</button>
      : <button className="btn primary" disabled={!ready || busy} onClick={() => setReview(true)}><Icon name="truck" size={18} />{t(matched ? 'Gegenstand hinzufügen' : 'Abholung prüfen und eintragen')}</button>
  }>
    {t(recoverKey && <div className="card sky" role="status"><p>{t(recoveryError || 'Wir prüfen, ob deine letzte Anmeldung gespeichert wurde …')}</p><button className="btn" onClick={() => void recover()}>{t("Anfragestatus prüfen")}</button></div>)}
    {t(submitError && <div className="card" role="alert"><p>{t(submitError)}</p><p className="xs mut">{t("Du kannst dieselbe Anmeldung erneut senden. Doppelte Anfragen werden nur einmal gespeichert.")}</p><button className="btn sm" onClick={() => setRetry(v => v + 1)}>{t("Verfügbarkeit erneut prüfen")}</button></div>)}
    <div className="between"><span className="lbl">{t("Gemeinsam sammeln")}</span></div>
    {t(scan.error && <p role="alert">{t(scan.error.message)}</p>)}
    <section className="card pickup-fields"><div className="between"><h2 className="lbl">{t("Abholadresse")}</h2><button className="text-link" disabled={addressEditing && draft.address.trim().length < 5} onClick={() => setAddressEditing(v => !v)}>{t(addressEditing ? 'Fertig' : 'Ändern')}</button></div>
      {t(!addressEditing && <div className="row"><Icon name="pin" size={22} /><div><b>{t(draft.address || 'Adresse ergänzen')}</b><p className="xs mut">{t(STADTTEILE.find(d => d.id === draft.districtId)?.name)} {t(" · ")}{t(draft.contact?.fullName || me?.name)}</p></div></div>)}
      {t(addressEditing && <div className="pickup-fields">
      <label className="sm">{t("Vor- und Nachname")}<input className="field" autoComplete="name" value={draft.contact?.fullName ?? me?.name ?? ''} onChange={e => editContact({ fullName: e.target.value })} /></label>
      <label className="sm">{t("Straße und Hausnummer")}<input className="field" autoComplete="street-address" value={draft.address} onChange={e => edit({ address: e.target.value })} placeholder={t("Zum Beispiel Leipziger Straße 12")} /></label>
      <label className="sm">{t("Stadtteil")}<select className="field" value={draft.districtId} onChange={e => edit({ districtId: e.target.value })}>{t(STADTTEILE.map(d => <option key={d.id} value={d.id}>{d.name}</option>))}</select></label>
      <details><summary className="sm">{t("Kontakt und Zugang (optional)")}</summary><div className="pickup-fields">
      <label className="sm">{t("E-Mail (optional)")}<input className="field" type="email" autoComplete="email" value={draft.contact?.email ?? ''} onChange={e => editContact({ email: e.target.value })} /></label>
      <label className="sm">{t("Mobilnummer (optional)")}<input className="field" type="tel" autoComplete="tel" value={draft.contact?.phone ?? ''} onChange={e => editContact({ phone: e.target.value })} /></label>
      <label className="sm">{t("PLZ (optional)")}<input className="field" inputMode="numeric" autoComplete="postal-code" value={draft.contact?.postcode ?? ''} onChange={e => editContact({ postcode: e.target.value })} /></label>
      <label className="sm">{t("Abstellort / Zugangshinweis (optional)")}<input className="field" value={draft.contact?.placement ?? ''} onChange={e => editContact({ placement: e.target.value })} placeholder={t("Zum Beispiel vor dem Hauseingang")} /></label>
      </div></details>
      <p className="xs mut">{t("Deine Angaben · Frankfurt am Main. Kontaktdaten werden für diese Anfrage gespeichert; keine SMS oder E-Mail wird versendet.")}</p>
      <p className="xs mut">{t("Ein vorhandener Termin muss zur gleichen Adresse passen und genügend Platz bieten.")}</p>
      </div>)}
    </section>
    <div className="card pickup-fields"><div className="between"><h2 className="lbl">{t("Gegenstände · ")}{t(others.length + 1)} {t(" / 3")}</h2><span className="xs mut">{t(totalVolume.toLocaleString(getLocale()))} {t(" / 6 m³")}</span></div>
      <div className="row">{t(photoId && <img className="thumb" src={`/api/photos/${encodeURIComponent(photoId)}`} alt={t("Gescannter Gegenstand")} width={60} height={60} />)}<div className="grow"><b>{t(currentItem.label)}</b><p className="xs mut">{t(cat?.name || 'Kategorie prüfen')} {t(" · ")}{t(draft.volumeM3.toLocaleString(getLocale()))} {t(" m³")}</p></div><button className="text-link" onClick={() => setItemEditing(v => !v)}>{t(itemEditing ? 'Fertig' : 'Ändern')}</button></div>
      {t(others.map((item, index) => <div className="between" key={item.photoId || index}><span className="sm">{t(item.label)} {t(" · ")}{t(item.volumeM3.toLocaleString(getLocale()))} {t(" m³")}</span><button className="btn sm" onClick={() => setCart(others.filter((_, i) => i !== index))}>{t("Entfernen")}</button></div>))}
      {t(catalog.error && <button className="btn" onClick={catalog.reload}>{t("Kategorien erneut laden")}</button>)}
      {t((itemEditing || !cat || !valid) && <div className="pickup-fields"><label className="sm">{t("Kategorie")}<select className="field" value={cat?.id ?? ''} onChange={e => edit({ category: e.target.value })}>
        <option value="">{t("Kategorie wählen")}</option>{t(catalog.data?.categories.map(c => <option key={c.id} value={c.id}>{t(c.name)}</option>))}</select></label>
      <label className="sm">{t("Volumen in m³")}<input className="field" type="number" min="0.01" max="6" step="0.01" value={Number.isNaN(draft.volumeM3) ? '' : draft.volumeM3} onChange={e => edit({ volumeM3: e.target.valueAsNumber })} /></label></div>)}

      {t(others.length < 2 && <button className="btn" disabled={!valid} onClick={() => {
        const next = [...others, currentItem]
        try { sessionStorage.setItem(cartKey, JSON.stringify(next)); sessionStorage.setItem(`${cartKey}:details`, JSON.stringify({ address: draft.address, districtId: draft.districtId, contact: draft.contact })) } catch { setSubmitError('Zwischenspeicher nicht verfügbar. Bitte diese Anmeldung zuerst abschließen.'); return }
        navigate('/scan?pickupCart=1')
      }}>{t("Weiteren Gegenstand fotografieren")}</button>)}
      {t(cat?.note && <p className="xs mut">{t(cat.note)}</p>)}
      {t(cat && !cat.collectable && <div role="status"><p>{t(cat.alternative?.why)}</p><button className="btn" onClick={() => navigate(`/wissen?category=${cat.id}`)}>{t(cat.alternative?.what || 'Passende Entsorgung finden')}</button></div>)}
      {t(cat?.collectable && !valid && <p role="alert">{t("Bitte ein Volumen größer als 0 und höchstens 6 m³ angeben. Größere Mengen benötigen eine andere Entsorgung.")}</p>)}
    </div>
    <div className="card" aria-live="polite"><h2 className="h2">{t("Sammelzeitraum wählen")}</h2>
      {t(!valid ? <p>{t("Bitte zuerst Gegenstand und Volumen prüfen.")}</p> : !result && !error ? <p><span className="spinner" /> {t(" Termine werden geprüft …")}</p> : null)}
      {t(result?.state === 'needs_address' && <><p>{t("Bitte Straße und Hausnummer ergänzen oder einen vorhandenen Abholort übernehmen.")}</p>{t(result.candidates?.map(p => <button className="card tight" key={p.id} onClick={() => edit({ address: p.address, districtId: p.districtId })}>{t(p.label)} {t(" · ")}{p.address}<br /><span className="xs mut">{t("Diesen Abholort verwenden")}</span></button>))}</>)}
      {t(result?.pickup && !newDate && <><p className="h3" style={{ marginTop: 12 }}>{t(result.pickup.label)} {t(" · ")}{t(result.pickup.window || 'Ankunftsfenster folgt')}</p><p className="sm">{result.pickup.address} {t(" · ")}{t(result.pickup.volumeM3.toLocaleString(getLocale()))} {t(" m³ bereits eingetragen")}</p>
        <p className="xs mut">{t(already ? 'Dieses Objekt ist bereits zugeordnet. Keine neue Buchung nötig.' : 'Dein bestehender Termin passt. Das Objekt wird erst nach deiner Bestätigung hinzugefügt.')}</p>
        {t(matched && <button className="btn sm" onClick={() => { setNewDate(true); setSelected('') }}>{t("Anderen Termin wählen")}</button>)}</>)}
      {t((result?.state === 'available_slots' || newDate) && <p className="xs mut">{t(newDate ? 'Wähle einen anderen Termin.' : 'Kein passender bestehender Termin. Der früheste freie Termin ist vorausgewählt.')}</p>)}
        {t(result?.state === 'needs_address' && !newDate && <p className="xs mut">{t("Diese Termine fahren deinen Stadtteil an. Für die Buchung fehlt noch deine Adresse.")}</p>)}
      {t(newDate && <button className="btn sm" onClick={() => setNewDate(false)}>{t("Bestehenden Termin verwenden")}</button>)}
      {t(alternative.loading && <p>{t("Alternative Termine laden …")}</p>)}
      {t(alternative.error && <button className="btn" onClick={alternative.reload}>{t("Termine erneut laden")}</button>)}
      <div className="col" style={{ gap: 8 }}>{t(slots?.map(s => <button key={s.date} className="card tight pickup-slot" disabled={!s.available} aria-pressed={selected === s.date} onClick={() => setSelected(s.date)}>
        <b>{t(s.periodLabel || s.label)}</b><span className="xs mut" style={{ display: 'block' }}>{t(s.available ? 'Gemeinsame Tour' : s.reason)}</span></button>))}</div>
      {t((result?.state === 'no_availability' || (newDate && alternative.data && !alternative.data.slots.some(s => s.available))) && <p>{t("Im angebotenen Zeitraum ist kein Transport frei. Bitte später erneut prüfen oder eine passende Abgabestelle wählen.")}</p>)}
      {t(error && <div role="alert"><p>{t(error)}</p><button className="btn" onClick={() => setRetry(v => v + 1)}>{t("Erneut prüfen")}</button></div>)}
    </div>
    <details className="card tight"><summary>{t("So funktioniert die Sammeltour")}</summary><p className="sm">{t("Du wählst einen Zeitraum. Nach Buchungsschluss planen wir die gemeinsame Tour und teilen dein Ankunftsfenster und den Bereitstellzeitpunkt mit.")}</p><p className="xs mut">{t("In ReMain eingetragen, nicht bei FES gebucht. Termine und Kapazität sind simuliert. Erinnerungen erscheinen in deinen Mitteilungen.")}</p></details>
    <button className="btn" onClick={() => navigate('/kalender')}>{t("Meine Termine im Kalender")}</button>
    {t(review && <DecisionSheet title={t(matched ? 'Zur Sammeltour hinzufügen?' : 'Anfrage bestätigen?')} busy={busy} onClose={() => setReview(false)}>
      <p>{t(others.length + 1)} {t(others.length === 0 ? 'Gegenstand' : 'Gegenstände')} {t(" · ")}{t(totalVolume.toLocaleString(getLocale()))} {t(" m³")}<br />{draft.address}<br />{t(matched ? result?.pickup?.label : chosen?.periodLabel || chosen?.label)}</p>
      {t(!matched && chosen?.closesLocal && <p className="sm">{t("Buchungsschluss: ")}{t(chosen.closesLocal.slice(0, 10).split('-').reverse().join('.'))} {t(" · 23:59 Uhr. Das genaue Ankunftsfenster folgt nach gemeinsamer Tourplanung.")}</p>)}
      <p className="xs mut">{t("Eine Anfrage pro Adresse und Zeitraum. Belohnt wird die Anmeldung, nicht die Anzahl der Gegenstände.")}</p>
      <p className="sm mut">{t("Dieser Schritt speichert die Anmeldung in ReMain. Er beauftragt keine echte FES-Abholung.")}</p>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void submit()}>{t(busy ? 'Wird gespeichert …' : matched ? 'Gegenstand hinzufügen' : 'Jetzt in ReMain eintragen')}</button>
    </DecisionSheet>)}
  </Screen>
}
