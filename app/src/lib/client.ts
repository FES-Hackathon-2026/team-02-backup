import { useEffect, useState } from 'react'

/**
 * Client for the ReMain API.
 *
 * Same origin in production (one service serves both), and Vite proxies
 * /api to the server in development — so there is no base URL to configure
 * and no CORS. Cookies ride along on every call, which is the whole session.
 */

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  })

  const text = await res.text()
  const data = text === '' ? null : JSON.parse(text)

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? 'unknown',
      data?.message ?? `Die Anfrage ist mit ${res.status} fehlgeschlagen.`,
    )
  }
  return data as T
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  upload: <T,>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
}

/* ------------------------------------------------------------------
   Response shapes
   ------------------------------------------------------------------ */

export interface District {
  id: string
  name: string
  bezirk: number
  lat: number
  lon: number
}

export interface Me {
  id: number
  name: string
  district: { id: string; name: string; bezirk: number }
  role: string
  isDemo: boolean
  xp: number
  level: number
  levelStart: number
  levelEnd: number
  coins: number
  coinsEarned: number
  actions: number
}

export interface Quest {
  id: string
  title: string
  note: string | null
  category: string
  lat: number
  lon: number
  district: string | null
  xp: number
  status: string
  photoId: string | null
  createdBy: string | null
  createdAt: string
  openForDays: number
  distanceKm?: number
}

export interface MarketItem {
  id: string
  title: string
  defect: string
  condition: string | null
  category: string
  district: string | null
  lat: number | null
  lon: number | null
  photoId: string | null
  status: string
  createdAt: string
  distanceKm?: number
}

export interface Place {
  id: string
  kind: string
  name: string
  lat: number
  lon: number
  addr: string | null
  postcode: string | null
  openingHours: string | null
  operator: string | null
  isFes: boolean
  website: string | null
  phone: string | null
  source: string
  distanceKm?: number
}

export interface Standing {
  id: string
  name: string
  bezirk: number
  xp: number
  people: number
}

export interface Integration {
  id: string
  name: string
  status: 'live' | 'pending' | 'simulated'
  what: string
  seam: string
}

/* ------------------------------------------------------------------
   One hook for reading. Deliberately tiny — no cache, no client-side
   store. At this size a refetch is cheaper than a cache-invalidation bug.
   ------------------------------------------------------------------ */

export interface Load<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

export function useApi<T>(path: string | null): Load<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .get<T>(path)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'offline', 'Keine Verbindung zum Server.'),
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, nonce])

  return { data, error, loading, reload: () => setNonce((n) => n + 1) }
}

/* ------------------------------------------------------------------
   Phase 6 — Reparatur-Markt
   ------------------------------------------------------------------ */

/** Running XP and coins, as award() hands them back. */
export interface Totals {
  xp: number
  level: number
  levelStart: number
  levelEnd: number
  coins: number
  coinsEarned: number
  actions: number
}

/** The tag vocabulary. Defects are chosen, never typed. */
export interface MarketCatalogue {
  categories: { id: string; label: string }[]
  defects: Record<string, string[]>
  conditions: string[]
}

/** A real point in time, with the label the server computed for it. */
export interface MarketWindow {
  id: string
  label: string
}

/** Who has confirmed the handover. Credit needs both. */
export interface MarketHandover {
  owner: boolean
  claimer: boolean
  complete: boolean
}

export interface RepairShop {
  id: string
  name: string
  addr: string | null
  openingHours: string | null
  distanceKm: number
}

export interface MarketItemFull extends MarketItem {
  ownerId: number
  ownerName: string | null
  claimedBy: number | null
  claimerName: string | null
}

export interface MarketDetail {
  item: MarketItemFull
  role: 'owner' | 'claimer' | 'visitor'
  window: MarketWindow | null
  windowOptions: MarketWindow[]
  handover: MarketHandover
  /** set once this person has been credited — links to the receipt */
  receiptActionId: number | null
  repairShops: RepairShop[]
  attribution: string
  /** only on a write: what just happened, in German */
  message?: string
  award?: {
    xp: number
    coins: number
    actionId: number
    /** true when a rule (daily cap, travel) let the action count but not pay */
    blocked: boolean
    /** the sentence explaining a blocked credit */
    hint: string | null
    totals: Totals
  } | null
}

export type MarketMineItem = MarketItemFull & {
  window: MarketWindow | null
  handover: MarketHandover
}

export interface MarketMine {
  offered: MarketMineItem[]
  claimed: MarketMineItem[]
}

/* ------------------------------------------------------------------
   Phase 4 — Scan-Agent
   ------------------------------------------------------------------ */

export type ScanMode = 'sperrmuell' | 'fundstueck' | 'wissen'
export type ScanRouteId =
  | 'pickup'
  | 'market'
  | 'knowledge'
  | 'quest'
  /* the hazard path — no cleanup route is ever offered alongside these */
  | 'hazard_dropoff'
  | 'hazard_official'
  | 'hazard_report'

/** One of the three ways forward, with the points it would be worth. */
export interface ScanRoute {
  id: ScanRouteId
  label: string
  hint: string
  to: string
  /** a preview, not a credit — award() decides the real number later */
  xpPreview: number
  primary: boolean
  /** `to` is an outside URL, not an app route */
  external?: boolean
}

/** A real Frankfurt hand-in point, from OpenStreetMap via the server. */
export interface HazardDropoff {
  id: string
  name: string
  addr: string | null
  openingHours: string | null
  isFes: boolean
  lat: number
  lon: number
  distanceKm: number | null
  source: string
}

/**
 * Present only on a hazardous find, and then it takes over the screen.
 *
 * FES hands hazardous waste to trained staff and asks people not to collect
 * it themselves — so the app offers no cleanup route here and rewards the
 * report rather than the handling.
 */
export interface HazardInfo {
  headline: string
  lead: string
  safety: string[]
  /** what triggered the hazard path, in the words the agent used */
  signals: string[]
  immediateDanger: boolean
  dangerSignals: string[]
  emergency: { number: string; when: string }
  source: { name: string; url: string }
  dropoff: HazardDropoff | null
  reportXp: number
  reported: boolean
  reportedAt?: string
  /** a report without a position is only the person's own statement */
  located?: boolean
  receiptActionId?: number | null
}

/** Who answered. Shown on screen, because it changes what the answer means. */
export interface ScanAgent {
  provider: 'groq' | 'mock'
  model: string
  /** the model was configured but could not answer, so fixtures did */
  fallback: boolean
  fallbackReason: string | null
  /** the provider's own caveat, e.g. the offline disclaimer */
  note: string | null
  latencyMs: number
  tier: 'estimated' | 'simulated' | 'input'
}

export interface ScanCategory {
  id: string
  label: string
  bin: string
}

export interface ScanResult {
  photoId: string
  mode: ScanMode
  modeLabel: string
  category: string
  categoryLabel: string
  subtype: string
  confidence: number
  estimatedVolumeM3: number
  estimatedVolumeLabel: string
  reusableProbability: number
  reasoning: string[]
  suggestedRoute: ScanRouteId
  /** what the model wanted, when the rules decided otherwise */
  modelSuggestedRoute: ScanRouteId | null
  routes: ScanRoute[]
  bin: string
  /** null on everything that is not hazardous — check this, not the category */
  hazard: HazardInfo | null
  corrected: boolean
  at: string
  agent: ScanAgent
  /** the full category list, for "Falsch erkannt?" */
  categories: ScanCategory[]
}

/* ------------------------------------------------------------------
   Phase 5 — FES: Abholung, Kalender, Wissen

   Everything under here is rebuilt rather than connected, which is why
   every shape carries `source` and the screens print it.
   ------------------------------------------------------------------ */

export interface FesAlternative {
  what: string
  why: string
  url?: string
  placeKind?: string
}

export interface FesCategory {
  id: string
  name: string
  examples: string
  collectable: boolean
  typicalVolumeM3?: number
  note?: string
  separateLoading?: boolean
  maxPieces?: number
  /** the scan-agent category ids that map onto this one */
  aliases?: string[]
  alternative?: FesAlternative
}

export interface FesCategories {
  categories: FesCategory[]
  maxVolumeM3: number
  leadDays: number
  assumptions: string[]
  source: string
}

export interface FesSlot {
  periodStart?: string
  periodEnd?: string
  periodLabel?: string
  closesLocal?: string
  date: string
  label: string
  weekday: string
  available: boolean
  window?: string
  freeSlots?: number
  pressure?: 'frei' | 'knapp' | 'belegt'
  vehicle?: string
  reason?: string
}

export interface FesSlots {
  slots: FesSlot[]
  districtId: string
  leadDays: number
  source: string
  assumptions: string[]
  blocked?: { code: string; message: string }
}

export interface FesPickup {
  window?: string
  id: string
  address: string
  districtId: string
  category: string
  categoryName: string
  volumeM3: number
  date: string
  label: string
  reference: string
  status: 'booked' | 'cancelled' | 'collected'
  source: string
  createdAt: string
}

export interface FesBooking {
  pickup: FesPickup
  instructions: string[]
  window: string
  vehicle: string
  district: string
  award: { xp: number; coins: number; actionId: number; totals: Totals } | null
  awardNote: string | null
  source: string
  note: string
}

/** One line in the collection calendar — a cycle date or an own booking. */
export interface FesCalendarDate {
  id: string
  fraktion: 'rest' | 'bio' | 'papier' | 'gelb' | 'sperrmuell'
  titel: string
  date: string
  label: string
  window: string
  cycleDays?: number
  shifted?: string | null
  /** true when ReMain created it — shown as „eingetragen", never „bestätigt" */
  own?: boolean
  pickupId?: string
  reference?: string
  detail?: string
  source: string
}

export interface FesCalendar {
  district: { id: string; name: string; bezirk: number }
  dates: FesCalendarDate[]
  fraktionen: { id: string; name: string; cycleDays: number; annahme: string }[]
  source: string
  assumptions: string[]
  note: string
}

export interface AbcEntry {
  id: string
  name: string
  bin: string
  fraktion: string | null
  route: 'tonne' | 'pickup' | 'wertstoffhof' | 'markt'
  why: string
  notAllowed: string[]
  reuse: { titel: string; text: string; route: string | null } | null
  legal: string[]
}

export interface AbcAnswer {
  entry: AbcEntry | null
  entries: { id: string; name: string; bin: string; route: string; fraktion: string | null }[]
  nextDate?: FesCalendarDate | null
  places?:
    | {
        id: string
        name: string
        addr: string | null
        openingHours: string | null
        isFes: boolean
        distanceKm: number
      }[]
    | null
  placeLabel?: string | null
  districtId?: string
  source: string
  attribution?: string | null
  note?: string
  message?: string | null
}

/* ------------------------------------------------------------------
   Phase 9 — foodsharing (live) und Vytal (nachgebaut)
   ------------------------------------------------------------------ */

/** Why a Geschäftsrettung is closed for this access, in words. */
export interface FoodLock {
  status: string
  title: string
  why: string
  what: string
  /** the API's own next step — English, developer-facing, shown as detail */
  nextStep: string | null
}

/** One of the team's two foodsharing test users. */
export interface FoodUser {
  id: number
  name: string | null
  isDefault: boolean
  isVerified: boolean
  status: string
}

export interface FoodState {
  tier: 'confirmed'
  source: string
  acting: {
    id: number
    display_name: string | null
    verification: { status: string; is_verified: boolean; next_step: string | null }
  }
  users: FoodUser[]
  lock: FoodLock | null
}

/**
 * One rescuable thing. Existence, position and expiry are `bestätigt` — they
 * came out of the partner's answer. Everything from `co2eNet` down is a
 * `Schätzung` from the assumptions the same response carries.
 */
export interface FoodItem {
  key: string
  source: 'food_share_point' | 'basket' | 'business'
  sourceId: number
  title: string
  note: string | null
  openingHours?: string | null
  foodTypes?: string[]
  lat: number
  lon: number
  distanceKm: number | null
  expiresAt: string | null
  status?: string
  ownBasket?: boolean
  locked: boolean
  lock?: FoodLock | null
  kg: number
  co2eRescued: number
  co2eTravel: number
  co2eNet: number
  minutes: number
  urgencyFactor: number
  hoursLeft: number | null
  score: number
  why: string
}

export interface FoodNearby {
  items: FoodItem[]
  at: { lat: number; lon: number }
  acting: { id: number; name: string | null; isVerified: boolean }
  lock: FoodLock | null
  assumptions: string[]
  tier: 'confirmed'
  estimateTier: 'estimated'
  source: string
}

export interface FoodPickupResult {
  tier: 'confirmed'
  pickup: {
    id: number
    source: string
    pickedUpAt: string
    name: string
    lat: number | null
    lon: number | null
    foodTypes: string[]
  }
  credited: boolean
  award: { actionId: number; xp: number; coins: number; totals: Totals } | null
  blocked: boolean
  hint: string | null
  message: string
  estimate: { co2eKg: number; assumptions: string[]; tier: 'estimated' }
}

export interface FoodHistoryEntry {
  id: number
  source: string
  pickedUpAt: string
  wasTrial: boolean
  name: string | null
  foodTypes: string[]
  lat: number | null
  lon: number | null
  /** set when this pickup was credited to the signed-in person */
  actionId: number | null
  xp: number
  creditedElsewhere: boolean
}

export interface FoodHistory {
  tier: 'confirmed'
  source: string
  pickups: FoodHistoryEntry[]
}

/* Vytal — every value below is `simulated`, never `confirmed`. */

export interface VytalPartner {
  partner_id: string
  name: string
  address: string
  lat: number
  lon: number
  accepts: string[]
  distanceKm: number | null
}

export interface VytalContainer {
  container_id: string
  container_type: string
  label: string
  partner_id: string
  partner_name: string | null
  status: 'borrowed' | 'returned' | 'overdue'
  borrowed_at: string
  due_at: string
  returned_at: string | null
  return_partner_id: string | null
  return_partner_name: string | null
  borrow_event_id: string
  return_event_id: string | null
  hoursLeft: number
  single_use_grams: number | null
  /** on returned containers: the ledger row that paid for it */
  actionId?: number | null
  xp?: number
}

export interface VytalState {
  tier: 'simulated'
  loanDays: number
  xpPerReturn: number
  active: VytalContainer[]
  returned: VytalContainer[]
  partners: VytalPartner[]
  note: string
}

/** The partner event itself — `event_id` is the exactly-once key. */
export interface VytalEvent {
  event_id: string
  type: 'borrow' | 'return'
  container_id: string
  container_type: string
  partner_id: string
  user_ref: string
  status: string
  occurred_at: string
  due_at: string
  was_overdue?: boolean
  days_held?: number
}

export interface VytalReturnResult {
  credited: boolean
  repeat: boolean
  blocked?: boolean
  hint?: string | null
  code?: string
  message: string
  event: VytalEvent
  container: VytalContainer
  award?: { actionId: number; xp: number; coins: number; totals: Totals }
  alreadyPaid?: { actionId: number; xp: number; coins: number; at: string } | null
  tier: 'simulated'
}

/* ------------------------------------------------------------------
   Phase 3 — Engine und Nachweis
   ------------------------------------------------------------------ */

/** One fact on a receipt. `source` names where the value came from. */
export interface ReceiptLine {
  label: string
  value: string
  source: string | null
}

/** A factor or a rule, with its origin. `own` means: we decided it. */
export interface Assumption {
  id: string
  group?: 'factor' | 'rule'
  value: number
  unit: string
  label: string
  note: string
  source: string
  origin: 'published' | 'own'
  taken: string
}

export interface Receipt {
  action: {
    id: number
    kind: string
    kindLabel: string
    title: string
    status: string
    tier: string
    tierLabel: string
    createdAt: string
    whenLabel: string
    reason: string | null
    district: string | null
  }
  /** from an interface */
  confirmed: ReceiptLine[]
  /** typed by the person */
  stated: ReceiptLine[]
  /** computed from an assumption we print in full */
  estimated: ReceiptLine[]
  /** came back from a service we rebuilt — neither confirmed nor estimated */
  simulated: ReceiptLine[]
  formula: string
  credit: {
    xp: number
    coins: number
    blocked: boolean
    hint: string | null
    steps: string[]
    lines: { label: string; value: string }[]
  }
  /** true when re-running the rules landed on the recorded number */
  reproducible: boolean
  assumptions: { used: Assumption[]; all: Assumption[] }
  rules: Assumption[]
  note: string
}

/* ------------------------------------------------------------------
   Phase 8 — Mobilität. Everything here comes out of the RMV GTFS export
   via /api/mobility/*; the CO2 figures are estimates computed from the
   factors the same response carries in `assumptions`.
   ------------------------------------------------------------------ */

export interface MobilityStop {
  id: string
  name: string
  lat: number
  lon: number
  modes: string[]
  lines: string[]
  distanceKm: number
  walkMinutes: number
  departuresPerDay: number
}

export interface Departure {
  line: string
  mode: string
  headsign: string
  time: string
  inMinutes: number
}

export type RouteMode = 'walk' | 'bike' | 'transit' | 'car'

export interface RouteLeg {
  kind: 'walk' | 'ride'
  line?: string
  mode?: string
  headsign?: string
  from?: string
  to?: string
  stops?: number
  departTime?: string
  arriveTime?: string
  seconds?: number
  km: number
}

export interface RouteOption {
  mode: RouteMode
  label: string
  icon: string
  /** the way there */
  minutes: number
  /** the way there, in km */
  km: number
  /** what the CO2 was charged on: there and back */
  co2Km: number
  co2Kg: number
  co2Note: string
  /** the arithmetic behind co2Kg, written out */
  formula: string
  detail: string
  note: string | null
  legs: RouteLeg[] | null
  savedVsCarKg: number
  savedVsCarText: string
  tier: 'estimated'
  xp: {
    /** full = nothing deducted · reduced = travel costs XP · none = not scored */
    effect: 'full' | 'reduced' | 'none'
    deducted: number
    text: string
    reason: string
    baseXp?: number
    resultXp?: number
  }
}

export interface RouteComparison {
  directKm: number
  at: number
  atTime: string
  options: RouteOption[]
  best: RouteMode
  target: { kind: 'quest'; id: string; title: string; xp: number } | null
  schedule: {
    serviceDate: string
    note: string
    limitation: string
    tier: 'confirmed'
  } | null
  assumptions: {
    source: string
    detourFactor: number
    roundTrip: number
    carCo2PerKm: number
    transitCo2PerKm: number
    pointsPerKgCo2: number
    note: string
  }
  xpNote: string
}

/** What POST /api/scan/:photoId/gefahrmeldung answers with. */
export interface HazardReport extends ScanResult {
  message: string
  award: { xp: number; coins: number; actionId: number; totals: Totals } | null
}

/* ------------------------------------------------------------------
   Phase 10 — Wirkung, Saison, Belohnungen

   Three tiers, three fields: `confirmed` comes out of the ledger,
   `stated` is what the person typed, `estimated` is computed from the
   assumptions the same response carries. They are separate objects on
   purpose — a shape that cannot mix them is harder to mix up.
   ------------------------------------------------------------------ */

export interface ImpactConfirmed extends Totals {
  actions: number
  kinds: { kind: string; label: string; count: number }[]
  tier: 'confirmed'
}

export interface ImpactStated {
  /** m³ of bulky waste this person registered — their own figure */
  volumeM3: number
  pickups: number
  handedOver: number
  questsReported: number
  tier: 'input'
}

/** One action's share of the CO₂ sum, with the action behind it. */
export interface ImpactContribution {
  actionId: number
  kind: string
  label: string
  title: string | null
  /** null when we deliberately claim no saving for this kind of action */
  savedCo2: number | null
  travelCo2: number
  netCo2: number
  createdAt: string
}

export interface ImpactEstimated {
  savedCo2: number
  travelCo2: number
  netCo2: number
  claimedActions: number
  /** actions that are real but that we will not price in kilograms */
  unclaimedActions: number
  formula: string
  note: string | null
  contributions: ImpactContribution[]
  assumptions: Assumption[]
  tier: 'estimated'
}

export interface ImpactStreak {
  weeks: number
  /** true when this week already has an action in it */
  active: boolean
  sinceLabel: string | null
  note: string | null
}

export interface Badge {
  id: string
  title: string
  icon: string
  note: string
  value: number
  goal: number
  earned: boolean
}

/** A band, never a rank — the plan rules out ranking people against people. */
export interface Percentile {
  band: number | null
  label: string | null
  activePeople: number
  /** false when too few people have points for the band to mean anything */
  reliable: boolean
  note: string
}

export interface Impact {
  confirmed: ImpactConfirmed
  stated: ImpactStated
  estimated: ImpactEstimated
  streak: ImpactStreak
  badges: Badge[]
  percentile: Percentile
  recent: {
    actionId: number
    kind: string
    label: string
    tier: string
    xp: number
    coins: number
    createdAt: string
  }[]
  rules: Assumption[]
  note: string
}

export interface SeasonInfo {
  number: number
  startsAt: string
  endsAt: string
  startLabel: string
  endLabel: string
  /** 1-4 */
  week: number
  weeks: number
  daysLeft: number
  note: string
}

export type Trend = 'up' | 'down' | 'flat' | 'new'

export interface SeasonDistrict {
  id: string
  name: string
  bezirk: number
  xp: number
  seasonXp: number
  weekXp: number
  prevWeekXp: number
  people: number
  trend: Trend
  trendLabel: string
}

export interface Season {
  season: SeasonInfo
  week: { index: number; number: number; startsAt: string; endsAt: string; label: string }
  city: {
    weekXp: number
    lastWeekXp: number
    seasonXp: number
    allTimeXp: number
    goalXp: number
    pct: number
    activePeople: number
    formula: string
    source: string
    counts: string
    tier: 'confirmed'
  }
  districts: SeasonDistrict[]
  /** null when nobody is signed in — the season table itself is public */
  home: {
    districtId: string
    nextSteps: NextStep[]
    xpNote: string
  } | null
  note: string
}

/** One concrete thing to do next, built from rows that are genuinely open. */
export interface NextStep {
  id: string
  title: string
  detail: string
  /** a preview from BASE_XP, not a credit — the rules decide at award time */
  xp: number
  count: number | null
  icon: string
  to: string
}

export interface Coupon {
  id: string
  title: string
  detail: string
  coins: number
  icon: string
  validDays: number
  affordable: boolean
  missing: number
  /** how many real OSM places the bonus would apply to */
  partners: { count: number; label: string; source: string; tier: 'confirmed' } | null
}

export interface Redemption {
  id: string
  couponId: string
  title: string
  icon: string
  code: string
  coins: number
  validUntil: string | null
  validLabel: string | null
  expired: boolean
  createdAt: string
}

export interface CouponCatalogue {
  coins: number
  coinsEarned: number
  xpPerCoin: number
  coupons: Coupon[]
  redemptions: Redemption[]
  tier: 'simulated'
  note: string
}

export interface RedeemResult {
  redemption: Redemption
  coins: number
  totals: Totals
  tier: 'simulated'
  message: string
}

/* ------------------------------------------------------------------
   Phase 7 — Quests: melden, übernehmen, nachweisen, gegenprüfen.

   The proof is four signals and the rules weigh them; the model is one
   of the four and never decides alone. Every signal carries its own
   provenance, which is why `tier` sits on the signal rather than on the
   verdict.
   ------------------------------------------------------------------ */

/** Which of the three provenance tiers a single signal was read from. */
export type SignalTier = 'confirmed' | 'input' | 'estimated' | 'simulated'

export interface QuestSignal {
  id: 'hash' | 'position' | 'time' | 'model'
  label: string
  /** how much this signal can move the verdict, of six points */
  weight: number
  /** what it actually moved it by: +weight, −weight or 0 */
  points: number
  verdict: 'pass' | 'fail' | 'unknown'
  tier: SignalTier
  /** where the value came from, in German */
  source: string
  /** how it was computed */
  method: string
  value: string
  detail: string
  /** true on the two signals that can refuse on their own */
  veto?: boolean
  /* hash */
  distance?: number
  beforeHash?: string
  afterHash?: string
  clientHash?: string | null
  /* position */
  metres?: number
  /* time */
  seconds?: number
  claimedAt?: string
  /* model */
  model?: string
  samePlace?: boolean | null
  cleaned?: boolean | null
  confidence?: number | null
  reasoning?: string | null
}

export interface QuestFull extends Quest {
  districtId: string | null
  createdById: number | null
  claimedBy: number | null
  claimerName: string | null
  claimedUntil: string | null
  claimSecondsLeft: number | null
}

/** gemeldet → übernommen → eingereicht → bestätigt, always all four. */
export interface QuestStep {
  id: 'gemeldet' | 'uebernommen' | 'eingereicht' | 'bestaetigt'
  label: string
  done: boolean
  at: string | null
}

export interface QuestSubmission {
  id: string
  questId: string
  userId: number
  userName: string | null
  photoId: string | null
  beforePhotoId: string | null
  verdict: 'plausible' | 'unmatched' | 'pending'
  verdictLabel: string
  confidence: number | null
  createdAt: string
  /** true while this viewer could still be an independent second look —
      the signals are withheld until they have answered */
  blind: boolean
  score: number | null
  maxScore: number | null
  signals: QuestSignal[] | null
  steps: string[] | null
  veto: { id: string; label: string; detail: string } | null
  model: { asked: boolean; model?: string; reasoning?: string | null; reason?: string } | null
  rule: string | null
  decidedBy: 'rules'
}

export interface QuestReview {
  question: string
  quorum: number
  answers: number
  counts: { clean: number; not_clean: number; cannot_see: number }
  mine: QuestAnswer | null
  canReview: boolean
  /** why not, when canReview is false */
  why: string | null
  open: boolean
  outcome: 'released' | 'rejected' | null
  note: string
}

export type QuestAnswer = 'clean' | 'not_clean' | 'cannot_see'

export interface QuestCredit {
  actionId: number
  xp: number
  coins: number
}

export interface QuestDetail {
  quest: QuestFull
  role: 'reporter' | 'claimer' | 'submitter' | 'visitor'
  chain: QuestStep[]
  canClaim: boolean
  claimBlockedWhy: string | null
  submission: QuestSubmission | null
  review: QuestReview | null
  /** the clean-up credit, once it exists — links to its receipt */
  credit: QuestCredit | null
  attribution: string
  /** only on a write */
  message?: string
  outcome?: 'released' | 'rejected' | null
  released?: { xp: number; coins: number; actionId: number; blocked: boolean } | null
  award?: {
    xp: number
    coins: number
    actionId: number
    blocked: boolean
    hint: string | null
    totals: Totals
  } | null
}

/** One quest waiting for a second pair of eyes. */
export interface ReviewTask {
  submissionId: string
  quest: QuestFull
  beforePhotoId: string | null
  afterPhotoId: string | null
  answers: number
  quorum: number
  submittedAt: string
  xp: number
}

export interface QuestMine {
  reported: QuestFull[]
  claimed: QuestFull[]
  reviewable: ReviewTask[]
  reviewXp: number
  reportXp: number
}

/**
 * What POST /api/quests answers with when the photo shows a hazardous find.
 *
 * Not an error to swallow: it is the safe path, and the screen shows it
 * instead of the report form. There is deliberately no clean-up route in
 * `routes` — FES asks people not to collect this themselves.
 */
export interface QuestHazardRefusal {
  error: 'hazard_not_a_quest'
  message: string
  why: string
  hazard: HazardInfo
  routes: ScanRoute[]
  next: string
}

export interface PickupResolution {
  state: 'needs_address' | 'already_booked' | 'existing_booking' | 'available_slots' | 'no_availability'
  pickup?: FesPickup
  candidates?: FesPickup[]
  slots?: FesSlot[]
  source: string
}
export interface PickupDetail {
  pickup: FesPickup
  items: { id: string; category: string; categoryName: string; volumeM3: number; photoId: string | null }[]
  window: string
  instructions: string[]
  reminders: boolean
  actionId: number | null
  tour?: { id: string; status: string; periodStart: string; periodEnd: string; periodLabel: string; closesLocal: string; area: string; centre: { lat: number; lon: number }; stops: number; utilization: number; eta: string | null; note: string }
  contact?: { fullName: string; email: string; phone: string; postcode: string; placement: string } | null
  note: string
}
export interface PickupNotices {
  notifications: { id: string; pickupId: string; kind: string; message: string; read: boolean; at: string }[]
  unread: number
}
