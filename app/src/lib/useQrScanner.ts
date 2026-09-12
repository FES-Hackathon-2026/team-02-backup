import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A camera that watches for a QR code.
 *
 * Two decoders, because one is not enough. `BarcodeDetector` is native, fast
 * and free — and absent on iOS Safari, which is most of a Frankfurt demo.
 * jsQR is the fallback: ten kilobytes of JavaScript, no wasm, works
 * everywhere, and costs a canvas readback per frame. We try the native one
 * and quietly fall back, because the person holding the phone should not have
 * to know which browser they picked.
 *
 * What this hook deliberately does NOT do is decide what the code *means*.
 * It hands back the raw decoded string. Vytal has many legacy code formats in
 * circulation and their documentation is explicit that validation belongs in
 * the backend — a regex here would be a guess that fails on exactly the old
 * containers that are most likely to be lying around.
 */

export type ScannerState = 'idle' | 'startet' | 'an' | 'fehlt' | 'unsicher' | 'blockiert'

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

/** How often we look at a frame. Fast enough to feel instant, cheap enough. */
const SCAN_INTERVAL_MS = 180

export function useQrScanner(active: boolean, onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  /** The callback, kept fresh without restarting the camera on every render. */
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  const [state, setState] = useState<ScannerState>('idle')
  const [hatLampe, setHatLampe] = useState(false)
  const [lampe, setLampe] = useState(false)
  const [nativ, setNativ] = useState<boolean | null>(null)

  /* The camera. Stopped on leave — an orphaned stream keeps the recording
     light on, which looks exactly as alarming as it sounds. */
  useEffect(() => {
    if (!active) {
      setState('idle')
      return
    }

    let stream: MediaStream | null = null
    let abgebrochen = false

    if (!navigator.mediaDevices?.getUserMedia) {
      setState(window.isSecureContext ? 'fehlt' : 'unsicher')
      return
    }

    setState('startet')
    setHatLampe(false)
    setLampe(false)

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
        setHatLampe(Boolean(caps?.torch))
        setState('an')
      })
      .catch((error: unknown) => {
        if (abgebrochen) return
        // DOMException names are the only reliable signal getUserMedia gives.
        const name = error instanceof DOMException ? error.name : ''
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'blockiert' : 'fehlt')
      })

    return () => {
      abgebrochen = true
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
  }, [active])

  /* The decode loop. */
  useEffect(() => {
    if (!active || state !== 'an') return

    let stopped = false
    let timer: number | undefined

    const setupDetector = async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike })
        .BarcodeDetector
      if (!Ctor) {
        setNativ(false)
        return
      }
      try {
        detectorRef.current = new Ctor({ formats: ['qr_code'] })
        setNativ(true)
      } catch {
        setNativ(false)
      }
    }

    const tick = async () => {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const code = detectorRef.current
            ? (await detectorRef.current.detect(video))[0]?.rawValue
            : decodeWithJsQr(video, canvasRef)
          // Raw and unparsed — the server decides whether this is a container.
          if (code) onCodeRef.current(code)
        } catch {
          // A single bad frame is not worth a state change; the next one is
          // 180 ms away. A detector that throws every time falls back below.
          if (detectorRef.current) {
            detectorRef.current = null
            setNativ(false)
          }
        }
      }
      if (!stopped) timer = window.setTimeout(tick, SCAN_INTERVAL_MS)
    }

    void setupDetector().then(tick)

    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [active, state])

  const toggleLampe = useCallback(async () => {
    const track = trackRef.current
    if (!track) return
    const next = !lampe
    try {
      // `torch` is an image-capture constraint that every browser with a torch
      // supports but no lib.dom typing knows about, hence the cast. A device
      // that rejects it loses the button rather than the camera.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      setLampe(next)
    } catch {
      setHatLampe(false)
    }
  }, [lampe])

  return { videoRef, canvasRef, state, hatLampe, lampe, toggleLampe, nativ }
}

/** jsQR wants pixels, so the frame goes through a canvas first. */
function decodeWithJsQr(
  video: HTMLVideoElement,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
): string | undefined {
  const canvas = canvasRef.current
  if (!canvas) return undefined

  // Downscale: a QR fills a good part of the frame, and quartering the pixels
  // quarters the work on the phones that need this path most.
  const scale = Math.min(1, 640 / video.videoWidth)
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(video, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  return jsQR(image.data, w, h, { inversionAttempts: 'dontInvert' })?.data
}
