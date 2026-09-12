You are building **Phase 3 — Engine und Nachweis** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **40 minutes.**

## What ReMain is

A mobile-first PWA for the Frankfurt Impact Challenge (FES hackathon, team 02). One
core action — take a photo — turns into the right next step: book an FES bulky-waste
collection, offer the thing on a repair marketplace, report a clean-up quest, or learn
which bin it belongs in. Actions earn XP (status) and Münzen (spendable on partner
coupons).

Repo: `D:\team-02`, branch `build/remain-app`. Phases 1 and 2 are done: design system,
router, session, Fastify server, SQLite, and a seed holding **1011 real Frankfurt
places pulled from OpenStreetMap** (12 Wertstoffhöfe, 87 FES-operated facilities, 50
repair shops).

**Read `docs/PHASES.md` and `docs/PLAN.md` before writing anything.** They carry the
full rules and scope; this prompt is the summary.

## Run it

```
cd server && npm start     # API + built app on http://localhost:8080
cd app && npm run dev      # client on :5173, proxies /api to :8080
```

Useful while you work: `GET /api/health`, `GET /api/integrations`,
`GET /api/places?kind=wertstoffhof&lat=50.11&lon=8.68&r=20`.

## Your job

The credibility core. Every other phase writes through you, so the contract matters
more than the cleverness.

**In scope**
- `server/src/engine/assumptions.js` — every factor in one place, each with its source
  and the date you took it: CO₂ per kg of rescued food, per km by car, per km by
  transit, the detour factor, the round-trip rule.
- `server/src/engine/impact.js` — net, not gross. The travel an action causes is
  subtracted from what it saves. There is a working version to port from
  `app/src/lib/impact.ts`; move it to the server and make that the authority.
- `server/src/engine/rewards.js` — fill the rules in behind the existing `award()`
  signature **without changing it**:
  - tier weights: confirmed ×1.0, plausible ×1.0, estimated ×0.5, unmatched ×0
  - **max three scored actions per day**
  - third action at the same place on the same day → half
  - net-negative action → **0 points plus a sentence saying how it would be positive**
  - `eventKey` pays at most once, ever (already enforced — keep it that way)
- `server/src/routes/receipt.js` — replace the 501 stub:
  ```
  GET /api/receipt/:actionId
    -> { action, confirmed: Line[], stated: Line[], estimated: Line[],
         formula: string, credit: { xp, coins, steps: string[] } }
  ```
- `app/src/screens/Nachweis.tsx` — the three blocks, the formula written out in full,
  the credit step by step. Design reference: the "Nachweis" artboard.

**Out of scope** — seasons, the percentile band, the error-provoking dev screen.

## Files you own

```
server/src/engine/**
server/src/routes/receipt.js
app/src/screens/Nachweis.tsx
```

## Done when

Any XP number in the app can be tapped and lands, in two steps, on the formula and the
assumption it came from.

## Rules you must not break

1. **Points only come from `server/src/engine/award.js`.** Never write `ledger_entries`
   yourself. Call `award({ userId, kind, refTable, refId, tier, reason, xp, eventKey })`.
2. **`server/src/schema.sql` is finished and off limits.** It already covers all ten
   phases. If a column is genuinely missing, say so — do not edit it.
3. **No secret ever gets a `VITE_` prefix.** Vite inlines those into the public bundle.
   Keys live in `server/.env`.
4. **Three provenance tiers, never blurred.** `bestätigt` = from an interface.
   `deine Angabe` = typed by the person. `Schätzung` = computed from an assumption we
   print in full. Anything we rebuilt ourselves is `simulated`, never `confirmed`.
5. **Real data before invented data.** Check whether OSM, GTFS, the foodsharing API or
   an FES page already has the fact before writing a fixture.
6. **UI text in German, code and comments in English.**
7. Use the existing design system — `components/ui.tsx`, `Screen.tsx`, `Icon.tsx`,
   `styles/tokens.css`. Do not add colours or edit those files.

## Never touch

`server/src/index.js`, `app/src/App.tsx`, `schema.sql`, `styles/*`, `components/*`
(except one noted below if your phase lists it), and any screen or route file you do
not own. **Your route is already registered and your screen is already wired** — that
is precisely why several sessions can run at once.

`app/src/lib/client.ts` — append your response types at the bottom only.

## Finally

Do not commit; the team commits together. Report what you built, what you left out,
and anything the other sessions need to know.
