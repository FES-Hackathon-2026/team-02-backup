import { t } from './../lib/i18n'
/**
 * Impact receipts — the record of confirmed actions.
 *
 * Not built yet. The shape it needs (see TODO below) is the thing that carries
 * the whole pitch: every number on a receipt states where it came from.
 */
export default function Receipts() {
  return (
    <div className="screen" id="panel-receipts" role="tabpanel">
      <h2>{t("Impact receipts")}</h2>
      <p className="small muted" style={{ marginTop: -4 }}>
        {t("Every number carries its origin. Nothing that is an estimate is ever shown as a measurement.")}</p>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span className="tiny muted">
          <span className="pv pv-api">{t("API")}</span> {t(" confirmed by the server")}</span>
        <span className="tiny muted">
          <span className="pv pv-input">{t("input")}</span> {t(" stated by the user")}</span>
        <span className="tiny muted">
          <span className="pv pv-est">{t("estimate")}</span> {t(" from a documented assumption")}</span>
      </div>

      <div className="empty">
        {t("No receipts yet.")}<br />
        <span className="tiny">{t("Confirm a pickup in Discover and it will appear here.")}</span>
      </div>

      {/* TODO(#3): receipt list + detail.
          - store confirmed pickups locally (lib/receipts.ts), keyed by user id
          - detail shows, line by line:
              API      pickup id, server timestamp, source coordinates
              input    amount in kg, travel mode
              estimate food CO2e, travel CO2e, net, points
          - each line gets a "why" explaining the calculation
          - append the HTTP calls that produced it, from lib/api getLog() */}
    </div>
  )
}
