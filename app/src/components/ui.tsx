import type { ReactNode } from 'react'

import Icon from './Icon'
import { de } from '../lib/de'

/* ------------------------------------------------------------------
   Provenance. The product's central promise is that every number says
   where it came from, so this is a component rather than a class name —
   it is harder to forget and impossible to mislabel.
   ------------------------------------------------------------------ */

export type Herkunft = 'api' | 'input' | 'estimate' | 'simulated'

const HERKUNFT_CLASS: Record<Herkunft, string> = {
  api: 'api',
  input: 'inp',
  estimate: 'est',
  simulated: 'est',
}

const HERKUNFT_LABEL: Record<Herkunft, string> = {
  api: de.herkunft.api,
  input: de.herkunft.input,
  estimate: de.herkunft.estimate,
  simulated: de.herkunft.simulated,
}

const HERKUNFT_TITLE: Record<Herkunft, string> = {
  api: de.herkunft.apiLong,
  input: de.herkunft.inputLong,
  estimate: de.herkunft.estimateLong,
  simulated: de.herkunft.simulatedLong,
}

export function Tag({
  von,
  children,
  icon,
}: {
  /** which tier this value came from */
  von: Herkunft
  /** overrides the default tier label, e.g. the source name */
  children?: ReactNode
  icon?: boolean
}) {
  return (
    <span className={`tag ${HERKUNFT_CLASS[von]}`} title={HERKUNFT_TITLE[von]}>
      {icon && von === 'api' && <Icon name="check" size={12} stroke={2.4} />}
      {icon && (von === 'estimate' || von === 'simulated') && (
        <Icon name="spark" size={12} stroke={2} />
      )}
      {children ?? HERKUNFT_LABEL[von]}
    </span>
  )
}

/** A neutral or attention label that is NOT a provenance claim. */
export function Label({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn'
  children: ReactNode
}) {
  return <span className={`tag ${tone}`}>{children}</span>
}

/* ------------------------------------------------------------------
   Reward. The only yellow in the product.
   ------------------------------------------------------------------ */

export function Coin({ children, star = false }: { children: ReactNode; star?: boolean }) {
  return (
    <span className="coin">
      {star && <Icon name="star" size={13} stroke={2} />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------
   Bits
   ------------------------------------------------------------------ */

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Thumb({
  icon,
  size = 46,
  width,
  height,
}: {
  icon: Parameters<typeof Icon>[0]['name']
  size?: number
  width?: number
  height?: number
}) {
  return (
    <span className="thumb" style={{ width: width ?? size, height: height ?? size }}>
      <Icon name={icon} size={Math.round((width ?? size) * 0.46)} />
    </span>
  )
}

/**
 * Marks a screen whose data is not wired up yet. Phase 1 ships the shell,
 * so this is how nobody demos a screen by accident. Each phase deletes its
 * own; by phase 10 there are none left.
 */
export function Stub({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <p className="stub">
      <b>Phase {phase}</b> — {children}
    </p>
  )
}
