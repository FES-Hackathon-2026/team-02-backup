import { t, getLocale } from './../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import Icon from '../components/Icon'
import { api, ApiError, type ScanMode, type ScanResult } from '../lib/client'
import { de } from '../lib/de'

/**
 * The three pills are a ROUTING choice, not a hint about the object: the
 * mode decides what the result becomes before the shutter is pressed.
 * Sperrmüll is the only one where the route is computed — from volume and
 * reusability — so its framing tip is the one that has to get the whole pile
 * into the picture. Fundstück always becomes a Quest, Wissen always the
 * disposal rule, and their tips can ask for a tighter frame instead.
 */
const MODI = [
  { id: 'sperrmuell', label: 'Sperrmüll', hint: 'Alles ins Bild, was mit weg soll — auch Kleinteile' },
  { id: 'fundstueck', label: 'Fundstück melden', hint: 'Fundstück mit etwas Umgebung aufnehmen' },
  { id: 'wissen', label: 'Was ist das?', hint: 'Objekt möglichst formatfüllend aufnehmen' },
] as const

const RULE = '3px solid #fff'
const CORNER = { position: 'absolute', width: 38, height: 38 } as const

/** The downscale budget. Below this the upload is quick even on 3G. */
const MAX_EDGE = 1280
const MAX_BYTES = 180_000

/* ------------------------------------------------------------------
   Downscaling happens here, on the device, and it is not only about
   bandwidth: re-encoding through a canvas is what actually drops the
   EXIF block, including the GPS tag and the camera serial. Position and
   capture time are then sent as explicit fields the person agreed to,
   which is a promise the app can keep and show.
   ------------------------------------------------------------------ */
type Ausschnitt = { x: number; y: number; w: number; h: number }

/**
 * What the preview shows is what gets sent.
 *
 * The <video> is painted with object-fit: cover, so the sensor frame is
 * wider or taller than the phone screen and the overflow is hidden. Drawing
 * the whole frame to the canvas would upload the parts the person never saw —
 * including whatever stood just outside the shot. This returns the source
 * rectangle that is actually on screen, so the capture matches the framing.
 */
function sichtbarerAusschnitt(video: HTMLVideoElement): Ausschnitt {
  const sw = video.videoWidth
  const sh = video.videoHeight
  const bw = video.clientWidth
  const bh = video.clientHeight
  if (!bw || !bh) return { x: 0, y: 0, w: sw, h: sh }

  // cover scales by the LARGER ratio; the axis that overflows gets trimmed.
  const scale = Math.max(bw / sw, bh / sh)
  const w = Math.min(sw, bw / scale)
  const h = Math.min(sh, bh / scale)
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h }
}

async function verkleinern(
  source: HTMLVideoElement | HTMLImageElement,
  ausschnitt?: Ausschnitt,
): Promise<Blob> {
  const voll = source instanceof HTMLVideoElement
    ? { x: 0, y: 0, w: source.videoWidth, h: source.videoHeight }
    : { x: 0, y: 0, w: source.naturalWidth, h: source.naturalHeight }
  const src = ausschnitt ?? voll
  const sw = Math.round(src.w)
  const sh = Math.round(src.h)
  if (!sw || !sh) throw new Error('Das Bild ist leer.')

  const draw = (edge: number) => {
    const scale = Math.min(1, edge / Math.max(sw, sh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw * scale)
    canvas.height = Math.round(sh * scale)
    canvas
      .getContext('2d')
      ?.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  const encode = (canvas: HTMLCanvasElement, quality: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild ließ sich nicht speichern.'))),
        'image/jpeg',
        quality,
      ),
    )

  // Quality first, size second: a slightly softer JPEG classifies just as
  // well as a smaller one, and it keeps the framing the person chose.
  for (const edge of [MAX_EDGE, 1024]) {
    const canvas = draw(edge)
    for (const quality of [0.82, 0.7, 0.6, 0.5]) {
      const blob = await encode(canvas, quality)
      if (blob.size <= MAX_BYTES) return blob
    }
  }
  return encode(draw(800), 0.5)
}

function bildAusDatei(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Diese Datei ist kein Bild.'))
    }
    img.src = url
  })
}

type Phase = 'live' | 'busy' | 'error'

/**
 * Why there is no live picture. "Keine Kamera" and "du hast Nein gesagt" need
 * different sentences, because they need different things from the person —
 * one is a browser setting, the other is a missing device.
 */
type KameraLage = 'startet' | 'an' | 'verweigert' | 'fehlt' | 'belegt' | 'unsicher'

const KAMERA_TEXT: Record<Exclude<KameraLage, 'an' | 'startet'>, string> = {
  verweigert:
    'Kamerazugriff abgelehnt. Du kannst ihn im Schloss-Symbol der Adressleiste wieder erlauben — oder unten ein Foto aufnehmen.',
  fehlt: 'Keine Kamera gefunden. Der Auslöser öffnet die Kamera-App oder die Galerie.',
  belegt: 'Die Kamera ist gerade von einer anderen App belegt. Schließ sie und tipp auf „Nochmal".',
  unsicher:
    'Live-Kamera braucht HTTPS. Über diese Adresse geht nur die Kamera-App — der Auslöser öffnet sie.',
}

/** DOMException names are the only reliable signal getUserMedia gives us. */
function lageAusFehler(err: unknown): KameraLage {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'verweigert'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'fehlt'
  if (name === 'NotReadableError' || name === 'AbortError') return 'belegt'
  return 'fehlt'
}

/**
 * The camera screen. Full-bleed and dark, so it deliberately does NOT use
 * the Screen shell — it has its own chrome.
 *
 * One tap does three things: capture, upload, classify. The result screen
 * is reached with the answer already in hand, so the person never waits on
 * a second screen.
 */
export default function Scan() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const kameraRef = useRef<HTMLInputElement>(null)
  const galerieRef = useRef<HTMLInputElement>(null)
  const ortRef = useRef<{ lat: number; lon: number } | null>(null)

  const trackRef = useRef<MediaStreamTrack | null>(null)

  const [modus, setModus] = useState<ScanMode>(MODI[0].id)
  const [phase, setPhase] = useState<Phase>('live')
  const [lage, setLage] = useState<KameraLage>('startet')
  const [versuch, setVersuch] = useState(0)
  const [lampe, setLampe] = useState(false)
  const [hatLampe, setHatLampe] = useState(false)
  const kamera = lage === 'an' ? 'an' : 'aus'
  const [vorschau, setVorschau] = useState<string | null>(null)
  const [dauer, setDauer] = useState(0)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState(false)
  const [ortDa, setOrtDa] = useState(false)

  /* Camera. Restarted on a retry, stopped on leave —
     an orphaned stream keeps the recording light on. */
  useEffect(() => {
    let stream: MediaStream | null = null
    let abgebrochen = false

    // No mediaDevices means an insecure origin (plain http on a LAN address)
    // or an old browser. The file input below still opens the camera app.
    if (!navigator.mediaDevices?.getUserMedia) {
      setLage(window.isSecureContext ? 'fehlt' : 'unsicher')
      return
    }

    setLage('startet')
    setHatLampe(false)
    setLampe(false)

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // A hint, not a demand: a phone that cannot do this still starts,
          // and the capture is downscaled afterwards anyway.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (abgebrochen) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const track = s.getVideoTracks()[0] ?? null
        trackRef.current = track
        if (videoRef.current) {
          videoRef.current.srcObject = s
          void videoRef.current.play()
        }
        // The torch lives on the track, and only some back cameras have one.
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
        setHatLampe(Boolean(caps?.torch))
        setLage('an')
      })
      .catch((err: unknown) => setLage(lageAusFehler(err)))

    return () => {
      abgebrochen = true
      trackRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [versuch])

  /* The torch is a constraint on the live track, so it is applied here rather
     than at capture time — the person sees it come on before they shoot. */
  useEffect(() => {
    const track = trackRef.current
    if (!track || !hatLampe) return
    // `torch` is an image-capture constraint that every browser with a torch
    // supports but no lib.dom typing knows about, hence the cast. A device
    // that rejects it loses the button rather than the camera.
    void track
      .applyConstraints({ advanced: [{ torch: lampe }] } as unknown as MediaTrackConstraints)
      .catch(() => setHatLampe(false))
  }, [lampe, hatLampe])

  /* Position, asked for once and never waited on. If it arrives, it travels
     with the photo; if it does not, the scan works without it. */
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        ortRef.current = { lat: p.coords.latitude, lon: p.coords.longitude }
        setOrtDa(true)
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  /* The elapsed counter. Six seconds is the promise, so the promise is on
     screen while it is being kept. */
  useEffect(() => {
    if (phase !== 'busy') return
    const start = Date.now()
    const timer = setInterval(() => setDauer((Date.now() - start) / 1000), 100)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => () => void (vorschau && URL.revokeObjectURL(vorschau)), [vorschau])

  async function erkennen(blob: Blob) {
    setPhase('busy')
    setFehler(null)
    setDauer(0)
    setVorschau((alt) => {
      if (alt) URL.revokeObjectURL(alt)
      return URL.createObjectURL(blob)
    })

    try {
      const ort = ortRef.current
      const form = new FormData()
      // Scalars before the file: they are then parsed by the time the
      // server has the buffer, whatever the multipart implementation does.
      if (ort) {
        form.append('lat', String(ort.lat))
        form.append('lon', String(ort.lon))
      }
      form.append('takenAt', new Date().toISOString())
      form.append('file', blob, 'scan.jpg')

      const { id } = await api.upload<{ id: string }>('/api/photos', form)
      const ergebnis = await api.post<ScanResult>('/api/scan', {
        photoId: id,
        mode: modus,
        lat: ort?.lat,
        lon: ort?.lon,
      })

      // The answer travels with the navigation, so the result screen paints
      // immediately; it can refetch from /api/scan/:photoId on a reload.
      navigate(params.get('pickupCart') === '1' && !ergebnis.hazard ? `/abholung?photo=${encodeURIComponent(id)}` : `/erkannt/${id}`, { state: { scan: ergebnis } })
    } catch (err) {
      setFehler(
        err instanceof ApiError
          ? err.message
          : 'Die Erkennung hat nicht geklappt. Versuch es noch einmal.',
      )
      setPhase('error')
    }
  }

  async function ausloesen() {
    if (phase === 'busy') return
    // No live picture: hand over to the OS camera app rather than to nothing.
    if (kamera !== 'an' || !videoRef.current) {
      kameraRef.current?.click()
      return
    }
    try {
      const video = videoRef.current
      // Only what the preview actually showed — see sichtbarerAusschnitt.
      const blob = await verkleinern(video, sichtbarerAusschnitt(video))
      await erkennen(blob)
    } catch {
      setFehler('Der Auslöser hat kein Bild bekommen. Nimm ein Foto aus der Galerie.')
      setPhase('error')
    }
  }

  async function ausDatei(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const img = await bildAusDatei(file)
      const blob = await verkleinern(img)
      await erkennen(blob)
    } catch {
      setFehler('Diese Datei ließ sich nicht lesen.')
      setPhase('error')
    }
  }

  const glas = {
    background: 'rgba(9,16,22,.5)',
    borderColor: 'rgba(255,255,255,.16)',
    color: '#fff',
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        position: 'relative',
        background: '#0b131a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 90% at 50% 24%, #1e2f3c 0%, #111c25 58%, #080f15 100%)',
        }}
      />

      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: kamera === 'an' && phase !== 'busy' ? 1 : 0,
          transition: 'opacity .25s',
        }}
      />

      {/* The frame that was just sent, held on screen while the agent looks
          at it — the person keeps seeing what they are waiting on. */}
      {t(vorschau && phase !== 'live' && (
        <img
          src={vorschau}
          alt={t("")}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: phase === 'busy' ? 'brightness(.55)' : 'brightness(.4)',
          }}
        />
      ))}

      <header
        className="nav"
        style={{ background: 'transparent', position: 'relative', zIndex: 2 }}
      >
        <button
          className="icobtn"
          onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')}
          aria-label={t(de.action.close)}
          style={glas}
        >
          <Icon name="cross" size={21} />
        </button>
        <div className="grow" />
        <button
          className="icobtn"
          aria-label={t("Hinweise")}
          aria-pressed={hinweis}
          onClick={() => setHinweis((h) => !h)}
          style={glas}
        >
          <Icon name="info" size={21} />
        </button>
      </header>

      {t(hinweis && (
        <div
          style={{
            position: 'relative',
            zIndex: 3,
            margin: '0 18px',
            padding: '13px 15px',
            borderRadius: 15,
            background: 'rgba(9,16,22,.82)',
            border: '1px solid rgba(255,255,255,.16)',
            fontSize: 14,
            lineHeight: 1.5,
            color: '#dce9f2',
          }}
        >
          <b>{t("Was mit dem Foto passiert.")}</b> {t(" Es wird auf dem Gerät verkleinert — dabei fallen die Kameradaten weg — und zur Erkennung an den ReMain-Server geschickt. Der Standort geht nur mit, wenn du ihn freigegeben hast. Die Einschätzung ist eine Schätzung, keine Zusage: du entscheidest danach, was daraus wird.")}</div>
      ))}

      {/* framing corners */}
      <div style={{ position: 'absolute', left: 40, right: 40, top: 132, height: 316, zIndex: 2 }}>
        <span style={{ ...CORNER, top: 0, left: 0, borderTop: RULE, borderLeft: RULE, borderRadius: '14px 0 0 0' }} />
        <span style={{ ...CORNER, top: 0, right: 0, borderTop: RULE, borderRight: RULE, borderRadius: '0 14px 0 0' }} />
        <span style={{ ...CORNER, bottom: 0, left: 0, borderBottom: RULE, borderLeft: RULE, borderRadius: '0 0 0 14px' }} />
        <span style={{ ...CORNER, bottom: 0, right: 0, borderBottom: RULE, borderRight: RULE, borderRadius: '0 0 14px 0' }} />
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          position: 'relative',
          zIndex: 3,
          padding: '52px 18px calc(26px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background:
            'linear-gradient(180deg, rgba(8,15,21,0) 0%, rgba(8,15,21,.88) 34%)',
        }}
      >
        <div
          className="row"
          style={{
            justifyContent: 'center',
            gap: 7,
            color: '#c6dae8',
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {t(phase === 'busy' ? (
            <>
              <span className="spinner" style={{ borderColor: 'rgba(255,255,255,.25)', borderTopColor: '#fff' }} />
              {t("Der Agent schaut sich das an … ")}{t(dauer.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} {t(" s")}</>
          ) : phase === 'error' ? (
            <span style={{ color: '#ffd9d2' }}>{t(fehler)}</span>
          ) : (
            <>
              <Icon name="spark" size={16} stroke={1.9} />
              {t(MODI.find((m) => m.id === modus)?.hint)}
            </>
          ))}
        </div>

        <div className="chips" style={{ justifyContent: 'center' }}>
          {t(MODI.map((m) => (
            <button
              key={m.id}
              className="chip"
              aria-pressed={m.id === modus}
              disabled={phase === 'busy'}
              onClick={() => setModus(m.id)}
              style={
                m.id === modus
                  ? undefined
                  : {
                      background: 'rgba(255,255,255,.10)',
                      borderColor: 'rgba(255,255,255,.2)',
                      color: '#dce9f2',
                    }
              }
            >
              {t(m.label)}
            </button>
          )))}
        </div>

        <div className="between" style={{ padding: '0 18px' }}>
          <button
            onClick={() => galerieRef.current?.click()}
            disabled={phase === 'busy'}
            aria-label={t("Foto aus der Galerie")}
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              border: 'none',
              background: 'rgba(255,255,255,.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dce9f2',
              padding: 0,
            }}
          >
            <Icon name="market" size={21} />
          </button>

          <button
            aria-label={t(phase === 'error' ? de.action.retry : 'Auslöser')}
            onClick={() => void ausloesen()}
            disabled={phase === 'busy'}
            style={{
              width: 74,
              height: 74,
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,.32)',
              background: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <span
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: '#fff',
                opacity: phase === 'busy' ? 0.35 : 1,
                transition: 'opacity .2s',
              }}
            />
          </button>

          {/* Torch where the device has one, an empty slot where it does not —
              one slot, so the shutter stays centred either way. */}
          {t(hatLampe ? (
            <button
              onClick={() => setLampe((l) => !l)}
              disabled={phase === 'busy'}
              aria-label={t("Licht")}
              aria-pressed={lampe}
              style={{
                width: 46,
                height: 46,
                borderRadius: 13,
                border: 'none',
                background: lampe ? '#fff' : 'rgba(255,255,255,.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: lampe ? '#0b131a' : '#dce9f2',
                padding: 0,
              }}
            >
              <Icon name="spark" size={21} />
            </button>
          ) : (
            <span style={{ width: 46, height: 46 }} aria-hidden="true" />
          ))}
        </div>

        {/* The camera's own state, said plainly. Each reason needs a different
            thing from the person, so each one gets its own sentence — and the
            two that a retry can actually fix get a button. */}
        <div className="xs" style={{ textAlign: 'center', color: '#8499a8' }}>
          {t(lage === 'an' ? (
            ortDa
              ? 'Foto und Standort gehen zur Erkennung an den Server.'
              : 'Das Foto geht zur Erkennung an den Server — ohne Standort.'
          ) : lage === 'startet' ? (
            'Kamera startet …'
          ) : (
            <>
              {t(KAMERA_TEXT[lage])}
              {t((lage === 'belegt' || lage === 'verweigert') && (
                <button
                  onClick={() => setVersuch((v) => v + 1)}
                  style={{
                    marginLeft: 6,
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    font: 'inherit',
                    fontWeight: 700,
                    color: '#dce9f2',
                    textDecoration: 'underline',
                  }}
                >
                  {t("Nochmal")}</button>
              ))}
            </>
          ))}
        </div>
      </div>

      {/* Two inputs, because `capture` is not a preference but a command:
          with it the OS opens the camera app and the gallery is unreachable.
          One input for each intent is the only way to offer both. */}
      <input
        ref={kameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void ausDatei(e)}
        style={{ display: 'none' }}
      />
      <input
        ref={galerieRef}
        type="file"
        accept="image/*"
        onChange={(e) => void ausDatei(e)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
