/**
 * The rules, as pure arithmetic.
 *
 * `score()` gets facts and returns a decision plus the line-by-line reason
 * for it. It touches no database and no clock, which is what lets the
 * receipt re-run it later and land on exactly the same number — the promise
 * the whole product rests on.
 *
 * What the rules are trying to be:
 *
 *   honest     evidence we cannot check is worth half, not all
 *   net        the trip an action causes is subtracted from it
 *   calm       three scored actions a day is plenty; the fourth is recorded
 *              and pays nothing. Regelmäßigkeit, nicht Menge.
 *   bounded    the same corner twice is fine, the third time pays half
 */
import { A, RULES, km, n, nShort } from './assumptions.js'
import { MODES } from './impact.js'

/**
 * Provenance weights.
 *
 * `confirmed` and `plausible` both pay in full: one came from an interface,
 * the other from evidence we checked ourselves and would defend. `simulated`
 * also pays in full — the person really did the thing; only the partner
 * interface is our stand-in, and the app says "simuliert" at every number.
 * `estimated` is halved because the fact itself is a guess. `unmatched` and
 * `pending` pay nothing yet.
 */
export const TIERS = {
  confirmed: { weight: 1, label: 'bestätigt', why: 'aus einer Schnittstelle' },
  plausible: { weight: 1, label: 'plausibel', why: 'aus mehreren Signalen geprüft' },
  simulated: { weight: 1, label: 'simuliert', why: 'echter Vorgang, nachgebauter Dienst' },
  estimated: { weight: 0.5, label: 'geschätzt', why: 'nicht überprüfbar' },
  pending: { weight: 0, label: 'offen', why: 'Prüfung läuft noch' },
  unmatched: { weight: 0, label: 'nicht bestätigt', why: 'die Belege passen nicht zusammen' },
}

export const tierOf = (tier) => TIERS[tier] ?? TIERS.estimated

/** What a kind is called on the receipt. */
export const KINDS = {
  bonus: 'Bonus',
  quest: 'Quest',
  pickup: 'Sperrmüll-Termin',
  market: 'Übergabe im Markt',
  review: 'Gegenprüfung',
  food: 'Lebensmittelrettung',
  vytal: 'Mehrweg-Rückgabe',
}

/**
 * The base value of an act, before any rule.
 *
 * Callers pass this to `award()`; it lives here as well so a receipt can
 * reconstruct the chain from the stored action alone. A quest carries its
 * own bounty in the row, so that one wins over the table.
 */
export const BASE_XP = {
  quest: 60,
  pickup: 40,
  market: 45,
  review: 15,
  food: 50,
  vytal: 20,
}

export const baseXpFor = (kind, subject) =>
  (kind === 'bonus' ? subject?.ref?.base_xp : null) ??
  (kind === 'quest' ? (subject?.quest?.xp ?? null) : null) ?? BASE_XP[kind] ?? 0

/**
 * @param {object} args
 * @param {string} args.kind
 * @param {string} args.tier
 * @param {number} args.baseXp
 * @param {object|null} [args.impact]
 * @param {{scoredBefore: number, samePlaceBefore: number}} args.day
 */
export function score({ kind, tier, baseXp, impact = null, day }) {
  const lines = []
  const t = tierOf(tier)
  const base = Math.max(0, Math.round(baseXp ?? 0))

  let value = base
  let blocked = false
  let hint = null

  lines.push({ label: `Grundwert ${KINDS[kind] ?? kind}`, value: n(base, 0) })

  /* 1 — how good is the evidence */
  value *= t.weight
  lines.push({
    label: `× ${n(t.weight, 1)} — ${t.label} (${t.why})`,
    value: n(Math.round(value), 0),
  })

  /* 2 — the same corner over and over */
  const repeats = day?.samePlaceBefore ?? 0
  if (repeats >= 2) {
    value *= A.repeatMultiplier
    lines.push({
      label: `× ${n(A.repeatMultiplier, 1)} — ${repeats + 1}. Aktion am selben Ort heute`,
      value: n(Math.round(value), 0),
    })
  }

  /* 3 — the trip this action caused, charged at the rate it pays */
  let penalty = 0
  if (impact && impact.travelCo2 > 0) {
    penalty = Math.round(impact.travelCo2 * A.pointsPerKgCo2)
    if (penalty > 0) {
      value -= penalty
      lines.push({
        label:
          `− ${penalty} — Anfahrt ${km(impact.routeKm)} ` +
          `(${impact.modeLabel}, ${n(impact.travelCo2, 2)} kg CO₂e)`,
        value: n(Math.round(value), 0),
      })
    }
  }

  /* 4 — evidence that does not hold, or a trip that costs more than the act */
  if (t.weight === 0) {
    blocked = true
    value = 0
    hint =
      'Solange die Belege nicht zusammenpassen, wird nichts gutgeschrieben. ' +
      'Eine Gegenprüfung durch zwei andere hebt das auf.'
    lines.push({ label: `${t.label} — keine Gutschrift`, value: '0' })
  } else if ((impact?.negative || value <= 0) && (impact?.travelCo2 ?? 0) > 0) {
    blocked = true
    value = 0
    hint = positiveAgain(impact, base * t.weight, penalty)
    lines.push({ label: 'Anfahrt kostet mehr, als die Aktion einbringt', value: '0' })
  }

  /* 5 — the daily cap, last, so the chain above still shows what it would
     have been worth. Recorded either way: the action is not the reward. */
  if (kind !== 'bonus' && !blocked && (day?.scoredBefore ?? 0) >= A.scoredActionsPerDay) {
    value = 0
    blocked = true
    hint =
      `Heute sind schon ${A.scoredActionsPerDay} Aktionen bewertet worden. ` +
      'Deine Aktion ist trotzdem gezählt — morgen zählt sie wieder Punkte.'
    lines.push({
      label: `Tageslimit ${A.scoredActionsPerDay} bewertete Aktionen erreicht`,
      value: '0',
    })
  }

  const xp = Math.max(0, Math.round(value))
  const coins = Math.round(xp / A.xpPerCoin)

  lines.push({ label: 'Gutschrift', value: `${xp} XP · ${coins} Münzen` })

  return {
    xp,
    coins,
    blocked,
    hint,
    lines,
    steps: lines.map((l) => `${l.label}: ${l.value}`),
  }
}

/**
 * The sentence a blocked action gets: not "no", but "here is how this would
 * be worth something". Without it the rule reads as a punishment rather than
 * as an argument about travel.
 */
function positiveAgain(impact, weightedBase, penalty) {
  if (!impact) return null
  const onFoot = Math.max(0, Math.round(weightedBase))

  if (impact.mode === 'car' || impact.mode === 'transit') {
    const alt =
      impact.routeKm <= 6
        ? `Mit dem Rad oder zu Fuß wären es ${onFoot} XP gewesen`
        : `Auf einem Weg, der ohnehin ansteht, statt einer eigenen Fahrt wären es ${onFoot} XP`
    const better =
      impact.mode === 'car'
        ? ` Mit ${MODES.transit.label} statt Pkw kostet dieselbe Strecke ` +
          `${n(impact.routeKm * MODES.transit.co2PerKm, 2)} kg CO₂e statt ${n(impact.travelCo2, 2)} kg.`
        : ''
    return `${alt}; die Anfahrt hat ${penalty} XP gekostet.${better}`
  }

  return `Die Aktion ist gezählt, aber nicht bepunktet: ${penalty} XP Anfahrt gegen ${onFoot} XP Wert.`
}

/** The rules as text, for the receipt and the rules sheet. */
export function ruleList() {
  return Object.entries(RULES).map(([id, r]) => ({ id, ...r }))
}
