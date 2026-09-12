import { t, getLocale } from './../lib/i18n'
import type { Opportunity } from '../screens/Discover'

interface Props {
  opportunity: Opportunity
  onSelect: (opportunity: Opportunity) => void
}

function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))} min`
  return `${hours.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`
}

export default function OpportunityCard({ opportunity: o, onSelect }: Props) {
  const negative = o.impact.netCo2 <= 0

  return (
    <button className="opp" onClick={() => onSelect(o)}>
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{t(o.name)}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`tag ${o.kind === 'basket' ? 'basket' : o.kind === 'business' ? 'biz' : ''}`}>
              {t(o.kindLabel)}
            </span>
            {t(o.isOwn && <span className="tag">{t("your basket")}</span>)}
            {t(o.hoursUntilExpiry !== null && o.hoursUntilExpiry < 6 && (
              <span className="tag basket">{t("expires in ")}{t(hoursLabel(o.hoursUntilExpiry))}</span>
            ))}
            {t(o.needsVerification && <span className="tag biz">{t("verification required")}</span>)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`net ${negative ? 'neg' : 'pos'}`}>
            {t(negative ? '' : '+')}
            {t(o.impact.netCo2.toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          </div>
          <div className="tiny muted">{t("kg CO₂e net")}</div>
        </div>
      </div>
      <div className="meta">
        <span>
          {t(o.impact.marginal
            ? `+${Math.round(o.impact.detourMinutes ?? 0)} min detour`
            : `${o.distanceKm.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km away`)}
        </span>
        <span className="pv pv-est">{t("estimate")}</span>
      </div>
    </button>
  )
}
