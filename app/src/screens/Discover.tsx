import { useCallback, useEffect, useState } from 'react'

import OpportunityCard from '../components/OpportunityCard'
import { listBusinesses, listFoodSharePoints, listNearbyBaskets } from '../lib/api'
import {
  calcImpact,
  haversineKm,
  relevanceScore,
  TRAVEL_MODES,
  type Impact,
  type LatLon,
  type TravelMode,
} from '../lib/impact'
import type { User } from '../lib/types'

/**
 * Areas to search from. Real geolocation needs a secure context, which a LAN IP
 * during development does not provide — and for a demo, jumping between areas
 * by tap is faster anyway. GPS can be layered on later via navigator.geolocation.
 */
const AREAS: { label: string; lat: number; lon: number }[] = [
  { label: 'Hauptwache', lat: 50.113973, lon: 8.678782 },
  { label: 'Hauptbahnhof', lat: 50.106732, lon: 8.663031 },
  { label: 'Bockenheim', lat: 50.124, lon: 8.6394 },
  { label: 'Sachsenhausen', lat: 50.099451, lon: 8.685723 },
  { label: 'Bornheim', lat: 50.1264, lon: 8.706 },
]

const MODE_LABELS: Record<TravelMode, string> = {
  walk: '🚶 on foot',
  bike: '🚲 bike',
  transit: '🚇 transit',
  car: '🚗 car',
}

/** Default assumed amount per source type, in kg. User-adjustable later. */
const DEFAULT_KG = { food_share_point: 1.5, basket: 2, business: 4 } as const

export interface Opportunity {
  id: string
  kind: 'food_share_point' | 'basket' | 'business'
  kindLabel: string
  name: string
  lat: number
  lon: number
  distanceKm: number
  impact: Impact
  score: number
  hoursUntilExpiry: number | null
  isOwn: boolean
  needsVerification: boolean
  /** the raw id on the API side */
  sourceId: number
}

interface Props {
  user: User | null
  onSelect: (opportunity: Opportunity) => void
}

export default function Discover({ user, onSelect }: Props) {
  const [area, setArea] = useState(AREAS[0])
  const [mode, setMode] = useState<TravelMode>('transit')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const origin: LatLon = { lat: area.lat, lon: area.lon }
    const [points, baskets, businesses] = await Promise.all([
      listFoodSharePoints(),
      listNearbyBaskets(area.lat, area.lon, 30),
      listBusinesses(),
    ])

    const firstError = points.error ?? baskets.error ?? businesses.error
    if (firstError) setError(firstError)

    const verified = user?.verification.is_verified ?? false
    const built: Opportunity[] = []

    for (const p of points.data ?? []) {
      const distanceKm = haversineKm(origin, p)
      built.push({
        id: `fsp-${p.id}`,
        kind: 'food_share_point',
        kindLabel: 'Food share point',
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        distanceKm,
        impact: calcImpact({ kg: DEFAULT_KG.food_share_point, mode, distanceKm }),
        score: 0,
        hoursUntilExpiry: null,
        isOwn: false,
        needsVerification: false,
        sourceId: p.id,
      })
    }

    for (const b of baskets.data ?? []) {
      const distanceKm = haversineKm(origin, b)
      built.push({
        id: `basket-${b.id}`,
        kind: 'basket',
        kindLabel: 'Basket',
        name: b.title,
        lat: b.lat,
        lon: b.lon,
        distanceKm,
        impact: calcImpact({ kg: DEFAULT_KG.basket, mode, distanceKm }),
        score: 0,
        hoursUntilExpiry: (new Date(b.expires_at).getTime() - Date.now()) / 3_600_000,
        isOwn: b.created_by_user_id === user?.id,
        needsVerification: false,
        sourceId: b.id,
      })
    }

    for (const biz of businesses.data ?? []) {
      const distanceKm = haversineKm(origin, biz)
      built.push({
        id: `business-${biz.id}`,
        kind: 'business',
        kindLabel: 'Business',
        name: biz.name,
        lat: biz.lat,
        lon: biz.lon,
        distanceKm,
        impact: calcImpact({ kg: DEFAULT_KG.business, mode, distanceKm }),
        score: 0,
        hoursUntilExpiry: null,
        isOwn: false,
        needsVerification: !verified,
        sourceId: biz.id,
      })
    }

    const speed = TRAVEL_MODES[mode].speedKmh
    for (const o of built) {
      o.score = relevanceScore({
        netCo2: o.impact.netCo2,
        effortMinutes: (o.distanceKm / speed) * 60,
        hoursUntilExpiry: o.hoursUntilExpiry,
        isOwn: o.isOwn,
        needsVerificationButUnverified: o.needsVerification,
      })
    }
    built.sort((a, b) => b.score - a.score)

    setOpportunities(built)
    setLoading(false)
  }, [area, mode, user])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="screen" id="panel-discover" role="tabpanel">
      <h2>Search area</h2>
      <div className="chips">
        {AREAS.map((a) => (
          <button
            key={a.label}
            className="chip"
            aria-pressed={a.label === area.label}
            onClick={() => setArea(a)}
          >
            📍 {a.label}
          </button>
        ))}
      </div>

      <h2>How are you getting there?</h2>
      <div className="chips">
        {(Object.keys(MODE_LABELS) as TravelMode[]).map((m) => (
          <button key={m} className="chip" aria-pressed={m === mode} onClick={() => setMode(m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <h2>
        Opportunities{' '}
        <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
          — by relevance
        </span>
      </h2>

      {error && (
        <div className="card" style={{ background: 'var(--bad-soft)', borderColor: 'transparent' }}>
          <b className="small">Could not load everything</b>
          <div className="tiny" style={{ marginTop: 4 }}>
            {error}
          </div>
        </div>
      )}

      {loading && (
        <div className="empty">
          <span className="spinner" /> Loading from the API…
        </div>
      )}

      {!loading && opportunities.length === 0 && !error && (
        <div className="empty">Nothing found in this area.</div>
      )}

      {!loading &&
        opportunities
          .slice(0, 15)
          .map((o) => <OpportunityCard key={o.id} opportunity={o} onSelect={onSelect} />)}

      {/* TODO(#2): "on my way" mode — pick two traffiQ stops, rank by detour
          minutes instead of distance, and charge only the detour as emissions.
          The maths is already in lib/impact.ts (detourKm + calcImpact). */}
    </div>
  )
}
