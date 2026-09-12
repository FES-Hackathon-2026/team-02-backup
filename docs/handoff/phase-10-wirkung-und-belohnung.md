You are building **Phase 10 — Wirkung, Rangliste, Store, Feinschliff** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **40 minutes.**

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

The reason someone opens the app again next week — and the finish that decides the
impression.

**Run this last**, or at least after 3, 6 and 7, because it reads from all of them.

**In scope**
- `app/src/screens/Wirkung.tsx` — personal: confirmed actions, amount passed on
  (deine Angabe), CO₂e avoided (Schätzung), weeks in a row. Every number wears its tier.
- Collective: the weekly city goal and progress. `GET /api/standings` already exists.
- `app/src/screens/Stadtteile.tsx` — place, trend, and the person's own share as a
  **percentile band** ("aktivste 12 %"), never a personal rank. Plus **"So kommt euer
  Stadtteil nach vorn"**: three concrete next actions with their point delta. That list
  is the actual retention engine — not "you are 7th", but "two open quests, 900 m, +240".
- **Season**: four weeks, then the table resets; XP and Münzen stay. Stops early users
  running away with it.
- `server/src/routes/rewards.js` — replace the 501 stub. Catalogue, redeem, season.
  Redeeming writes a `redemptions` row and produces a code with a validity date.
- `app/src/screens/Belohnungen.tsx` — the store; redeemed coupons stay visible.
- `app/src/screens/Integrationen.tsx` — render `GET /api/integrations` live, so a judge
  sees at a glance what is real and what is rebuilt.
- Three badges, for variety rather than volume.
- Finish: loading and empty states, German error messages in whole sentences, an
  offline notice, a Lighthouse pass, and a test on a real iOS **and** a real Android
  device.
- Delete every `<Stub phase={n}>` whose phase has landed.

**Out of scope** — reminders, an onboarding carousel, badges beyond three.

Never rank people against each other. Districts are compared; everyone's points still
add up to one city total.

## Files you own

```
server/src/routes/rewards.js
app/src/screens/Wirkung.tsx
app/src/screens/Stadtteile.tsx
app/src/screens/Belohnungen.tsx
app/src/screens/Integrationen.tsx
```

## Done when

The full demo path runs end to end on a phone that has never opened the app:
sign in → photo → book → quest → peer review → receipt → redeem.

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

---

## Stand heute — read this, the scope above was written six phases ago

Phases 1–6, 8, 9 and 4b have landed; phase 7 is being built alongside you. The database
already holds **22 ledger rows across food, hazard, market, pickup and vytal actions** —
so your screens have real numbers to show today, not placeholders.

### What exists

| | |
|---|---|
| `GET /api/standings` | districts with summed XP and active people — built. |
| `GET /api/me` | `xp, level, levelStart, levelEnd, coins, coinsEarned, actions`. |
| `GET /api/receipt/:actionId` | built; link every number you show to its receipt. |
| `GET /api/integrations` | built; `Integrationen.tsx` only has to render it. |
| `engine/` | `assumptions.js` holds every CO₂ factor with its source — import it for the impact figures rather than recomputing. |
| `redemptions` table | exists, 0 rows. |
| `client.ts` | `Totals`, `Standing`, `Integration`, `Receipt` are typed. |

### What is missing — this is your whole job

```
GET  /api/coupons    501   catalogue with costs in Münzen
POST /api/redeem     501   checks balance, writes redemptions, returns a code
GET  /api/season     501   weekly goal, progress, days remaining
Integrationen.tsx    14-line stub
```

Plus four screens that exist in draft and still carry `<Stub phase=…>` markers:
`Start.tsx`, `Wirkung.tsx`, `Stadtteile.tsx`, `Belohnungen.tsx`. **Delete every stub
marker whose phase has landed** — by the end of your phase there should be none left in
the repo. That is a real deliverable, not tidying: a judge who sees "Phase 5" on a
working screen assumes it is fake.

### Two things to get right

- **Redeeming must be atomic.** Check the balance, write the `redemptions` row and
  return the code in one transaction, or a double tap spends the same coins twice.
  `market-write.js` has the pattern.
- **CO₂e is a `Schätzung` and needs a source.** `Wirkung.tsx` currently shows `—` for it.
  Derive it from the person's confirmed actions through `engine/assumptions.js`, and
  make the number open its receipt.

### Suggested order, 40 minutes

1. **10** `/api/coupons`, `/api/redeem`, `/api/season`.
2. **10** `Wirkung.tsx` — real impact per tier, badges from real action counts.
3. **10** `Stadtteile.tsx` — percentile band, "So kommt euer Stadtteil nach vorn" built
   from the genuinely open quests.
4. **5** `Belohnungen.tsx` — catalogue, redeem, the code stays visible.
5. **5** `Integrationen.tsx`, then sweep every remaining `<Stub>`.

You do not install anything. If a phase 7 session shares your working tree they will run
`npm install leaflet` — let them finish before you build.
