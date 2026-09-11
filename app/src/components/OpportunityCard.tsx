import type { Opportunity } from '../screens/Discover'

interface Props {
  opportunity: Opportunity
  onSelect: (opportunity: Opportunity) => void
}

function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))} min`
  return `${hours.toFixed(1)} h`
}

export default function OpportunityCard({ opportunity: o, onSelect }: Props) {
  const negative = o.impact.netCo2 <= 0

  return (
    <button className="opp" onClick={() => onSelect(o)}>
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{o.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`tag ${o.kind === 'basket' ? 'basket' : o.kind === 'business' ? 'biz' : ''}`}>
              {o.kindLabel}
            </span>
            {o.isOwn && <span className="tag">your basket</span>}
            {o.hoursUntilExpiry !== null && o.hoursUntilExpiry < 6 && (
              <span className="tag basket">expires in {hoursLabel(o.hoursUntilExpiry)}</span>
            )}
            {o.needsVerification && <span className="tag biz">verification required</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`net ${negative ? 'neg' : 'pos'}`}>
            {negative ? '' : '+'}
            {o.impact.netCo2.toFixed(2)}
          </div>
          <div className="tiny muted">kg CO₂e net</div>
        </div>
      </div>
      <div className="meta">
        <span>
          {o.impact.marginal
            ? `+${Math.round(o.impact.detourMinutes ?? 0)} min detour`
            : `${o.distanceKm.toFixed(1)} km away`}
        </span>
        <span className="pv pv-est">estimate</span>
      </div>
    </button>
  )
}
