import { t } from './../lib/i18n'
/**
 * Personal and collective impact.
 *
 * Not built yet. The collective half is what connects an individual rescue to
 * a Frankfurt-wide goal, which the brief asks for explicitly.
 */
export default function Impact() {
  return (
    <div className="screen" id="panel-impact" role="tabpanel">
      <h2>{t("Your contribution")}</h2>
      <div className="empty">
        {t("Nothing confirmed yet.")}<br />
        <span className="tiny">{t("Only actions the API confirmed are counted here.")}</span>
      </div>

      {/* TODO(#4): personal + collective impact.
          - personal: sum of net CO2e, points, confirmed actions, kg of food,
            each tagged with its provenance
          - collective: traffiQ aggregates from Mobilitätsdaten/ — the daily
            profile (tagesgang_avg.csv, 24 values) and stop query counts
            (haltestellen_avg.csv). Prepare them into src/data/traffiq.ts at
            build time rather than shipping the raw CSVs.
          - the shared goal must only count what the API confirmed
          - traffiQ files are partly synthetic per the data catalogue: label
            them as context, never as measured impact. */}
    </div>
  )
}
