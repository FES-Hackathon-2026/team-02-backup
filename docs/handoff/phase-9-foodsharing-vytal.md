You are building **Phase 9 — foodsharing und Vytal** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **35 minutes.**

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

Wire up the two partner interfaces properly. **foodsharing is the only genuinely live
partner API in the whole project** — the one place where an outside system confirms our
word. That is worth showing the jury explicitly.

**foodsharing is already proxied.** `GET /api/food/*` forwards to the hackathon API with
the team key held server-side. Documentation: `Foodsharing API/API-GUIDE.md`,
`SCHEMA.md`, `DATABASE.md`.

**In scope — foodsharing**
- `app/src/screens/Fairteiler.tsx` — Fairteiler and baskets nearby, ranked by
  **relevance** (net impact per minute of effort, weighted by expiry), not by distance.
- Full flow: request → complete the pickup → history.
- Model the verification state correctly: business rescues stay locked while
  `is_verified` is false — **with an explanation, not a silent error**.
- Handle the real error cases deliberately: 400 own basket, 409 already taken, 403
  missing verification. Show what happened and what to do about it.

**In scope — Vytal**
- `server/src/integrations/vytal/` — the sandbox documentation is linked from the root
  README (a Notion page). If access does not arrive, rebuild the **exact event shape**:
  `event_id`, `container_id`, `partner_id`, `status`, timestamps — so swapping in the
  real adapter later is one file.
- `server/src/routes/vytal.js` — replace the 501 stub. The return calls
  `award({ eventKey: event_id })`, which is what makes a return payable **exactly
  once**. Prove it on screen: scan the same return twice, the second earns nothing and
  says why.
- `app/src/screens/Vytal.tsx` — active container, return deadline, scan to return.
- Without sandbox access everything is `tier: 'simulated'` and says so.

**Out of scope** — the "auf meinem Weg" detour calculation (plain distance is fine), a
Vytal partner map, offering a basket.

## Files you own

```
server/src/integrations/vytal/**
server/src/routes/vytal.js
app/src/screens/Fairteiler.tsx
app/src/screens/Vytal.tsx
```

## Done when

A real foodsharing pickup completes through the live API and appears in the receipt as
**bestätigt**, with its `pickup_id` and the server timestamp.

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
