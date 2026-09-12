import { randomInt } from 'node:crypto'

import { all, distanceKm, id, now, one, run, tx } from '../db.js'
import { A, assumption, n, nShort } from '../engine/assumptions.js'
import { impactOf } from '../engine/award.js'
import { berlinDay, subjectOf } from '../engine/context.js'
import { factorsUsed } from '../engine/impact.js'
import { BASE_XP, KINDS } from '../engine/rewards.js'
import { totals } from '../engine/totals.js'
import { currentUser, requireUser } from '../session.js'

/**
 * Phase 10 — Wirkung, Saison und Belohnungen.
 *
 *   GET  /api/impact   what one person has actually caused, split by tier
 *   GET  /api/season   the four-week season, the weekly city goal, district trend
 *   GET  /api/coupons  the partner catalogue and this person's redeemed codes
 *   POST /api/redeem   spend Münzen, get a code — atomically, or not at all
 *
 * `/api/impact` is the one endpoint the contract in the old stub did not
 * name. It is here rather than in a file of its own because the screen it
 * feeds is phase 10's, and because the alternative was letting the client
 * add up CO₂ — which would break the rule that the client never computes.
 *
 * Nothing in this file writes to `ledger_entries`. Spending is a row in
 * `redemptions`; `engine/totals.js` already subtracts it from the balance,
 * so the ledger stays append-only and a coupon can never create points.
 */

/* ------------------------------------------------------------------
   Time. Every boundary below is a Frankfurt calendar day, never a UTC
   one — a season that turns over at 2 a.m. local time would be a lie
   told to someone standing in Frankfurt. Day arithmetic runs on the
   calendar date rather than on milliseconds, which makes it survive
   the October clock change without a special case.
   ------------------------------------------------------------------ */

/** Days since the Unix epoch, counted in Berlin. */
function dayNumber(iso) {
  const [y, m, d] = berlinDay(iso).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Back to an ISO date: 20342 -> '2025-09-08'. */
const dayDate = (dayNum) => new Date(dayNum * 86_400_000).toISOString().slice(0, 10)

const dayLabel = (dayNum) =>
  new Date(`${dayDate(dayNum)}T12:00:00Z`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

/**
 * Monday, 31 August 2026 — the first day of season 1.
 *
 * A season needs one fixed origin, or two servers disagree about which
 * week it is. A Monday, so a season week is the week people already have
 * in their heads.
 */
const SEASON_EPOCH = dayNumber('2026-08-31T12:00:00Z')

/** Four weeks. Long enough to mean something, short enough to catch up. */
const SEASON_DAYS = 28

function seasonAt(iso = now()) {
  // Before the epoch (a clock set wrong, a seeded row from last week) the
  // season is still season 1 rather than a negative number.
  const offset = Math.max(0, dayNumber(iso) - SEASON_EPOCH)
  const index = Math.floor(offset / SEASON_DAYS)
  const startDay = SEASON_EPOCH + index * SEASON_DAYS
  const endDay = startDay + SEASON_DAYS - 1
  const dayInSeason = Math.max(0, dayNumber(iso) - startDay)

  return {
    number: index + 1,
    startDay,
    endDay,
    startsAt: dayDate(startDay),
    endsAt: dayDate(endDay),
    startLabel: dayLabel(startDay),
    endLabel: dayLabel(endDay),
    /** 1-4 */
    week: Math.floor(dayInSeason / 7) + 1,
    weeks: SEASON_DAYS / 7,
    daysLeft: endDay - dayNumber(iso) + 1,
  }
}

/** Week index counted from the same Monday, so weeks and seasons line up. */
const weekIndex = (iso) => Math.floor((dayNumber(iso) - SEASON_EPOCH) / 7)

function weekWindow(index) {
  const startDay = SEASON_EPOCH + index * 7
  return {
    index,
    startsAt: dayDate(startDay),
    endsAt: dayDate(startDay + 6),
    label: `${dayLabel(startDay)} bis ${dayLabel(startDay + 6)}`,
  }
}

/* ------------------------------------------------------------------
   The weekly city goal.

   Not a round number someone liked the look of: it is computed from how
   many people are actually active and what the city managed last week,
   and the response carries the arithmetic so the app can print it. A
   goal nobody can check is just a progress bar.
   ------------------------------------------------------------------ */

const GOAL = {
  perPersonPerWeek: 150,
  floor: 500,
  growth: 1.15,
}

function weeklyGoal(activePeople, lastWeekXp) {
  const byPeople = activePeople * GOAL.perPersonPerWeek
  const byLastWeek = Math.round(lastWeekXp * GOAL.growth)
  const value = Math.max(GOAL.floor, byPeople, byLastWeek)

  const reason =
    value === byLastWeek && byLastWeek > byPeople && byLastWeek > GOAL.floor
      ? `${nShort(GOAL.growth, 2)} × ${lastWeekXp} XP der Vorwoche`
      : value === byPeople && byPeople > GOAL.floor
        ? `${activePeople} aktive Personen × ${GOAL.perPersonPerWeek} XP`
        : `Mindestziel ${GOAL.floor} XP`

  return {
    xp: value,
    formula:
      `Ziel = größter Wert aus: ${activePeople} aktive Personen (mindestens eine bestätigte ` +
      `Aktion) × ${GOAL.perPersonPerWeek} XP, ` +
      `${nShort(GOAL.growth, 2)} × ${lastWeekXp} XP der Vorwoche, Mindestziel ${GOAL.floor} XP. ` +
      `Maßgeblich diese Woche: ${reason}.`,
    source: 'Eigene Festlegung — kein gemessener Wert, sondern die Abmachung.',
  }
}

/* ------------------------------------------------------------------
   Coupons.

   Partner-facing copy stays vague about brand names on purpose: we have
   no agreement with anybody. What is not vague is the count of places a
   bonus would apply to — those come out of the 1.011 real OpenStreetMap
   rows in `places`, so the catalogue is anchored in something real even
   while the redemption itself is our own stand-in.

   Costs are deliberately small. Ten XP make one Münze, a quest is 60 XP,
   so a catalogue priced in the hundreds is a catalogue nobody reaches in
   a demo — or in a first week.
   ------------------------------------------------------------------ */

const CATALOGUE = [
  {
    id: 'c-kaffee',
    title: 'Kaffee im Mehrwegbecher',
    detail: 'Ein Heißgetränk, wenn der Becher wiederverwendbar ist.',
    coins: 8,
    icon: 'cup',
    validDays: 30,
  },
  {
    id: 'c-rmv',
    title: 'RMV-Kurzstrecke',
    detail: 'Eine Fahrt im Stadtgebiet — für den Weg zur nächsten Aktion.',
    coins: 15,
    icon: 'route',
    validDays: 30,
  },
  {
    id: 'c-reparatur',
    title: '5 € Reparaturbonus',
    detail: 'Auf eine Reparatur statt auf einen Neukauf.',
    coins: 25,
    icon: 'wrench',
    placeKind: 'reparatur',
    placeLabel: 'Reparaturbetriebe in Frankfurt',
    validDays: 60,
  },
  {
    id: 'c-wertstoffhof',
    title: 'Wertstoffhof-Anlieferung',
    detail: 'Eine Anlieferung ohne Gebühr.',
    coins: 40,
    icon: 'gift',
    placeKind: 'wertstoffhof',
    placeLabel: 'Wertstoffhöfe im Stadtgebiet',
    validDays: 90,
  },
]

const COUPON_BY_ID = new Map(CATALOGUE.map((c) => [c.id, c]))

/** How many real OSM places a bonus would be good at. Counted, not claimed. */
function partnerCount(kind) {
  if (!kind) return null
  return one('SELECT COUNT(*) AS n FROM places WHERE kind = ?', kind).n
}

/**
 * A code that looks like a partner code and cannot be guessed from the one
 * before it. No I, O, S, 0, 1, 2 — this gets read off a screen and typed in.
 */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3456789'

function makeCode() {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `REM-${block()}-${block()}`
}

const validUntilFor = (coupon, from = new Date()) =>
  new Date(from.getTime() + coupon.validDays * 86_400_000).toISOString()

function shapeCoupon(coupon, coins) {
  const count = partnerCount(coupon.placeKind)
  return {
    id: coupon.id,
    title: coupon.title,
    detail: coupon.detail,
    coins: coupon.coins,
    icon: coupon.icon,
    validDays: coupon.validDays,
    affordable: coins >= coupon.coins,
    missing: Math.max(0, coupon.coins - coins),
    partners:
      count === null
        ? null
        : { count, label: coupon.placeLabel, source: 'OpenStreetMap', tier: 'confirmed' },
  }
}

function shapeRedemption(row) {
  const coupon = COUPON_BY_ID.get(row.coupon_id)
  const expired = row.valid_until !== null && Date.parse(row.valid_until) < Date.now()
  return {
    id: row.id,
    couponId: row.coupon_id,
    title: coupon?.title ?? row.coupon_id,
    icon: coupon?.icon ?? 'gift',
    code: row.code,
    coins: row.coins,
    validUntil: row.valid_until,
    validLabel: row.valid_until
      ? new Date(row.valid_until).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : null,
    expired,
    createdAt: row.created_at,
  }
}

const myRedemptions = (userId) =>
  all('SELECT * FROM redemptions WHERE user_id = ? ORDER BY created_at DESC', userId).map(
    shapeRedemption,
  )

/**
 * What a kind is called on screen.
 *
 * `engine/rewards.js` owns the canonical list; `hazard` arrived with phase
 * 4b after it was written, and a German screen must not print the English
 * word. One entry, not a second source of truth.
 */
const KIND_LABEL = { ...KINDS, hazard: 'Gefahrstoff-Meldung' }

const labelFor = (kind) => KIND_LABEL[kind] ?? kind

/* ------------------------------------------------------------------
   Personal impact, re-derived from stored rows.

   Every figure below is recomputed from `actions` through the same
   engine functions `award()` used, which is why each one can carry a
   tier and link to a receipt. Nothing is cached and nothing is stored
   twice — if the rules change, this changes with them.
   ------------------------------------------------------------------ */

/** Confirmed actions, newest first, with the credit each one produced. */
function confirmedActions(userId) {
  return all(
    `SELECT a.id, a.kind, a.ref_table, a.ref_id, a.tier, a.created_at,
            COALESCE(SUM(l.xp), 0)    AS xp,
            COALESCE(SUM(l.coins), 0) AS coins,
            MIN(l.reason)             AS reason
       FROM actions a
       LEFT JOIN ledger_entries l ON l.action_id = a.id
      WHERE a.user_id = ? AND a.status = 'confirmed' AND a.kind <> 'bonus'
      GROUP BY a.id
      ORDER BY a.created_at DESC`,
    userId,
  )
}

/**
 * The CO₂ side, summed across everything the person has done.
 *
 * Two honesty rules from `engine/impact.js` carry straight through: we
 * claim a saving only where there is a factor we can defend, and we
 * subtract the travel even for the actions we claim nothing for. That is
 * why `unclaimed` is reported rather than quietly dropped — an app that
 * only counts what flatters it is the thing this product is arguing with.
 */
function co2For(user, actions) {
  let saved = 0
  let travel = 0
  const contributions = []
  const factors = new Map()
  let unclaimed = 0
  const unclaimedKinds = new Set()

  for (const a of actions) {
    const subject = subjectOf({ kind: a.kind, refTable: a.ref_table, refId: a.ref_id, user })
    const impact = impactOf({ kind: a.kind, userId: user.id, subject })

    if (impact.savedCo2 === null) {
      unclaimed++
      unclaimedKinds.add(a.kind)
    } else saved += impact.savedCo2
    travel += impact.travelCo2

    for (const f of factorsUsed(impact)) factors.set(f.id, f)

    if (impact.savedCo2 !== null || impact.travelCo2 > 0) {
      contributions.push({
        actionId: a.id,
        kind: a.kind,
        label: labelFor(a.kind),
        title: subject.title ?? shortReason(a.reason),
        savedCo2: impact.savedCo2 === null ? null : Number(impact.savedCo2.toFixed(3)),
        travelCo2: Number(impact.travelCo2.toFixed(3)),
        netCo2: Number((impact.netCo2 ?? -impact.travelCo2).toFixed(3)),
        createdAt: a.created_at,
      })
    }
  }

  const net = saved - travel

  return {
    savedCo2: Number(saved.toFixed(3)),
    travelCo2: Number(travel.toFixed(3)),
    netCo2: Number(net.toFixed(3)),
    claimedActions: actions.length - unclaimed,
    unclaimedActions: unclaimed,
    formula:
      `${n(saved, 2)} kg CO₂e vermieden − ${n(travel, 2)} kg CO₂e Anfahrt = ` +
      `${n(net, 2)} kg CO₂e netto`,
    note:
      unclaimed > 0
        ? `Für ${unclaimed} ${unclaimed === 1 ? 'Aktion' : 'Aktionen'} behaupten wir keine ` +
          `Kilogramm: ${list([...unclaimedKinds].map(labelFor))} ` +
          `${unclaimedKinds.size === 1 ? 'wirkt' : 'wirken'}, lässt sich aber nicht seriös in ` +
          'CO₂ umrechnen. Die Anfahrt ziehen wir dort trotzdem ab.'
        : null,
    contributions: contributions
      .slice()
      .sort((a, b) => Math.abs(b.netCo2) - Math.abs(a.netCo2))
      .slice(0, 6),
    assumptions: [...factors.values()],
    tier: 'estimated',
  }
}

/** ['a', 'b', 'c'] -> „a, b und c". */
const list = (items) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`

/**
 * A ledger reason, trimmed to something that fits one line.
 *
 * Actions that point at a partner's own table (`foodsharing_pickups`,
 * `vytal_events`) have no row the engine can read a title from, so four
 * rescues would all read „Lebensmittelrettung". The reason `award()` stored
 * names the place, and that is what makes the four lines tellable apart.
 */
function shortReason(reason) {
  if (!reason) return null
  const parts = String(reason).split(' · ')
  const text = parts.slice(0, 2).join(' · ')
  return text.length > 72 ? `${text.slice(0, 71).trimEnd()}…` : text
}

/** What the person typed in themselves. Never dressed up as a measurement. */
function statedFor(userId) {
  const pickups = all(
    "SELECT volume_m3, category FROM pickups WHERE user_id = ? AND status != 'cancelled'",
    userId,
  )
  const offered = one(
    "SELECT COUNT(*) AS n FROM market_items WHERE user_id = ? AND status = 'handed_over'",
    userId,
  ).n
  const reported = one('SELECT COUNT(*) AS n FROM quests WHERE created_by = ?', userId).n

  return {
    volumeM3: Number(pickups.reduce((sum, p) => sum + (p.volume_m3 ?? 0), 0).toFixed(2)),
    pickups: pickups.length,
    handedOver: offered,
    questsReported: reported,
    tier: 'input',
  }
}

/**
 * Weeks in a row with at least one action, counted back from this week.
 *
 * A streak that breaks the moment someone has a quiet Monday is a stick,
 * not a habit — so the current week counts as intact until it is over,
 * and the run is measured from the last week that had something in it.
 */
function streakFor(userId) {
  const rows = all(
    "SELECT created_at FROM actions WHERE user_id = ? AND status = 'confirmed' AND kind <> 'bonus'",
    userId,
  )
  if (rows.length === 0) return { weeks: 0, active: false, note: null, sinceLabel: null }

  const weeks = new Set(rows.map((r) => weekIndex(r.created_at)))
  const thisWeek = weekIndex(now())
  const active = weeks.has(thisWeek)

  // Start at this week if it has something, otherwise at last week — the
  // week in progress is not yet a missed week.
  let cursor = active ? thisWeek : thisWeek - 1
  let streak = 0
  while (weeks.has(cursor)) {
    streak++
    cursor--
  }

  return {
    weeks: streak,
    active,
    sinceLabel: streak > 0 ? weekWindow(cursor + 1).label.split(' bis ')[0] : null,
    note: active
      ? null
      : streak > 0
        ? 'Diese Woche ist noch nichts dabei — eine Aktion hält die Reihe.'
        : null,
  }
}

/**
 * Three badges. Deliberately three, and deliberately not about volume:
 * the daily cap and the repeat damper already say that more is not the
 * point, so a badge for the hundredth photo would argue with our own rules.
 */
function badgesFor(actions, streak, level) {
  const kinds = new Set(actions.map((a) => a.kind))

  return [
    { id: 'klimaheld', title: 'Frankfurt Klimaheld', icon: 'spark', note: 'Level 8 erreicht.', value: Math.min(level, 8), goal: 8, earned: level >= 8 },
    {
      id: 'erste-aktion',
      title: 'Erste Aktion',
      icon: 'check',
      note: 'Eine bestätigte Aktion — angefangen ist der schwerste Teil.',
      value: Math.min(actions.length, 1),
      goal: 1,
      earned: actions.length >= 1,
    },
    {
      id: 'vielseitig',
      title: 'Vielseitig',
      icon: 'spark',
      note: 'Aktionen in drei verschiedenen Bereichen — Breite statt Menge.',
      value: Math.min(kinds.size, 3),
      goal: 3,
      earned: kinds.size >= 3,
    },
    {
      id: 'dranbleiben',
      title: 'Dranbleiben',
      icon: 'clock',
      note: 'Zwei Wochen hintereinander aktiv.',
      value: Math.min(streak.weeks, 2),
      goal: 2,
      earned: streak.weeks >= 2,
    },
  ]
}

/**
 * The person's own position as a band, never as a rank.
 *
 * „Keine Rangliste von Personen" is a rule in the plan, so this returns
 * „aktivste 12 %" and nothing finer. It is also the only figure in the
 * product whose meaning depends on how many other people exist, so when
 * there are too few it says so instead of producing a proud-looking
 * number out of four rows.
 */
function percentileFor(userId) {
  const rows = all(
    `SELECT user_id, SUM(xp) AS xp FROM ledger_entries GROUP BY user_id HAVING SUM(xp) > 0`,
  )
  const mine = rows.find((r) => r.user_id === userId)?.xp ?? 0
  const people = rows.length

  if (mine <= 0) {
    return {
      band: null,
      label: null,
      activePeople: people,
      reliable: false,
      note: 'Sobald deine erste Aktion bestätigt ist, siehst du hier deinen Anteil.',
    }
  }

  const atLeastAsActive = rows.filter((r) => r.xp >= mine).length
  const raw = (atLeastAsActive / people) * 100
  // Rounded to five, and never below five: a band that says "die aktivsten
  // 1 %" out of thirty people is a rank wearing a percent sign.
  const band = Math.max(5, Math.min(100, Math.round(raw / 5) * 5))
  const reliable = people >= 10

  return {
    band,
    label: `aktivste ${band} %`,
    activePeople: people,
    reliable,
    note: reliable
      ? `Von ${people} Personen mit mindestens einer bewerteten Aktion. Einzelplätze zeigen wir nicht.`
      : `Erst ${people} ${people === 1 ? 'Person hat' : 'Personen haben'} bisher Punkte — ` +
        'für ein belastbares Band sind das zu wenige. Die Zahl steht hier trotzdem, damit ' +
        'niemand sie für genauer hält, als sie ist.',
  }
}

/* ------------------------------------------------------------------
   District trend, from the ledger rather than from a stored counter.

   One distinction matters here and nowhere else: the weekly figures
   count only ledger rows that point at an action. The seed gives every
   demo person an opening balance („Startguthaben der Demo-Daten") with
   no action behind it, and counting that as this week's activity would
   hand the city its goal for something nobody did. Season and all-time
   totals keep it, so this table still adds up to `GET /api/standings`.
   ------------------------------------------------------------------ */

function districtWeeks() {
  const rows = all(
    `SELECT d.id, d.name, d.bezirk,
            l.xp AS xp, l.created_at AS at, l.action_id AS action_id,
            u.id AS user_id
       FROM districts d
       JOIN users u          ON u.district_id = d.id
       JOIN ledger_entries l ON l.user_id = u.id`,
  )

  const season = seasonAt()
  const thisWeek = weekIndex(now())
  const byDistrict = new Map()

  for (const r of rows) {
    const entry = byDistrict.get(r.id) ?? {
      id: r.id,
      name: r.name,
      bezirk: r.bezirk,
      xp: 0,
      seasonXp: 0,
      weekXp: 0,
      prevWeekXp: 0,
      people: new Set(),
    }
    const day = dayNumber(r.at)
    const week = weekIndex(r.at)
    const fromAction = r.action_id !== null

    entry.xp += r.xp
    if (day >= season.startDay && day <= season.endDay) entry.seasonXp += r.xp
    if (fromAction && week === thisWeek) entry.weekXp += r.xp
    if (fromAction && week === thisWeek - 1) entry.prevWeekXp += r.xp
    entry.people.add(r.user_id)

    byDistrict.set(r.id, entry)
  }

  return [...byDistrict.values()]
    .map((d) => ({
      ...d,
      people: d.people.size,
      ...trendOf(d.weekXp, d.prevWeekXp),
    }))
    .sort((a, b) => b.seasonXp - a.seasonXp || a.name.localeCompare(b.name, 'de'))
}

/** Up, down, flat — or honestly "neu", when there is no week to compare to. */
function trendOf(weekXp, prevWeekXp) {
  if (prevWeekXp === 0) {
    return weekXp > 0
      ? { trend: 'new', trendLabel: 'neu — erste Woche mit Punkten' }
      : { trend: 'flat', trendLabel: 'diese Woche noch nichts' }
  }
  const change = (weekXp - prevWeekXp) / prevWeekXp
  if (change > 0.1) {
    return { trend: 'up', trendLabel: `+${Math.round(change * 100)} % gegenüber der Vorwoche` }
  }
  if (change < -0.1) {
    return { trend: 'down', trendLabel: `${Math.round(change * 100)} % gegenüber der Vorwoche` }
  }
  return { trend: 'flat', trendLabel: 'wie in der Vorwoche' }
}

/* ------------------------------------------------------------------
   „So kommt euer Stadtteil nach vorn".

   This is the retention engine and it only works if every line is a
   real row: two quests that are genuinely open, 900 m away, worth 120.
   „Du bist Siebter" tells nobody what to do next.

   Computed on the server for the same reason every other number is —
   the XP figures are `BASE_XP` from the engine, not numbers a screen
   made up, and they are labelled as a preview rather than a credit
   because the rules (tier, cap, travel) only decide at award time.
   ------------------------------------------------------------------ */

/** Distance from the centre of the person's Stadtteil — the engine's origin too. */
const NEAR_KM = 3

function nextStepsFor(user) {
  const home = one('SELECT id, name, lat, lon FROM districts WHERE id = ?', user.district_id)
  if (!home) return []

  const withDistance = (rows) =>
    rows
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      .map((r) => ({ ...r, km: distanceKm(home, r) }))
      .sort((a, b) => a.km - b.km)

  const candidates = []

  /* 1 — quests nobody has taken yet */
  const quests = withDistance(
    all("SELECT id, title, lat, lon, xp FROM quests WHERE status = 'open'"),
  )
  const nearQuests = quests.filter((q) => q.km <= NEAR_KM)
  const pick = (nearQuests.length > 0 ? nearQuests : quests).slice(0, 3)
  if (pick.length > 0) {
    // „in der Nähe" only when it is true. Otherwise the honest word.
    const where = nearQuests.length > 0 ? 'in der Nähe' : 'im Stadtgebiet'
    candidates.push({
      id: 'quests',
      title: `${pick.length} ${pick.length === 1 ? 'offene Quest' : 'offene Quests'} ${where}`,
      detail: `nächste ${distanceLabel(pick[0].km)} — „${pick[0].title}“`,
      xp: pick.reduce((sum, q) => sum + q.xp, 0),
      count: pick.length,
      icon: 'quest',
      to: '/quests',
    })
  }

  /* 2 — a submission waiting for a second pair of eyes */
  const waiting = all(
    `SELECT s.id, s.quest_id, q.title
       FROM quest_submissions s
       JOIN quests q ON q.id = s.quest_id
      WHERE s.user_id != ?
        AND s.id NOT IN (SELECT submission_id FROM peer_reviews WHERE user_id = ?)
      ORDER BY s.created_at DESC`,
    user.id,
    user.id,
  )
  if (waiting.length > 0) {
    candidates.push({
      id: 'review',
      title: `${waiting.length} ${waiting.length === 1 ? 'Nachweis wartet' : 'Nachweise warten'} auf eine Gegenprüfung`,
      detail: `eine kurze Frage zu „${waiting[0].title}“ — anonym, ja oder nein`,
      xp: BASE_XP.review * Math.min(waiting.length, 3),
      count: waiting.length,
      icon: 'shield',
      to: `/review/${waiting[0].id}`,
    })
  }

  /* 3 — things in the market that nobody has collected */
  const items = withDistance(
    all(
      "SELECT id, title, lat, lon FROM market_items WHERE status = 'open' AND user_id != ?",
      user.id,
    ),
  )
  const nearItems = items.filter((i) => i.km <= NEAR_KM)
  if (nearItems.length > 0) {
    candidates.push({
      id: 'market',
      title:
        nearItems.length === 1
          ? 'Ein Ding wartet auf jemanden, der es weiterbenutzt'
          : `${nearItems.length} Dinge warten auf jemanden, der sie weiterbenutzt`,
      detail: `nächstes ${distanceLabel(nearItems[0].km)} — „${nearItems[0].title}“`,
      xp: BASE_XP.market,
      count: nearItems.length,
      icon: 'wrench',
      to: '/markt',
    })
  }

  /* 4 — always available, so the list is never short */
  candidates.push({
    id: 'pickup',
    title: 'Etwas fotografieren, das am Gehweg steht',
    detail: 'Sperrmüll anmelden statt warten — der Agent füllt Kategorie und Volumen vor',
    xp: BASE_XP.pickup,
    count: null,
    icon: 'camera',
    to: '/scan',
  })

  return candidates.slice(0, 3)
}

/**
 * 0.62 -> „620 m", 3.4 -> „3,4 km". The same way a person would say it.
 *
 * Anything under 100 m becomes „unter 100 m" rather than a rounded „0 m":
 * we measure from the centre of a Stadtteil, not from where the person is
 * standing, so more precision than that would be made up.
 */
function distanceLabel(value) {
  if (value < 0.1) return 'unter 100 m'
  return value < 1
    ? `${Math.round(value * 1000)} m`
    : `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
}

/* ------------------------------------------------------------------ */

export default async function rewardRoutes(app) {
  /**
   * What one person has actually caused — split into the three tiers and
   * never mixed. Every CO₂ line names the action behind it so the number
   * opens its own receipt.
   */
  app.get('/api/impact', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const actions = confirmedActions(user.id)
    const streak = streakFor(user.id)
    const kinds = [...new Set(actions.map((a) => a.kind))].map((kind) => ({
      kind,
      label: labelFor(kind),
      count: actions.filter((a) => a.kind === kind).length,
    }))

    return {
      confirmed: {
        actions: actions.length,
        kinds,
        ...totals(user.id),
        tier: 'confirmed',
      },
      stated: statedFor(user.id),
      estimated: co2For(user, actions),
      streak,
      badges: badgesFor(actions, streak, totals(user.id).level),
      percentile: percentileFor(user.id),
      recent: actions.slice(0, 5).map((a) => ({
        actionId: a.id,
        kind: a.kind,
        label: labelFor(a.kind),
        tier: a.tier,
        xp: a.xp,
        coins: a.coins,
        createdAt: a.created_at,
      })),
      rules: [assumption('pointsPerKgCo2'), assumption('xpPerCoin')].filter(Boolean),
      note:
        'Jede Zahl trägt ihre Herkunft: bestätigt kommt aus dem Ledger, deine Angabe hast du ' +
        'eingetippt, die Schätzung ist aus offengelegten Annahmen gerechnet.',
    }
  })

  /**
   * The season and the week.
   *
   * Four weeks, then the table starts again — XP, Level and Münzen do not.
   * Without that, whoever signs in first stays on top forever and everyone
   * joining in week three is playing a game that is already decided.
   */
  app.get('/api/season', async (request) => {
    const season = seasonAt()
    const thisWeek = weekIndex(now())
    const districts = districtWeeks()

    // Signed in is the normal case, but the season itself is public — a
    // judge following a shared link should see the table, just without the
    // three steps that are about their own Stadtteil.
    const user = currentUser(request)

    const weekXp = districts.reduce((sum, d) => sum + d.weekXp, 0)
    const lastWeekXp = districts.reduce((sum, d) => sum + d.prevWeekXp, 0)
    const seasonXp = districts.reduce((sum, d) => sum + d.seasonXp, 0)
    const allTimeXp = districts.reduce((sum, d) => sum + d.xp, 0)
    // Active means: has done something. Not "has a balance" — the demo
    // people start with one, and a goal scaled to them would be scaled to
    // nobody.
    const activePeople = one(
      "SELECT COUNT(DISTINCT user_id) AS n FROM actions WHERE status = 'confirmed'",
    ).n

    const goal = weeklyGoal(activePeople, lastWeekXp)

    return {
      season: {
        ...season,
        note:
          `Saison ${season.number} läuft vier Wochen — noch ${season.daysLeft} ` +
          `${season.daysLeft === 1 ? 'Tag' : 'Tage'}. Danach beginnt die Stadtteil-Tabelle ` +
          'wieder bei null. XP, Level und Münzen bleiben, wo sie sind.',
      },
      week: { ...weekWindow(thisWeek), number: season.week },
      city: {
        weekXp,
        lastWeekXp,
        seasonXp,
        allTimeXp,
        goalXp: goal.xp,
        pct: goal.xp > 0 ? Math.min(100, Math.round((weekXp / goal.xp) * 100)) : 0,
        activePeople,
        formula: goal.formula,
        source: goal.source,
        counts:
          'Für die Woche zählen nur Punkte aus Aktionen. Das Startguthaben der Demo-Konten ' +
          'steht in der Saison- und Gesamtsumme, aber nicht im Wochenziel — dafür hat niemand ' +
          'etwas getan.',
        tier: 'confirmed',
      },
      districts: districts.map((d) => ({
        id: d.id,
        name: d.name,
        bezirk: d.bezirk,
        xp: d.xp,
        seasonXp: d.seasonXp,
        weekXp: d.weekXp,
        prevWeekXp: d.prevWeekXp,
        people: d.people,
        trend: d.trend,
        trendLabel: d.trendLabel,
      })),
      home: user
        ? {
            districtId: user.district_id,
            nextSteps: nextStepsFor(user),
            xpNote:
              'Die XP daneben sind eine Vorschau, keine Gutschrift — was am Ende zählt, ' +
              'entscheiden die Regeln erst beim Abschluss: Nachweisstufe, Tageslimit und ' +
              'die Anfahrt.',
          }
        : null,
      note:
        'Stadtteile werden verglichen, Personen nicht. Alle Punkte zählen zusammen auf das ' +
        'Wochenziel der Stadt.',
    }
  })

  /** The catalogue, priced in Münzen, plus everything this person redeemed. */
  app.get('/api/coupons', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const t = totals(user.id)
    return {
      coins: t.coins,
      coinsEarned: t.coinsEarned,
      xpPerCoin: A.xpPerCoin,
      coupons: CATALOGUE.map((c) => shapeCoupon(c, t.coins)),
      redemptions: myRedemptions(user.id),
      tier: 'simulated',
      note:
        'Der Katalog ist nachgebaut: die Codes erzeugen wir selbst, es steht keine Abmachung ' +
        'mit einem Partner dahinter. Die Zahl der Betriebe daneben ist echt und kommt aus ' +
        'OpenStreetMap.',
    }
  })

  /**
   * Spend Münzen.
   *
   * The balance check, the row and the code are one transaction, because
   * the interesting failure here is not an error message — it is a double
   * tap on a slow connection spending the same coins twice. Reading the
   * balance inside the transaction is what closes that window: SQLite
   * serialises writers, so the second attempt reads the first one's row.
   */
  app.post('/api/redeem', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const coupon = COUPON_BY_ID.get(request.body?.couponId)
    if (!coupon) {
      return reply.code(404).send({
        error: 'unknown_coupon',
        message: 'Diesen Gutschein gibt es nicht.',
      })
    }

    const result = tx(() => {
      const balance = totals(user.id).coins
      if (balance < coupon.coins) {
        return {
          ok: false,
          missing: coupon.coins - balance,
          balance,
        }
      }

      const redemptionId = id('red')
      run(
        `INSERT INTO redemptions (id, user_id, coupon_id, code, coins, valid_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        redemptionId,
        user.id,
        coupon.id,
        makeCode(),
        coupon.coins,
        validUntilFor(coupon),
        now(),
      )
      return { ok: true, redemptionId }
    })()

    if (!result.ok) {
      return reply.code(409).send({
        error: 'not_enough_coins',
        message:
          `Dafür fehlen dir noch ${result.missing} ${result.missing === 1 ? 'Münze' : 'Münzen'}. ` +
          'Jede bestätigte Aktion bringt welche dazu.',
      })
    }

    const row = one('SELECT * FROM redemptions WHERE id = ?', result.redemptionId)
    const t = totals(user.id)

    return reply.code(201).send({
      redemption: shapeRedemption(row),
      coins: t.coins,
      totals: t,
      tier: 'simulated',
      message:
        `Eingelöst. Der Code gilt bis ${shapeRedemption(row).validLabel} — er bleibt hier ` +
        'stehen, du musst ihn nicht abschreiben.',
    })
  })
}
