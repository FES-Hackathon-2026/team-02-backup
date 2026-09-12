import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import Icon from '../components/Icon'
import Screen from '../components/Screen'
import { Label, Tag, type Herkunft } from '../components/ui'
import { useApi, type Assumption, type Receipt, type ReceiptLine } from '../lib/client'
import { de } from '../lib/de'

/**
 * The receipt.
 *
 * The screen this product is an argument for: every number is opened up into
 * where it came from. Four blocks, in descending order of how far they can
 * be trusted, then the formula written out, then the credit step by step.
 *
 * Nothing here computes. The server sends the arithmetic it actually did —
 * a client that recalculated would be a second opinion nobody asked for.
 */
export default function Nachweis() {
  const { actionId } = useParams()
  const { data, error, loading } = useApi<Receipt>(`/api/receipt/${actionId}`)
  const [showRules, setShowRules] = useState(false)

  if (loading) {
    return (
      <Screen back title="Nachweis">
        <div className="empty">
          <span className="spinner" />
          <p className="sm mut">{de.state.loading}</p>
        </div>
      </Screen>
    )
  }

  if (error || !data) {
    return (
      <Screen back title="Nachweis">
        <div className="empty">
          <Icon name="info" size={26} />
          <p className="sm mut">{error?.message ?? de.state.error}</p>
        </div>
      </Screen>
    )
  }

  const { action, credit } = data
  const steps = credit.lines.slice(0, -1)

  return (
    <Screen
      back
      title="Nachweis"
      sub={`${action.kindLabel} #${action.id} · ${action.whenLabel}`}
      gap={12}
    >
      <Block
        von="api"
        hint="aus einer Schnittstelle, nicht von dir"
        lines={data.confirmed}
        quiet="ReMain-Server"
      />

      <Block
        von="simulated"
        hint="nachgebauter Dienst — die echte Schnittstelle fehlt noch"
        lines={data.simulated}
      />

      <Block von="input" hint="nicht überprüfbar" lines={data.stated} />

      <Block von="estimate" hint="aus einer offengelegten Annahme gerechnet" lines={data.estimated}>
        <div className="card sky tight" style={{ marginTop: 11 }}>
          <p
            className="xs mut"
            style={{ margin: 0, lineHeight: 1.55, fontVariantNumeric: 'tabular-nums' }}
          >
            {data.formula}
          </p>
        </div>
      </Block>

      {/* The only yellow in the product. */}
      <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--gold-soft)' }}>
        <div className="between" style={{ marginBottom: 11 }}>
          <b className="h3" style={{ color: 'var(--gold-ink)' }}>
            Gutschrift
          </b>
          <span className="num" style={{ fontSize: 20, color: 'var(--gold-ink)' }}>
            {credit.xp > 0 ? '+' : ''}
            {credit.xp} {de.reward.xp} · {credit.coins} {de.reward.coins}
          </span>
        </div>

        <div className="col" style={{ gap: 7 }}>
          {steps.map((step, i) => (
            <div key={i} className="between xs" style={{ color: 'var(--gold-ink)' }}>
              <span>{step.label}</span>
              <span style={{ fontWeight: 600 }}>{step.value}</span>
            </div>
          ))}
        </div>

        {credit.hint && (
          <p
            className="xs"
            style={{ margin: '11px 0 0', lineHeight: 1.55, color: 'var(--gold-ink)' }}
          >
            {credit.hint}
          </p>
        )}

        {data.reproducible && (
          <p
            className="xs row"
            style={{ margin: '11px 0 0', gap: 6, color: 'var(--gold-ink)', opacity: 0.85 }}
          >
            <Icon name="check" size={12} stroke={2.4} />
            Nachgerechnet — dieselben Regeln ergeben wieder dieselbe Zahl.
          </p>
        )}
      </div>

      <div className="card dashed tight">
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.55 }}>
          Belohnt wird <b style={{ color: 'var(--ink)' }}>hilfreiche Regelmäßigkeit</b>, nicht
          Menge: höchstens drei bewertete Aktionen am Tag, keine Rangliste gegen andere, Münzen
          nicht kaufbar.
        </p>
      </div>

      <button
        className="btn"
        style={{ height: 46 }}
        onClick={() => setShowRules((open) => !open)}
        aria-expanded={showRules}
      >
        {showRules ? 'Annahmen zuklappen' : 'Alle Spielregeln und Annahmen'}
        <Icon name={showRules ? 'up' : 'down'} size={17} />
      </button>

      {showRules && (
        <Rules all={data.assumptions.all} used={data.assumptions.used} note={data.note} />
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

/** One provenance block. Renders nothing when it has nothing to say. */
function Block({
  von,
  hint,
  lines,
  quiet,
  children,
}: {
  von: Herkunft
  hint: string
  lines: ReceiptLine[]
  /** a source so obvious it would be noise — left out when it matches */
  quiet?: string
  children?: ReactNode
}) {
  if (lines.length === 0) return null

  return (
    <div className="card tight">
      <div className="row" style={{ gap: 7, marginBottom: 11 }}>
        <Tag von={von} icon />
        <span className="xs mut">{hint}</span>
      </div>

      <div className="col" style={{ gap: 9 }}>
        {lines.map((l, i) => (
          <div key={i}>
            <div className="between xs">
              <span className="mut">{l.label}</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>{l.value}</span>
            </div>
            {l.source && l.source !== quiet && (
              <p className="xs mut" style={{ margin: '2px 0 0', opacity: 0.75, lineHeight: 1.4 }}>
                {l.source}
              </p>
            )}
          </div>
        ))}
      </div>

      {children}
    </div>
  )
}

/**
 * Every assumption, with the ones this receipt leaned on marked. Opened in
 * place rather than linked away: the point is that nothing has to be looked
 * up somewhere else.
 */
function Rules({ all, used, note }: { all: Assumption[]; used: Assumption[]; note: string }) {
  const usedIds = new Set(used.map((u) => u.id))

  return (
    <div className="card tight">
      <p className="lbl" style={{ marginBottom: 11 }}>
        Annahmen und Regeln
      </p>

      <div className="col" style={{ gap: 13 }}>
        {all.map((a) => (
          <div key={a.id}>
            <div className="between" style={{ alignItems: 'baseline', gap: 8 }}>
              <b className="xs">{a.label}</b>
              <span className="xs num" style={{ whiteSpace: 'nowrap' }}>
                {String(a.value).replace('.', ',')} {a.unit}
              </span>
            </div>
            <p className="xs mut" style={{ margin: '3px 0 0', lineHeight: 1.45 }}>
              {a.note}
            </p>
            {/* Plain labels, not provenance tags: this says where the number
                was decided, not what tier a value on this receipt has. */}
            <div className="row" style={{ gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <Label>
                {a.origin === 'own' ? 'eigene Festlegung' : 'veröffentlichte Größenordnung'}
              </Label>
              {usedIds.has(a.id) && (
                <span className="xs row" style={{ gap: 4, fontWeight: 600 }}>
                  <Icon name="check" size={11} stroke={2.4} />
                  hier benutzt
                </span>
              )}
              <span className="xs mut">
                {a.source} · Stand {a.taken.split('-').reverse().join('.')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="xs mut" style={{ margin: '13px 0 0', lineHeight: 1.5 }}>
        {note}
      </p>
    </div>
  )
}
