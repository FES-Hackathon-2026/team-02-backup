import { t, getLocale } from './../lib/i18n'
import { KnowledgeQuiz } from '../components/ReferenceActions'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag } from '../components/ui'
import { useApi, type ScanResult, type AbcAnswer } from '../lib/client'
import { de } from '../lib/de'
import { FRAKTION_FARBE, type Fraktion } from '../lib/demo'

/**
 * „Was mache ich damit?"
 *
 * Six answers in one place: which bin, why that one, what does NOT belong in
 * it, when it is next emptied, what to do instead of throwing it away, and
 * the law it follows from.
 *
 * The last one is the point. „Batterien nicht in den Restmüll" is an opinion
 * until § BattG stands under it — and the citations here are real, even
 * though the bin assignment itself is rebuilt from the FES Abfall-ABC rather
 * than read from it. The tag says which is which.
 */

const ROUTE_LABEL: Record<string, string> = {
  tonne: 'Tonne zu Hause',
  pickup: 'Abholung anmelden',
  wertstoffhof: 'Hinbringen',
  markt: 'Weitergeben',
}

/** Metres below a kilometre — nobody walks „0,0 km“. */
const entfernung = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`

const REUSE_ZIEL: Record<string, { to: string; label: string }> = {
  markt: { to: '/markt', label: 'Auf den Markt stellen' },
  essen: { to: '/essen', label: 'Zu den Fairteilern' },
  mehrweg: { to: '/mehrweg', label: 'Mehrweg statt Einweg' },
}

export default function Wissen() {
  const navigate = useNavigate()
  const location = useLocation()
  const scan = (location.state as { scan?: ScanResult } | null)?.scan
  const [params] = useSearchParams()
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)

  const frage = gewaehlt ?? params.get('category') ?? params.get('q') ?? scan?.category ?? ''
  const antwort = useApi<AbcAnswer>(`/api/fes/abc?category=${encodeURIComponent(frage)}`)

  const eintrag = antwort.data?.entry ?? null

  return (
    <Screen
      back
      title={t("Was mache ich damit?")}
      sub={t(eintrag ? eintrag.name : 'Abfall-ABC')}
      gap={13}
    >
      {/* the whole list stays reachable — an ABC is for browsing too */}
      <div className="chips scroll">
        {t(antwort.data?.entries.map((e) => (
          <button
            key={e.id}
            className="chip"
            aria-pressed={eintrag?.id === e.id}
            onClick={() => setGewaehlt(e.id)}
          >
            {t(e.name)}
          </button>
        )))}
      </div>

      {t(antwort.loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      ))}

      {t(antwort.error && (
        <p className="sm" style={{ margin: 0 }}>
          <Label tone="warn">{t(de.state.error)}</Label>{t(' ')}
          <span className="mut">{t(antwort.error.message)}</span>
        </p>
      ))}

      {t(antwort.data && !eintrag && (
        <div className="empty">
          <Icon name="info" size={28} />
          {t(antwort.data.message ?? 'Oben auswählen, worum es geht.')}
        </div>
      ))}

      {t(eintrag && (
        <>
          {/* 1 — the answer, in one line */}
          <div className="card">
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              {t(eintrag.fraktion && (
                <span
                  style={{
                    width: 8,
                    height: 44,
                    borderRadius: 5,
                    background: FRAKTION_FARBE[eintrag.fraktion as Fraktion] ?? 'var(--blue)',
                    flex: 'none',
                  }}
                />
              ))}
              <span className="grow">
                <h1 className="h1" style={{ fontSize: 22 }}>{t(eintrag.bin)}</h1>
                <span className="row" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                  <Label>{t(ROUTE_LABEL[eintrag.route] ?? eintrag.route)}</Label>
                  <Tag von="simulated" icon />
                </span>
              </span>
            </div>

            <p className="sm mut" style={{ margin: '13px 0 0', lineHeight: 1.6 }}>{t(eintrag.why)}</p>
          </div>

          {/* 2 — when it is next emptied. A rule without a date is homework. */}
          {t(antwort.data?.nextDate && (
            <div className="card tight row" style={{ gap: 11 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: 'var(--sky)',
                  color: 'var(--blue-deep)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="calendar" size={19} />
              </span>
              <span className="grow">
                <b className="sm" style={{ display: 'block' }}>
                  {t("Nächste Leerung: ")}{t(antwort.data.nextDate.label)}
                </b>
                <span className="xs mut">{t(antwort.data.nextDate.window)}</span>
              </span>
              <button className="btn sm" onClick={() => navigate('/kalender')}>
                {t("Kalender")}</button>
            </div>
          ))}

          {/* 3 — booking, when that is the answer */}
          {t(eintrag.route === 'pickup' && (
            <button className="btn primary" onClick={() => navigate(`/mitteilungen?category=${eintrag.id}`)}>
              <Icon name="truck" size={19} />
              {t("Abholung anmelden")}</button>
          ))}

          {/* 4 — real places, from OpenStreetMap, only where they are the answer */}
          {t(antwort.data?.places && antwort.data.places.length > 0 && (
            <div className="card">
              <div className="between" style={{ marginBottom: 10 }}>
                <p className="lbl">{t(antwort.data.placeLabel)}</p>
                <Tag von="api" icon>{t("OpenStreetMap")}</Tag>
              </div>
              <div className="col" style={{ gap: 11 }}>
                {t(antwort.data.places.map((h) => (
                  <div key={h.id} className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
                    <span style={{ marginTop: 2 }}>
                      <Icon name="pin" size={17} className="ico" />
                    </span>
                    <span className="grow">
                      <b className="sm" style={{ display: 'block' }}>{t(h.name)}</b>
                      <span className="xs mut">
                        {t(h.addr ?? 'Frankfurt am Main')} {t(" · ")}{t(entfernung(h.distanceKm))}
                        {t(h.openingHours ? ` · ${h.openingHours}` : '')}
                      </span>
                    </span>
                  </div>
                )))}
              </div>
              <p className="xs mut" style={{ margin: '11px 0 0' }}>
                {t(antwort.data.attribution)} {t(" · Luftlinie ab Stadtteilmitte")}</p>
            </div>
          ))}

          {/* 5 — what does not work. The half people actually get wrong. */}
          <div className="card">
            <p className="lbl" style={{ marginBottom: 10 }}>{t("Was nicht geht")}</p>
            <div className="col" style={{ gap: 9 }}>
              {t(eintrag.notAllowed.map((satz, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ marginTop: 2 }}>
                    <Icon name="cross" size={15} style={{ color: 'var(--alert)' }} stroke={2.4} />
                  </span>
                  <span className="sm">{t(satz)}</span>
                </div>
              )))}
            </div>
          </div>

          {/* 6 — the step before the bin */}
          {t(eintrag.reuse && (
            <div className="card sky">
              <div className="row" style={{ gap: 8, marginBottom: 7 }}>
                <Icon name="leaf" size={18} style={{ color: 'var(--blue-deep)' }} />
                <b className="h3">{t(eintrag.reuse.titel)}</b>
              </div>
              <p className="sm mut" style={{ margin: 0, lineHeight: 1.55 }}>{t(eintrag.reuse.text)}</p>
              {t(eintrag.reuse.route && REUSE_ZIEL[eintrag.reuse.route] && (
                <button
                  className="btn sm"
                  style={{ marginTop: 11 }}
                  onClick={() => navigate(REUSE_ZIEL[eintrag.reuse!.route!].to)}
                >
                  <Icon name="chevron" size={16} />
                  {t(REUSE_ZIEL[eintrag.reuse.route].label)}
                </button>
              ))}
            </div>
          ))}

          {/* 7 — the legal basis. Real citations under a rebuilt assignment. */}
          <div className="card flat">
            <div className="between" style={{ marginBottom: 9 }}>
              <p className="lbl">{t("Rechtsgrundlage")}</p>
              <Tag von="api">{t("Gesetzestext")}</Tag>
            </div>
            <div className="col" style={{ gap: 8 }}>
              {t(eintrag.legal.map((satz, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ marginTop: 2 }}>
                    <Icon name="shield" size={15} className="ico" />
                  </span>
                  <span className="xs mut" style={{ lineHeight: 1.55 }}>{t(satz)}</span>
                </div>
              )))}
            </div>
            <p className="xs mut" style={{ margin: '11px 0 0', lineHeight: 1.55 }}>
              {t(antwort.data?.note)}
            </p>
          </div>
          <KnowledgeQuiz />
        </>
      ))}
    </Screen>
  )
}
