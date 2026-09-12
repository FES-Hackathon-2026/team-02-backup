import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import DecisionSheet from '../components/DecisionSheet'
import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Tag } from '../components/ui'
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
    try { const saved = sessionStorage.getItem(storageKey); if (saved) { const parsed = JSON.parse(saved) as Draft; return { ...parsed, address: params.get('address') || parsed.address, districtId: params.get('district') || parsed.districtId } } } catch { /* Storage can be unavailable. */ }
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
  const slots = newDate ? alternative.data?.slots : result?.state === 'available_slots' ? result.slots : undefined
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
  return <Screen back title="Sperrmüll anmelden" sub="Gegenstände · Abholort · Sammeltour" footer={
    already ? <button className="btn primary" onClick={() => navigate(`/abholung/${result!.pickup!.id}`)}>Vorhandenen Termin öffnen</button>
      : <button className="btn primary" disabled={!ready || busy} onClick={() => setReview(true)}><Icon name="truck" size={18} />{matched ? 'Gegenstand hinzufügen' : 'Abholung prüfen und eintragen'}</button>
  }>
    {recoverKey && <div className="card sky" role="status"><p>{recoveryError || 'Wir prüfen, ob deine letzte Anmeldung gespeichert wurde …'}</p><button className="btn" onClick={() => void recover()}>Anfragestatus prüfen</button></div>}
    {submitError && <div className="card" role="alert"><p>{submitError}</p><p className="xs mut">Du kannst dieselbe Anmeldung erneut senden. Doppelte Anfragen werden nur einmal gespeichert.</p><button className="btn sm" onClick={() => setRetry(v => v + 1)}>Verfügbarkeit erneut prüfen</button></div>}
    <div className="between"><span className="lbl">Gemeinsam sammeln</span><Tag von="simulated" /></div>
    {scan.error && <p role="alert">{scan.error.message}</p>}
    <section className="card pickup-fields"><div className="between"><h2 className="lbl">Abholadresse</h2><button className="text-link" disabled={addressEditing && draft.address.trim().length < 5} onClick={() => setAddressEditing(v => !v)}>{addressEditing ? 'Fertig' : 'Ändern'}</button></div>
      {!addressEditing && <div className="row"><Icon name="pin" size={22} /><div><b>{draft.address || 'Adresse ergänzen'}</b><p className="xs mut">{STADTTEILE.find(d => d.id === draft.districtId)?.name} · {draft.contact?.fullName || me?.name}</p></div></div>}
      {addressEditing && <div className="pickup-fields">
      <label className="sm">Vor- und Nachname<input className="field" autoComplete="name" value={draft.contact?.fullName ?? me?.name ?? ''} onChange={e => editContact({ fullName: e.target.value })} /></label>
      <label className="sm">Straße und Hausnummer<input className="field" autoComplete="street-address" value={draft.address} onChange={e => edit({ address: e.target.value })} placeholder="Zum Beispiel Leipziger Straße 12" /></label>
      <label className="sm">Stadtteil<select className="field" value={draft.districtId} onChange={e => edit({ districtId: e.target.value })}>{STADTTEILE.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <details><summary className="sm">Kontakt und Zugang (optional)</summary><div className="pickup-fields">
      <label className="sm">E-Mail (optional)<input className="field" type="email" autoComplete="email" value={draft.contact?.email ?? ''} onChange={e => editContact({ email: e.target.value })} /></label>
      <label className="sm">Mobilnummer (optional)<input className="field" type="tel" autoComplete="tel" value={draft.contact?.phone ?? ''} onChange={e => editContact({ phone: e.target.value })} /></label>
      <label className="sm">PLZ (optional)<input className="field" inputMode="numeric" autoComplete="postal-code" value={draft.contact?.postcode ?? ''} onChange={e => editContact({ postcode: e.target.value })} /></label>
      <label className="sm">Abstellort / Zugangshinweis (optional)<input className="field" value={draft.contact?.placement ?? ''} onChange={e => editContact({ placement: e.target.value })} placeholder="Zum Beispiel vor dem Hauseingang" /></label>
      </div></details>
      <p className="xs mut">Deine Angaben · Frankfurt am Main. Kontaktdaten werden für diese Anfrage gespeichert; keine SMS oder E-Mail wird versendet.</p>
      <p className="xs mut">Ein vorhandener Termin muss zur gleichen Adresse passen und genügend Platz bieten.</p>
      </div>}
    </section>
    <div className="card pickup-fields"><div className="between"><h2 className="lbl">Gegenstände · {others.length + 1} / 3</h2><span className="xs mut">{totalVolume.toLocaleString('de-DE')} / 6 m³</span></div>
      <div className="row">{photoId && <img className="thumb" src={`/api/photos/${encodeURIComponent(photoId)}`} alt="Gescannter Gegenstand" width={60} height={60} />}<div className="grow"><b>{currentItem.label}</b><p className="xs mut">{cat?.name || 'Kategorie prüfen'} · {draft.volumeM3.toLocaleString('de-DE')} m³</p></div><button className="text-link" onClick={() => setItemEditing(v => !v)}>{itemEditing ? 'Fertig' : 'Ändern'}</button></div>
      {others.map((item, index) => <div className="between" key={item.photoId || index}><span className="sm">{item.label} · {item.volumeM3.toLocaleString('de-DE')} m³</span><button className="btn sm" onClick={() => setCart(others.filter((_, i) => i !== index))}>Entfernen</button></div>)}
      {catalog.error && <button className="btn" onClick={catalog.reload}>Kategorien erneut laden</button>}
      {(itemEditing || !cat || !valid) && <div className="pickup-fields"><label className="sm">Kategorie<select className="field" value={cat?.id ?? ''} onChange={e => edit({ category: e.target.value })}>
        <option value="">Kategorie wählen</option>{catalog.data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="sm">Volumen in m³<input className="field" type="number" min="0.01" max="6" step="0.01" value={Number.isNaN(draft.volumeM3) ? '' : draft.volumeM3} onChange={e => edit({ volumeM3: e.target.valueAsNumber })} /></label></div>}

      {others.length < 2 && <button className="btn" disabled={!valid} onClick={() => {
        const next = [...others, currentItem]
        try { sessionStorage.setItem(cartKey, JSON.stringify(next)); sessionStorage.setItem(`${cartKey}:details`, JSON.stringify({ address: draft.address, districtId: draft.districtId, contact: draft.contact })) } catch { setSubmitError('Zwischenspeicher nicht verfügbar. Bitte diese Anmeldung zuerst abschließen.'); return }
        navigate('/scan?pickupCart=1')
      }}>Weiteren Gegenstand fotografieren</button>}
      {cat?.note && <p className="xs mut">{cat.note}</p>}
      {cat && !cat.collectable && <div role="status"><p>{cat.alternative?.why}</p><button className="btn" onClick={() => navigate(`/wissen?category=${cat.id}`)}>{cat.alternative?.what || 'Passende Entsorgung finden'}</button></div>}
      {cat?.collectable && !valid && <p role="alert">Bitte ein Volumen größer als 0 und höchstens 6 m³ angeben. Größere Mengen benötigen eine andere Entsorgung.</p>}
    </div>
    <div className="card" aria-live="polite"><h2 className="h2">Sammelzeitraum wählen</h2>
      {!valid ? <p>Bitte zuerst Gegenstand und Volumen prüfen.</p> : !result && !error ? <p><span className="spinner" /> Termine werden geprüft …</p> : null}
      {result?.state === 'needs_address' && <><p>Bitte Straße und Hausnummer ergänzen oder einen vorhandenen Abholort übernehmen.</p>{result.candidates?.map(p => <button className="card tight" key={p.id} onClick={() => edit({ address: p.address, districtId: p.districtId })}>{p.label} · {p.address}<br /><span className="xs mut">Diesen Abholort verwenden</span></button>)}</>}
      {result?.pickup && !newDate && <><p className="h3" style={{ marginTop: 12 }}>{result.pickup.label} · {result.pickup.window || 'Ankunftsfenster folgt'}</p><p className="sm">{result.pickup.address} · {result.pickup.volumeM3.toLocaleString('de-DE')} m³ bereits eingetragen</p>
        <p className="xs mut">{already ? 'Dieses Objekt ist bereits zugeordnet. Keine neue Buchung nötig.' : 'Dein bestehender Termin passt. Das Objekt wird erst nach deiner Bestätigung hinzugefügt.'}</p>
        {matched && <button className="btn sm" onClick={() => { setNewDate(true); setSelected('') }}>Anderen Termin wählen</button>}</>}
      {(result?.state === 'available_slots' || newDate) && <p className="xs mut">{newDate ? 'Wähle einen anderen Termin.' : 'Kein passender bestehender Termin. Der früheste freie Termin ist vorausgewählt.'}</p>}
      {newDate && <button className="btn sm" onClick={() => setNewDate(false)}>Bestehenden Termin verwenden</button>}
      {alternative.loading && <p>Alternative Termine laden …</p>}
      {alternative.error && <button className="btn" onClick={alternative.reload}>Termine erneut laden</button>}
      <div className="col" style={{ gap: 8 }}>{slots?.map(s => <button key={s.date} className="card tight pickup-slot" disabled={!s.available} aria-pressed={selected === s.date} onClick={() => setSelected(s.date)}>
        <b>{s.periodLabel || s.label}</b><span className="xs mut" style={{ display: 'block' }}>{s.available ? `Gemeinsame Tour · ${s.vehicle} · Ankunftsfenster folgt` : s.reason}</span></button>)}</div>
      {(result?.state === 'no_availability' || (newDate && alternative.data && !alternative.data.slots.some(s => s.available))) && <p>Im angebotenen Zeitraum ist kein Transport frei. Bitte später erneut prüfen oder eine passende Abgabestelle wählen.</p>}
      {error && <div role="alert"><p>{error}</p><button className="btn" onClick={() => setRetry(v => v + 1)}>Erneut prüfen</button></div>}
    </div>
    <details className="card tight"><summary>So funktioniert die Sammeltour</summary><p className="sm">Du wählst einen Zeitraum. Nach Buchungsschluss planen wir die gemeinsame Tour und teilen dein Ankunftsfenster und den Bereitstellzeitpunkt mit.</p><p className="xs mut">In ReMain eingetragen, nicht bei FES gebucht. Termine und Kapazität sind simuliert. Erinnerungen erscheinen in deinen Mitteilungen.</p></details>
    <button className="btn" onClick={() => navigate('/kalender')}>Meine Termine im Kalender</button>
    {review && <DecisionSheet title={matched ? 'Zur Sammeltour hinzufügen?' : 'Anfrage bestätigen?'} busy={busy} onClose={() => setReview(false)}>
      <Tag von="simulated" /><p>{others.length + 1} {others.length === 0 ? 'Gegenstand' : 'Gegenstände'} · {totalVolume.toLocaleString('de-DE')} m³<br />{draft.address}<br />{matched ? result?.pickup?.label : chosen?.periodLabel || chosen?.label}</p>
      {!matched && chosen?.closesLocal && <p className="sm">Buchungsschluss: {chosen.closesLocal.slice(0, 10).split('-').reverse().join('.')} · 23:59 Uhr. Das genaue Ankunftsfenster folgt nach gemeinsamer Tourplanung.</p>}
      <p className="xs mut">Eine Anfrage pro Adresse und Zeitraum. Belohnt wird die Anmeldung, nicht die Anzahl der Gegenstände.</p>
      <p className="sm mut">Dieser Schritt speichert die Anmeldung in ReMain. Er beauftragt keine echte FES-Abholung.</p>
      <button className="btn primary" disabled={busy || !ready} onClick={() => void submit()}>{busy ? 'Wird gespeichert …' : matched ? 'Gegenstand hinzufügen' : 'Jetzt in ReMain eintragen'}</button>
    </DecisionSheet>}
  </Screen>
}
