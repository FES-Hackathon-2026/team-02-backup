You are building **Phase 6 — Reparatur-Markt** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **40 minutes.**

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

The thing with the small defect reaches someone who can fix it, instead of becoming
bulky waste.

**In scope**
- `server/src/routes/market-write.js` — replace the 501 stub; the contract is in its
  header: offer, claim, handover. **Credit only after both sides confirm the
  handover**, via `award()` with `tier: 'plausible'` — for both people.
- `app/src/screens/Markt.tsx` — replace the read-only version. Offer straight from a
  scan, defect tags instead of a free-text field (`Pumpe defekt`, `Akku schwach`,
  `Lehne lose`), filter by category and distance.
- `app/src/screens/MarktDetail.tsx` — one item, reserve, agree a pickup window, both
  confirm.

`GET /api/market` already lives in `content.js` and serves the list — extend around it,
do not duplicate it.

**Real data already there:** `GET /api/places?kind=reparatur` returns 50 actual repair
shops in Frankfurt from OSM, and `kind=secondhand` another 20. The "who can fix this"
half of the marketplace is real — use it rather than inventing businesses.

**Out of scope** — a business role view, batching several pickups onto one route, a map
view, the seven-day auto-suggest, chat.

Never add prices or resale. Free-to-take is the design: it keeps this out of the way of
commercial second-hand and out of the way of the reward rules.

## Files you own

```
server/src/routes/market-write.js
app/src/screens/Markt.tsx
app/src/screens/MarktDetail.tsx
```

## Done when

Two phones carry a washing machine from listing to a handover both sides confirmed, and
both are credited.

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
