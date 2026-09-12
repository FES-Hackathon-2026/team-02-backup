You are building **Phase 5 — FES: Abholung, Kalender, Wissen** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **45 minutes.**

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

Get someone from "it is standing on the pavement" to "it is booked" in under a minute.

FES gave the hackathon **no mandatory dataset** for this block — rebuilding the service
is explicitly allowed. So build it faithfully and label it honestly.

**Check what is already real first.** `GET /api/places?kind=wertstoffhof` returns 12
actual FES recycling centres with addresses and opening hours, straight from OSM.
`fes-frankfurt.de` responds — see whether the collection calendar or the Abfall-ABC is
scrapable before inventing cycles. Whatever you do have to invent gets
`source: 'simulated'`.

**In scope**
- `server/src/integrations/fes/pickup.js` — exactly four methods: `categories()`,
  `slots(districtId, volumeM3)`, `book(...)`, `cancel(id)`. Respect how FES actually
  works: a volume ceiling, electricals separate, hazardous waste excluded.
- `server/src/integrations/fes/calendar.js` — `dates(districtId)` for Rest, Bio,
  Papier, Gelbe Tonne and Sperrmüll.
- `server/src/integrations/fes/INTEGRATION.md` — what FES would have to provide for the
  real endpoint to drop straight in.
- `server/src/routes/fes.js` — replace the 501 stub; the contract is in its header.
- `app/src/screens/Abholung.tsx` — address → district → category and volume from the
  classification → free slots → binding booking with a reference number.
- `app/src/screens/Kalender.tsx` — the list per district. A booking the agent created
  shows as **"eingetragen"**, not "bestätigt"; that difference stays visible.
- `app/src/screens/Wissen.tsx` — right bin, why, what does *not* work, next collection
  date, the reuse alternative, and the legal basis (FES-Abfall-ABC, EU directive
  2008/98/EG).

Booking calls `award()` with `tier: 'simulated'`.

**Out of scope** — ICS export, a month grid, Wertstoffhöfe on a map, the reminder.

## Files you own

```
server/src/integrations/fes/**
server/src/routes/fes.js
app/src/screens/Abholung.tsx
app/src/screens/Kalender.tsx
app/src/screens/Wissen.tsx
```

## Done when

A booking exists, appears in the calendar, and the receipt marks it "simuliert".

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
