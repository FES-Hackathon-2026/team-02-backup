You are building **Phase 7 — Quests auf echter Karte** of ReMain, in parallel with other sessions working on other phases of the same repo. Timebox: **70 minutes.**

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

The heart of the product: report, claim, prove, peer-review. This is the phase the jury
will remember, so spend the time on the proof rather than the polish.

**Depends on phase 4** for the image comparison. If phase 4 has not landed, build
everything else and call its endpoint behind a flag — the three non-model signals carry
a verdict on their own.

**In scope**
- **Leaflet + OSM raster tiles**, attribution visible, one marker per quest, radius
  filter. Do not pick a tile provider that needs a key.
- `server/src/routes/quests-write.js` — replace the 501 stub; contract in its header.
- **Claiming reserves a quest for two hours**, so three people do not walk to the same
  spot.
- **The proof is four signals, and the rules decide — not the model:**
  1. perceptual hash (dHash) before/after — is it the same place?
  2. GPS distance from the report point
  3. time elapsed since the claim
  4. the model's comparison, with its reasoning in plain German

  Weigh them into `plausible | unmatched | pending`, and store each signal with its own
  provenance tier. "The rules decided, the model advised" is what makes this defensible
  instead of hand-wavy — say so in the UI, not just in the code.
- **Peer review:** anyone nearby gets one short question — ja / nein / kann ich nicht
  sehen. Anonymous. Two matching answers release the credit (`award()`,
  `tier: 'plausible'`); the reviewer earns +15 XP.
- Nobody reviews their own quest, nobody reviews the same one twice (the schema already
  enforces the second with a UNIQUE constraint).
- Status chain visible: gemeldet → übernommen → eingereicht → bestätigt.

**Hazardous finds are not quests — this is a hard rule.**

If the classification comes back with `hazard.is === true` (paint, chemicals, batteries,
oil, solvents, gas cartridges, fluorescent tubes, unknown liquids, sharps, medical waste,
hazard pictograms), `POST /api/quests` must refuse to create a claimable quest. It files
a **hazard report** instead: photo, position, signals, no claim, no clean-up XP, and the
app routes the person to the official FES Schadstoffsammlung.

FES tells clean-up volunteers explicitly not to collect paint buckets, oil cans or car
batteries, and to send the location instead. An app that pays people to pick those up
would be worse than no app. Phase 4b owns the detection and the red result card; you own
the refusal — make sure there is no path through your endpoints that turns a hazard into
something a person can claim, and no CTA anywhere in the quest flow that invites picking
one up. Coordinate with the phase 4b session on the exact flag.

**Out of scope** — marker clustering, push notifications (an in-app prompt is enough),
random reviewer selection, quest categories beyond litter.

## Files you own

```
server/src/routes/quests-write.js
server/src/agent/verify.js        (phase 4 owns the rest of server/src/agent/ — agree the seam)
app/src/components/Map.tsx        (the one component file you may create)
app/src/screens/Quests.tsx
app/src/screens/QuestProof.tsx
app/src/screens/Review.tsx
```

## Done when

Three phones do report → clear → review, and all three see the same reasoning in the
receipt.

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

Phases 1–6, 8, 9 and 4b have landed. You are the last major gap: **0 quest
submissions and 0 peer reviews in the database.** Everything else in the demo path
works, so this phase is what closes it.

### What already exists that you must use, not rebuild

| | |
|---|---|
| `award()` | returns `{ok, actionId, xp, coins, blocked, hint, breakdown, totals}`. A blocked action still returns `ok:true` with `xp:0` and a `hint`. |
| `engine/rewards.js` | exports `BASE_XP` — **`quest: 60`, `review: 15`** — plus `KINDS`, `score`, `tierOf`. Do not invent XP values. |
| `GET /api/receipt/:actionId` | already built and re-runs the rules from stored rows. Your actions get receipts for free **if** you write clean `actions` rows. |
| `routes/market-write.js` | **copy its two-sided confirmation pattern.** It stores a pending `actions` row (`ref_table 'market_handover'`, `status 'pending'`), and only the second confirmation credits — each side through `award()` with its own `eventKey`. Your peer review is the same shape. Read it before designing yours. |
| `agent/taxonomy.js` | `hazardBlock()` and `hazardSignals()`; a scan result carries `hazard.is`, `hazard.severity`, `hazard.signals`. |
| `app/src/lib/client.ts` | `Quest`, `ScanResult`, `HazardInfo`, `HazardReport`, `Totals` are typed already. |
| `quests` table | `claimed_by`, `claimed_until`, `status` (open/claimed/submitted/confirmed), `photo_id`, `xp` — all there. `quest_submissions` and `peer_reviews` exist, the latter with a UNIQUE (submission_id, user_id). |

### The image-comparison problem — decide this in the first five minutes

**The server cannot decode a JPEG.** No `sharp`, no `jimp`, no `jpeg-js`, and
`agent/index.js` exposes only `classify()` — there is no compare function. So the
before/after hash needs one of:

- **Preferred — `npm i jpeg-js` in `server/`.** Pure JavaScript, no native build, small.
  Decode both photos, downscale to 9×8, compute the dHash server-side. The signal stays
  server-authoritative, which is the whole point of the proof.
- **Fallback — compute the dHash in the browser** with the canvas pipeline that already
  exists in `Scan.tsx`, and send it alongside the photo. Faster to build, but a client
  can forge it, so it must be tagged `deine Angabe` and must not be able to carry the
  verdict alone.

Either way GPS distance and elapsed time are computed on the server and are the signals
that cannot be faked. Say in the UI which is which.

### Rules the earlier draft did not have

- **Nobody clears the quest they reported.** Report + clear by one person is +70 XP for
  moving a bag two metres. Refuse it at `claim` and at `submit`.
- **XP:** reporting a quest `+10`, clearing it `BASE_XP.quest` (60), reviewing `+15`.
  Pass the base to `award()` and let the engine apply tier, cap and damper — do not
  pre-multiply.
- **Hazards never become quests** (the section above). `POST /api/quests` checks
  `hazard.is` and returns the hazard-report path instead.
- `npm install leaflet` lands in `app/package.json`. If a phase 10 session is running in
  the same working tree, tell them before you install.

### Suggested order, 70 minutes

1. **5** `npm i leaflet @types/leaflet`; `Map.tsx` — OSM tiles, attribution, markers.
2. **10** `POST /api/quests` (with the hazard refusal) + report credit.
3. **10** `POST /api/quests/:id/claim` — two-hour lock, own-report refusal.
4. **20** `POST /api/quests/:id/submit` — the four signals, rules decide, pending action.
5. **10** `POST /api/quests/:id/review` — two matching answers credit both sides.
6. **15** `Quests.tsx` (map + list), `QuestProof.tsx`, `Review.tsx`.

Cut in this order if time runs out: the map becomes a list (the data is the same), the
model comparison drops to three signals, `Review.tsx` merges into `QuestProof.tsx`.
**Never cut the peer review** — three phones agreeing is the demo.
