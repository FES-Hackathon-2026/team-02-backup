import { t } from './../lib/i18n'
import { useLocation, useNavigate } from 'react-router-dom'
import Map from './Map'
import { useApi, type FesSlot } from '../lib/client'
import { Tag } from './ui'

/**
 * "A collection tour is coming to your Stadtteil — book a place on it."
 *
 * The bin calendar used to sit on the home screen: a date you can do nothing
 * about. This is the opposite kind of fact — a vehicle with room on it and a
 * closing date — so it belongs here, among the things waiting for an answer.
 *
 * The map is not decoration. "In deiner Nähe" is the one claim in this card a
 * person cannot check, and the circle is what makes it checkable: this is the
 * ground the tour covers, drawn where they can see whether their street is
 * inside it. The radius is estimated — Stadtteil centres are known, boundaries
 * are not — so it is labelled an estimate rather than presented as a border.
 */

interface Area {
  id: string
  name: string
  lat: number
  lon: number
  /** null when the catchment could not be derived */
  radiusKm: number | null
}

interface Opportunity {
  slot: FesSlot | null
  district?: string
  area?: Area | null
}

export default function CollectionOpportunity() {
  const navigate = useNavigate()
  const location = useLocation()
  const offer = useApi<Opportunity>('/api/fes/opportunity')
  const proceed = () => navigate(`/abholung${location.search}`, { state: location.state })

  if (offer.loading) return <p role="status">{t('Sammeltouren werden geprüft …')}</p>

  if (offer.error) {
    return (
      <div className="card" role="alert">
        <p>{t('Sammeltouren konnten nicht geladen werden.')}</p>
        <button className="btn" onClick={offer.reload}>
          {t('Erneut laden')}
        </button>
      </div>
    )
  }

  if (!offer.data?.slot) {
    return (
      <div className="card">
        <b className="h3">{t('Keine freie Sammeltour')}</b>
        <p className="sm mut" style={{ margin: '6px 0 12px' }}>
          {t('Gerade ist in deinem Stadtteil keine Tour offen.')}
        </p>
        <button className="btn" onClick={proceed}>
          {t('Abholung prüfen')}
        </button>
      </div>
    )
  }

  const { slot, area } = offer.data
  const wann = slot.periodLabel || slot.label

  return (
    <div className="card sky col" style={{ gap: 11 }}>
      <div className="between">
        <b className="h3">{t('Sammeltour in deiner Nähe')}</b>
        <Tag von="simulated" />
      </div>

      {/* One line each: when, and how much room is left. */}
      <div className="col" style={{ gap: 3 }}>
        <span className="sm">{t(wann)}</span>
        {slot.freeSlots !== undefined && (
          <span className="xs mut">
            {t(
              slot.freeSlots === 1
                ? 'Noch 1 Platz frei'
                : `Noch ${slot.freeSlots} Plätze frei`,
            )}
          </span>
        )}
      </div>

      {area && area.radiusKm !== null && (
        <>
          <Map
            ariaLabel={t(`Gebiet der Sammeltour um ${area.name}`)}
            centre={{ lat: area.lat, lon: area.lon }}
            markers={[]}
            radiusKm={area.radiusKm}
            height={150}
            still
            zoom={13}
          />
          <span className="xs mut">
            {t(`Rund ${area.radiusKm} km um ${area.name}`)} <Tag von="estimate" />
          </span>
        </>
      )}

      <button className="btn primary" onClick={proceed}>
        {t('Platz buchen')}
      </button>
    </div>
  )
}
