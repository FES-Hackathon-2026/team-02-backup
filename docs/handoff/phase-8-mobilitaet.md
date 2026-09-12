You are building **Phase 8 — Route und Mobilität** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **30 minutes.**

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

Make the journey to an action part of its impact instead of its blind spot. This phase
is **independent of every other one** — nothing blocks you, and you block nobody.

**The data is real and already in the repo** under `Mobilitätsdaten/`: a GTFS archive
for Frankfurt +30 km, stop averages, a daily profile, passenger counts, e-scooter
usage. Read `Mobilitätsdaten/docs/DATENKATALOG.md` first — it documents the quirks, and
they will bite you:
- `BeispielAFZ.csv` is **cp1252** with decimal commas and percent signs
- the original EFA rows carry coordinates in a raw, undocumented format while the
  synthetic ones use decimal degrees — handle them separately
- the files cover different periods and different measures; do not mix them

**In scope**
- `scripts/build-mobility-data.mjs` — unpack the GTFS `.7z`, read the CSVs, write
  compact JSON to `data/`. Committed output, so the server never parses CSV at boot.
- `server/src/routes/mobility.js` — replace the 501 stub; contract in its header.
- `app/src/screens/Route.tsx` — four options to a quest (ÖPNV, Rad, zu Fuß, Auto) with
  time, CO₂ difference and the effect on points. **The car option openly shows 0 XP and
  says why.** That honesty is the point of the screen, not a gotcha.
- Location only while an action is running, cancellable at any time, and the raw trace
  never leaves the device before the person confirms.

**Out of scope** — Ride2Impact GPS trip matching (it becomes a slide), the community
mobility view, the e-scooter dataset.

Every CO₂ number is a `Schätzung` and comes from `engine/assumptions.js`. Phase 3 owns
that file — import it, do not fork it. If it does not exist yet, agree the constant
names with phase 3 rather than inventing your own.

## Files you own

```
scripts/build-mobility-data.mjs
server/src/integrations/traffiq/**
server/src/routes/mobility.js
app/src/screens/Route.tsx
data/**                            (generated output)
```

## Done when

A quest shows three routes with honest CO₂ numbers derived from the real GTFS data.

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
