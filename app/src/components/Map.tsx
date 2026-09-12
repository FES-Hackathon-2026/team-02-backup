import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * The one map in the product: Leaflet on OpenStreetMap raster tiles.
 *
 * Why these tiles and not a prettier basemap: they need no key. A demo that
 * dies because a token expired, or because someone's free tier ran out on
 * the morning of the jury, is not a demo. The same argument runs through the
 * rest of this app — the places on this map are real OSM records that were
 * pulled once and seeded, so the map works with the network off as soon as
 * the tiles are in the browser cache.
 *
 * Attribution is not decoration and is never hidden: OSM data is ODbL, and
 * the credit is the licence condition. Leaflet's own control renders it
 * bottom-right and this component never turns it off.
 *
 * Markers are `divIcon`s, so there is no image asset to bundle and no
 * broken-pin-icon problem, and every colour comes from tokens.css.
 */

export interface MapMarker {
  id: string
  lat: number
  lon: number
  /** short text inside the pin — usually the XP bounty */
  badge?: string
  label?: string
  tone?: 'open' | 'claimed' | 'done'
}

interface Props {
  ariaLabel?: string
  centre: { lat: number; lon: number }
  markers: MapMarker[]
  /** the device's own position, drawn as a dot rather than a pin */
  me?: { lat: number; lon: number } | null
  /** draws the filter radius, so "30 km" is a thing you can see */
  radiusKm?: number
  selectedId?: string | null
  onSelect?: (id: string) => void
  fitMarkers?: boolean
  height?: number
  /** a still map for a detail screen: no dragging, no zooming */
  still?: boolean
  zoom?: number
}

/**
 * A design token, resolved to the value it currently holds.
 *
 * Leaflet writes vector colours into SVG presentation attributes, and
 * `var(--blue-deep)` is not reliably substituted there the way it is in an
 * inline style. Reading the computed value keeps the map on the palette in
 * tokens.css without any colour being written down a second time.
 */
const token = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

const TONE: Record<NonNullable<MapMarker['tone']>, { bg: string; fg: string }> = {
  open: { bg: 'var(--blue-deep)', fg: '#fff' },
  claimed: { bg: 'var(--stone)', fg: '#fff' },
  done: { bg: 'var(--gold)', fg: 'var(--gold-ink)' },
}

function pin(marker: MapMarker, selected: boolean) {
  const tone = TONE[marker.tone ?? 'open']
  const size = selected ? 40 : 34
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50% 50% 50% 6px;
      transform:rotate(45deg);
      background:${tone.bg};color:${tone.fg};
      border:2px solid var(--card);
      box-shadow:0 2px 8px rgba(16,32,44,.35);
      font:600 ${selected ? 12 : 11}px/1 'Schibsted Grotesk',system-ui,sans-serif;
      "><span style="transform:rotate(-45deg);white-space:nowrap">${
        marker.badge ?? ''
      }</span></span>`,
  })
}

export default function Map({
  centre,
  markers,
  me = null,
  radiusKm,
  selectedId = null,
  onSelect,
  fitMarkers = false,
  height = 240,
  still = false,
  zoom = 13,
  ariaLabel = 'Karte mit den offenen Quests',
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const meLayer = useRef<L.LayerGroup | null>(null)
  const pick = useRef(onSelect)
  pick.current = onSelect

  /* The map itself, created once. Leaflet is imperative and outlives React's
     render cycle, so everything below updates it rather than rebuilding it. */
  useEffect(() => {
    if (!box.current || map.current) return

    const instance = L.map(box.current, {
      center: [centre.lat, centre.lon],
      zoom,
      zoomControl: !still,
      dragging: !still,
      scrollWheelZoom: false,
      doubleClickZoom: !still,
      touchZoom: !still,
      keyboard: !still,
      attributionControl: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // The licence condition, not a footer decoration.
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(instance)

    layer.current = L.layerGroup().addTo(instance)
    meLayer.current = L.layerGroup().addTo(instance)
    map.current = instance

    // The container is often laid out after this runs (a card that was still
    // collapsing in). Without this the tiles come back grey.
    setTimeout(() => instance.invalidateSize(), 60)

    return () => {
      instance.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Follow the centre while nothing is selected. */
  useEffect(() => {
    if (!map.current || selectedId) return
    map.current.setView([centre.lat, centre.lon], map.current.getZoom(), { animate: false })
  }, [centre.lat, centre.lon, selectedId])

  const boundsKey = markers.map(m => `${m.id}:${m.lat}:${m.lon}`).join('|')
  useEffect(() => {
    if (!fitMarkers || !map.current || selectedId || markers.length === 0) return
    const points: L.LatLngTuple[] = markers.map(m => [m.lat, m.lon])
    if (me) points.push([me.lat, me.lon])
    map.current.fitBounds(points, { padding: [30, 30], maxZoom: 14, animate: false })
  }, [fitMarkers, boundsKey, selectedId, me?.lat, me?.lon])

  /** The pins. */
  useEffect(() => {
    const group = layer.current
    if (!group) return
    group.clearLayers()

    for (const marker of markers) {
      const selected = marker.id === selectedId
      L.marker([marker.lat, marker.lon], {
        icon: pin(marker, selected),
        title: marker.label,
        zIndexOffset: selected ? 1000 : 0,
        keyboard: true,
        alt: marker.label ?? 'Quest',
      })
        .on('click', () => pick.current?.(marker.id))
        .addTo(group)
    }
  }, [markers, selectedId])

  /** The device's position and the radius it filters by. */
  useEffect(() => {
    const group = meLayer.current
    if (!group) return
    group.clearLayers()
    if (!me) return

    if (radiusKm !== undefined) {
      L.circle([me.lat, me.lon], {
        radius: radiusKm * 1000,
        color: token('--blue-deep', '#1f5c82'),
        weight: 1,
        opacity: 0.5,
        fillColor: token('--blue', '#7fa8c4'),
        fillOpacity: 0.06,
      }).addTo(group)
    }

    L.circleMarker([me.lat, me.lon], {
      radius: 6,
      color: token('--card', '#ffffff'),
      weight: 2,
      fillColor: token('--blue-deep', '#1f5c82'),
      fillOpacity: 1,
    })
      .bindTooltip('Dein Standort', { direction: 'top' })
      .addTo(group)
  }, [me?.lat, me?.lon, radiusKm])

  /** Bring a selected pin into view without changing the zoom under the thumb. */
  useEffect(() => {
    if (!map.current || !selectedId) return
    const marker = markers.find((m) => m.id === selectedId)
    if (marker) map.current.panTo([marker.lat, marker.lon], { animate: true })
  }, [selectedId, markers])

  return (
    <div
      ref={box}
      role="application"
      aria-label={ariaLabel}
      style={{
        height,
        width: '100%',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
        border: '1px solid var(--line)',
        background: 'var(--sky2)',
        zIndex: 0,
      }}
    />
  )
}
