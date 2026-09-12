import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag, Thumb } from '../components/ui'
import {
  ApiError,
  api,
  useApi,
  type MarketCatalogue,
  type MarketDetail,
  type MarketItem,
  type MarketMine,
  type MarketMineItem,
  type Place,
} from '../lib/client'
import { stadtteil } from '../lib/frankfurt'
import { useMe } from '../lib/session'

/**
 * Phase 6 — the Reparatur-Markt.
 *
 * Three views on one idea: what is on offer, what I am part of, and who in
 * Frankfurt could actually fix it. The last one is real OpenStreetMap data,
 * not a list of businesses we invented.
 *
 * Nothing here has a price. Free-to-take is the design.
 */

const KATEGORIE_ICON: Record<string, IconName> = {
  elektro: 'market',
  moebel: 'home',
  fahrrad: 'route',
  sonstiges: 'wrench',
}

const UMKREIS = [
  { km: 25, label: 'ganz Frankfurt' },
  { km: 5, label: 'unter 5 km' },
  { km: 2, label: 'unter 2 km' },
] as const

const STATUS_LABEL: Record<string, string> = {
  open: 'offen',
  reserved: 'reserviert',
  handed_over: 'übergeben',
  withdrawn: 'zurückgezogen',
}

type Modus = 'suchen' | 'meine' | 'betriebe'

/* ------------------------------------------------------------------
   Where the person is. The device position when it is given, the centre
   of their own Stadtteil otherwise — so the distance filter works on the
   first render and never waits on a permission dialog.
   ------------------------------------------------------------------ */

function usePosition(fallback: { lat: number; lon: number }) {
  const [pos, setPos] = useState(fallback)
  const [exact, setExact] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude })
        setExact(true)
      },
      () => {},
      { timeout: 6000, maximumAge: 120_000 },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return { pos, exact }
}

/**
 * The browser downscales and re-encodes before the upload. That is what
 * actually removes the EXIF block, including the GPS tag — the server takes
 * position as a separate field the person agreed to send.
 */
async function downscale(file: File, max = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode'))),
      'image/jpeg',
      0.82,
    )
  })
}

/* ------------------------------------------------------------------ */

export default function Markt() {
  const me = useMe()
  const home = stadtteil(me.district.id)
  const { pos, exact } = usePosition({ lat: home?.lat ?? 50.1109, lon: home?.lon ?? 8.6821 })

  const [params, setParams] = useSearchParams()
  const [modus, setModus] = useState<Modus>('suchen')
  const [kategorie, setKategorie] = useState('')
  const [umkreis, setUmkreis] = useState<number>(25)
  const [anbieten, setAnbieten] = useState(false)

  // The scan hands over here:
  //   /markt?anbieten=1&photo=<photoId>&kategorie=<id>&titel=<text>&defekt=<tag>
  // A bare ?photo= is enough to open the sheet, so the scan screen only has
  // to append the photo id it already holds.
  const vomScan = params.get('anbieten') === '1' || params.get('photo') !== null
  useEffect(() => {
    if (vomScan) setAnbieten(true)
  }, [vomScan])

  const suche = useMemo(() => {
    const q = new URLSearchParams({ lat: String(pos.lat), lon: String(pos.lon), r: String(umkreis) })
    if (kategorie) q.set('category', kategorie)
    return `/api/market?${q}`
  }, [kategorie, umkreis, pos.lat, pos.lon])

  const markt = useApi<{ items: MarketItem[] }>(modus === 'suchen' ? suche : null)
  // Always loaded, not only on the tab: a handover waiting on this person is
  // the one thing they must not have to go looking for.
  const meine = useApi<MarketMine>('/api/market/mine')
  // The other half of the marketplace: who can actually fix it. Real shops.
  const betriebe = useApi<{ places: Place[] }>(
    modus === 'betriebe'
      ? `/api/places?kind=reparatur&lat=${pos.lat}&lon=${pos.lon}&r=12&limit=40`
      : null,
  )
  const katalog = useApi<MarketCatalogue>('/api/market/defects')

  const items = markt.data?.items ?? []
  const kategorien = katalog.data?.categories ?? []

  /** Handovers where the other side has confirmed and this person has not. */
  const wartetAufDich =
    (meine.data?.offered.filter((i) => i.status === 'reserved' && !i.handover.owner).length ?? 0) +
    (meine.data?.claimed.filter((i) => i.status === 'reserved' && !i.handover.claimer).length ?? 0)

  const schliessen = useCallback(
    (neu?: string) => {
      setAnbieten(false)
      if (vomScan) setParams({}, { replace: true })
      if (neu) {
        setModus('meine')
        meine.reload()
      }
    },
    [vomScan, setParams, meine],
  )

  return (
    <Screen
      title="Reparatur-Markt"
      sub={`${exact ? 'um dich herum' : me.district.name} · ${UMKREIS.find((u) => u.km === umkreis)?.label}`}
      tabs
      action={
        <button className="icobtn" aria-label="Etwas anbieten" onClick={() => setAnbieten(true)}>
          <Icon name="plus" size={21} />
        </button>
      }
    >
      <div className="between"><p className="sm mut" style={{ margin: 0 }}>Rettet Sachen vor dem Sperrmüll</p><button className="btn sm" onClick={() => setAnbieten(true)}>Anbieten</button></div>

      <Segment modus={modus} onChange={setModus} offen={wartetAufDich || undefined} />

      {modus === 'suchen' && (
        <>
          <div className="chips scroll">
            <button className="chip" aria-pressed={kategorie === ''} onClick={() => setKategorie('')}>
              Alles
            </button>
            {kategorien.map((k) => (
              <button
                key={k.id}
                className="chip"
                aria-pressed={k.id === kategorie}
                onClick={() => setKategorie(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="chips scroll">
            {UMKREIS.map((u) => (
              <button
                key={u.km}
                className="chip"
                aria-pressed={u.km === umkreis}
                onClick={() => setUmkreis(u.km)}
              >
                {u.label}
              </button>
            ))}
          </div>

          {markt.loading && (
            <div className="empty">
              <span className="spinner" />
            </div>
          )}

          {!markt.loading && items.length === 0 && (
            <div className="empty">
              <Icon name="market" size={26} />
              Hier ist gerade nichts zu vergeben. Stell das Erste ein.
            </div>
          )}

          <div className="col" style={{ gap: 10 }}>
            {items.map((item) => (
              <AngebotKarte key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {modus === 'meine' && <Meine load={meine} meId={me.id} />}

      {modus === 'betriebe' && (
        <>
          <p className="xs mut" style={{ lineHeight: 1.5, margin: 0 }}>
            {betriebe.data?.places.length ?? 0} Reparaturbetriebe im Umkreis von 12 km.{' '}
            <Tag von="api">OpenStreetMap</Tag>
          </p>

          {betriebe.loading && (
            <div className="empty">
              <span className="spinner" />
            </div>
          )}

          <div className="col" style={{ gap: 9 }}>
            {betriebe.data?.places.map((p) => (
              <div key={p.id} className="card tight row" style={{ gap: 11, display: 'flex' }}>
                <span className="thumb" style={{ width: 38, height: 38, flex: 'none' }}>
                  <Icon name="wrench" size={19} />
                </span>
                <span className="grow">
                  <b className="sm" style={{ display: 'block' }}>
                    {p.name}
                  </b>
                  <span className="xs mut">
                    {p.addr ?? 'Adresse nicht hinterlegt'}
                    {p.distanceKm !== undefined && ` · ${p.distanceKm.toFixed(1)} km`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {anbieten && (
        <AnbietenSheet
          katalog={katalog.data}
          position={pos}
          vorgabe={{
            titel: params.get('titel') ?? '',
            kategorie: params.get('kategorie') ?? '',
            defekt: params.get('defekt') ?? '',
            photoId: params.get('photo'),
          }}
          onClose={schliessen}
        />
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------
   Pieces
   ------------------------------------------------------------------ */

function Segment({
  modus,
  onChange,
  offen,
}: {
  modus: Modus
  onChange: (m: Modus) => void
  offen?: number
}) {
  const tabs: [Modus, string][] = [
    ['suchen', 'Zu vergeben'],
    ['meine', offen ? `Meine · ${offen}` : 'Meine'],
    ['betriebe', 'Wer repariert'],
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: 4,
        background: 'var(--sky)',
        padding: 4,
        borderRadius: 13,
      }}
    >
      {tabs.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-pressed={modus === id}
          style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            border: 'none',
            fontSize: 12.5,
            fontWeight: modus === id ? 700 : 600,
            background: modus === id ? 'var(--card)' : 'transparent',
            color: modus === id ? 'var(--ink)' : 'var(--blue-ink)',
            boxShadow: modus === id ? 'var(--sh)' : 'none',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function AngebotKarte({ item }: { item: MarketItem }) {
  return (
    <Link className="card tight" to={`/markt/${item.id}`}>
      <span className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        {item.photoId ? (
          <img
            src={`/api/photos/${item.photoId}`}
            alt=""
            style={{ width: 82, height: 92, borderRadius: 13, objectFit: 'cover', flex: 'none' }}
          />
        ) : (
          <Thumb icon={KATEGORIE_ICON[item.category] ?? 'market'} size={82} />
        )}

        <span className="grow col" style={{ gap: 5, alignItems: 'flex-start' }}>
          <span className="between" style={{ width: '100%', alignItems: 'flex-start' }}>
            <b className="sm">{item.title}</b>
            <Tag von="api">kostenlos</Tag>
          </span>
          <span className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            <Label tone="warn">{item.defect}</Label>
            {item.condition && <Tag von="input">{item.condition}</Tag>}
          </span>
          <span className="xs mut">
            {item.district}
            {item.distanceKm !== undefined && ` · ${item.distanceKm.toFixed(1)} km`}
          </span>
        </span>
      </span>
    </Link>
  )
}

/** What I offered and what I reserved — the only way back to a handover. */
function Meine({ load, meId }: { load: ReturnType<typeof useApi<MarketMine>>; meId: number }) {
  const offered = load.data?.offered ?? []
  const claimed = load.data?.claimed ?? []

  if (load.loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    )
  }

  if (offered.length === 0 && claimed.length === 0) {
    return (
      <div className="empty">
        <Icon name="market" size={26} />
        Du hast noch nichts angeboten und nichts reserviert.
      </div>
    )
  }

  return (
    <>
      {offered.length > 0 && (
        <>
          <h2 className="h3">Von dir angeboten</h2>
          <div className="col" style={{ gap: 9 }}>
            {offered.map((i) => (
              <MeineKarte key={i.id} item={i} meId={meId} />
            ))}
          </div>
        </>
      )}

      {claimed.length > 0 && (
        <>
          <h2 className="h3">Von dir reserviert</h2>
          <div className="col" style={{ gap: 9 }}>
            {claimed.map((i) => (
              <MeineKarte key={i.id} item={i} meId={meId} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function MeineKarte({ item, meId }: { item: MarketMineItem; meId: number }) {
  const istBesitz = item.ownerId === meId
  const ichHabeBestaetigt = istBesitz ? item.handover.owner : item.handover.claimer
  const andereHatBestaetigt = istBesitz ? item.handover.claimer : item.handover.owner

  const hinweis = item.handover.complete
    ? 'Übergeben und gutgeschrieben.'
    : item.status !== 'reserved'
      ? istBesitz
        ? 'Wartet auf jemanden, der es abholt.'
        : null
      : ichHabeBestaetigt
        ? `Du hast bestätigt. Es fehlt noch ${(istBesitz ? item.claimerName : item.ownerName) ?? 'die andere Seite'}.`
        : andereHatBestaetigt
          ? 'Die andere Seite hat bestätigt — jetzt bist du dran.'
          : `Reserviert von ${(istBesitz ? item.claimerName : item.ownerName) ?? 'jemandem'}.`

  return (
    <Link className="card tight" to={`/markt/${item.id}`}>
      <span className="between" style={{ alignItems: 'flex-start' }}>
        <span className="grow col" style={{ gap: 5, alignItems: 'flex-start' }}>
          <b className="sm">{item.title}</b>
          <span className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            <Label tone="warn">{item.defect}</Label>
            {item.window && <Label>{item.window.label}</Label>}
          </span>
          {hinweis && <span className="xs mut">{hinweis}</span>}
        </span>
        <span className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
          {item.handover.complete ? (
            <Tag von="api" icon>
              übergeben
            </Tag>
          ) : (
            <Label tone={item.status === 'reserved' ? 'warn' : 'plain'}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Label>
          )}
          <Icon name="chevron" size={16} style={{ color: 'var(--ink3)' }} />
        </span>
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------------
   Offering. Tags rather than a free-text field: the list stays
   filterable, and the scan agent has a fixed vocabulary to suggest from.
   ------------------------------------------------------------------ */

function AnbietenSheet({
  katalog,
  position,
  vorgabe,
  onClose,
}: {
  katalog: MarketCatalogue | null
  position: { lat: number; lon: number }
  vorgabe: { titel: string; kategorie: string; defekt: string; photoId: string | null }
  onClose: (neuesAngebot?: string) => void
}) {
  const [titel, setTitel] = useState(vorgabe.titel)
  const [kategorie, setKategorie] = useState(vorgabe.kategorie || 'elektro')
  const [defekt, setDefekt] = useState(vorgabe.defekt)
  const [zustand, setZustand] = useState('')
  const [photoId, setPhotoId] = useState<string | null>(vorgabe.photoId)
  const [ladeFoto, setLadeFoto] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const datei = useRef<HTMLInputElement>(null)

  const defekte = katalog?.defects[kategorie] ?? []

  // A defect belongs to its category — switching category clears a stale tag.
  useEffect(() => {
    if (defekt && defekte.length > 0 && !defekte.includes(defekt)) setDefekt('')
  }, [kategorie, defekte, defekt])

  // The scan agent knows more categories than the market does (Textilien, for
  // one). Anything the market has no bucket for lands in "Sonstiges" rather
  // than in a category nobody selected.
  useEffect(() => {
    if (!katalog) return
    if (!katalog.categories.some((k) => k.id === kategorie)) setKategorie('sonstiges')
  }, [katalog, kategorie])

  async function fotoWaehlen(file: File) {
    setLadeFoto(true)
    setFehler(null)
    try {
      const blob = await downscale(file)
      const form = new FormData()
      form.append('lat', String(position.lat))
      form.append('lon', String(position.lon))
      form.append('file', blob, 'angebot.jpg')
      const res = await api.upload<{ id: string }>('/api/photos', form)
      setPhotoId(res.id)
    } catch (e) {
      setFehler(e instanceof ApiError ? e.message : 'Das Bild ließ sich nicht hochladen.')
    } finally {
      setLadeFoto(false)
    }
  }

  async function abschicken() {
    setSendet(true)
    setFehler(null)
    try {
      const res = await api.post<MarketDetail>('/api/market', {
        title: titel,
        defect: defekt,
        condition: zustand || undefined,
        category: kategorie,
        photoId: photoId ?? undefined,
        lat: position.lat,
        lon: position.lon,
      })
      onClose(res.item.id)
    } catch (e) {
      setFehler(e instanceof ApiError ? e.message : 'Das hat nicht geklappt.')
      setSendet(false)
    }
  }

  const bereit = titel.trim().length >= 2 && defekt !== '' && !sendet

  return (
    <div
      role="dialog"
      aria-label="Etwas anbieten"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(16,32,44,.38)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="sheet"
        style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto' }}
      >
        <div className="grab" style={{ margin: '0 auto 12px' }} />

        <div className="between" style={{ marginBottom: 4 }}>
          <h2 className="h2" style={{ margin: 0 }}>
            Etwas anbieten
          </h2>
          <button className="icobtn bare" onClick={() => onClose()} aria-label="Schließen">
            <Icon name="cross" size={20} />
          </button>
        </div>

        <p className="xs mut" style={{ marginTop: 0, lineHeight: 1.5 }}>
          Kostenlos abzugeben. Gutgeschrieben wird erst, wenn ihr beide die Übergabe bestätigt.
        </p>

        <div className="col" style={{ gap: 14 }}>
          <label className="col" style={{ gap: 6 }}>
            <span className="lbl">Was ist es?</span>
            <input
              className="field"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="Waschmaschine, Bosch"
              maxLength={80}
              autoFocus={titel === ''}
            />
          </label>

          <div className="col" style={{ gap: 6 }}>
            <span className="lbl">Kategorie</span>
            <div className="chips">
              {(katalog?.categories ?? []).map((k) => (
                <button
                  key={k.id}
                  className="chip"
                  aria-pressed={k.id === kategorie}
                  onClick={() => setKategorie(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="col" style={{ gap: 6 }}>
            <span className="lbl">Was fehlt? Ein Tag, kein Aufsatz.</span>
            <div className="chips">
              {defekte.map((d) => (
                <button
                  key={d}
                  className="chip"
                  aria-pressed={d === defekt}
                  onClick={() => setDefekt(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="col" style={{ gap: 6 }}>
            <span className="lbl">
              Zustand <span className="mut">— optional</span>
            </span>
            <div className="chips">
              {(katalog?.conditions ?? []).map((z) => (
                <button
                  key={z}
                  className="chip"
                  aria-pressed={z === zustand}
                  onClick={() => setZustand(z === zustand ? '' : z)}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ gap: 11 }}>
            {photoId ? (
              <img
                src={`/api/photos/${photoId}`}
                alt=""
                style={{ width: 58, height: 58, borderRadius: 13, objectFit: 'cover', flex: 'none' }}
              />
            ) : (
              <Thumb icon="camera" size={58} />
            )}
            <div className="grow col" style={{ gap: 3 }}>
              <b className="sm">{photoId ? 'Foto dabei' : 'Foto dazu'}</b>
              <span className="xs mut">
                {photoId
                  ? 'Wird verkleinert übertragen — ohne EXIF.'
                  : 'Hilft enorm. Optional.'}
              </span>
            </div>
            <button
              className="btn sm"
              disabled={ladeFoto}
              onClick={() => datei.current?.click()}
            >
              {ladeFoto ? <span className="spinner" /> : photoId ? 'Ändern' : 'Wählen'}
            </button>
            <input
              ref={datei}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void fotoWaehlen(f)
                e.target.value = ''
              }}
            />
          </div>

          {fehler && (
            <p className="xs" style={{ color: 'var(--alert)', margin: 0 }}>
              {fehler}
            </p>
          )}

          <button className="btn primary" disabled={!bereit} onClick={() => void abschicken()}>
            {sendet ? <span className="spinner" /> : 'Kostenlos anbieten'}
          </button>
        </div>
      </div>
    </div>
  )
}
