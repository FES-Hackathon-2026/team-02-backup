You are building **Phase 4b — der Gefahrstoff-Pfad** of ReMain, in parallel with other
sessions working on other phases of the same repo. Timebox: **35 minutes.**

## What ReMain is

A mobile-first PWA for the Frankfurt Impact Challenge (FES hackathon, team 02). One core
action — take a photo — turns into the right next step: book an FES bulky-waste
collection, offer the thing on a repair marketplace, report a clean-up quest, or learn
which bin it belongs in. Actions earn XP (status) and Münzen (spendable on partner
coupons).

Repo: `D:\team-02`, branch `build/remain-app`. Phases 1–6 have landed; the scan agent
lives in `server/src/agent/`.

**Read `docs/PHASES.md` and `docs/PLAN.md` before writing anything.**

## Run it

```
cd server && npm start     # API + built app on http://localhost:8080
cd app && npm run dev      # client on :5173, proxies /api to :8080
```

## Why this phase exists

FES is explicit that hazardous products belong in the Schadstoffsammlung, must be handed
directly to staff, and must never be left somewhere anonymously. Their public clean-up
day conditions tell volunteers **not** to collect paint buckets, oil cans or car
batteries, and to send the location instead.

So a gamified clean-up app has an obligation: it must not pay anyone to pick up a paint
can. **Reward the safe behaviour — reporting it — and route the person to official
handling.** This is a feature, not a caveat. The pitch line is:

> Unser Anreizsystem belohnt keine riskante Reinigung. Die App erkennt Gefahrstoffe und
> leitet an die offizielle FES-Sammlung weiter.

## Fix this first — it is a live defect

In `server/src/agent/taxonomy.js`, `routeFor()` returns `route: 'quest'` for
`mode === 'fundstueck'` **before** it checks for `schadstoff`. Photograph a paint can in
"Fundstück melden" mode today and it becomes a normal, claimable quest with clean-up XP.
The hazard check has to come first, ahead of every mode branch.

## Your job

**1 — Detect it properly (`server/src/agent/`)**

`schadstoff` already exists as a category with the subtypes Batterie, Farbdose,
Leuchtstoffröhre, Altöl, Spraydose. Extend it to cover the full rule: paint, chemicals,
batteries, oil, solvents, gas cartridges, fluorescent tubes, **unknown liquids**,
**sharps and medical waste**, and **hazard pictograms** (GHS diamonds, the old orange
squares). Teach the prompt in `prompt.js` to look for warning symbols specifically, and
extend the alias map in `contract.js`.

Add an explicit flag to the contract rather than making everyone compare strings:

```js
hazard: {
  is: true,
  severity: 'danger' | 'emergency',   // emergency = leaking, fumes, fire, injury, large spill
  signals: string[],                  // "Warnsymbol erkannt", "Farbdose", "Batterie"
}
```

`severity: 'emergency'` only for immediate danger. Everything else is `'danger'`.
When in doubt, classify **as hazardous** — a false positive costs someone a short detour,
a false negative costs someone their hands.

**2 — Route it (`taxonomy.js`)**

A new route `hazard`, checked before every mode branch. It replaces `quest` and `pickup`
entirely for these items; there is no "pick it up" affordance anywhere in the flow.

**3 — The red card (`app/src/screens/Erkannt.tsx`)**

This file is still a stub — you own it. Build the normal result card *and* the hazard
variant. The hazard variant:

- Red result card, headline **„Gefahrstoff erkannt"**
- Confidence and reasoning: *„Warnsymbol / Farbdose / Batterie erkannt"*
- Safety copy, verbatim: **„Nicht anfassen. Nicht öffnen. Nicht in Restmüll oder
  Abwasser."** plus „Abstand halten."
- CTA 1 — **Offizielle Abgabestelle finden**
- CTA 2 — **Fund melden**
- CTA 3 — **Als sichere Meldung speichern**
- At `severity: 'emergency'` only, a fourth, visually separated action: **Notruf 112**.
  Make it deliberate and hard to mis-tap, and never imply the app has reported anything
  itself — it opens the dialler, the person makes the call.

Red is not in the palette as a primary colour on purpose. Use `--alert` and `--alert-soft`
from `styles/tokens.css`; do not add new colours. This is the one screen in the product
where the alert tone leads, and it should feel like a deliberate exception to the calm
default — that contrast is the design carrying the message.

**4 — Safe actions (`server/src/routes/scan.js` + `server/src/integrations/fes/`)**

- `GET /api/fes/schadstoff?lat=&lon=` — the next official drop-off. Real data is already
  in the database: `GET /api/places?kind=wertstoffhof` returns 12 actual FES recycling
  centres with addresses and opening hours from OpenStreetMap. The mobile Schadstoffmobil
  has a published FES schedule — check `fes-frankfurt.de` before inventing one, and mark
  whatever you cannot source as `source: 'simulated'`.
- `POST /api/scan/:photoId/gefahrstoff` — files a hazard report with photo, position and
  the detected signals. Returns the report and its credit.

**5 — Reward the report, never the handling (`server/src/engine/rewards.js`)**

- **+10 XP** for a documented hazard report: photo **and** position, at
  `tier: 'estimated'` (`'confirmed'` only once FES, the Mängelmelder or a partner API
  confirms it — nothing does today).
- **Zero clean-up XP** for a hazardous find, ever, under any route.
- There is no code path that credits "ich habe es selbst entsorgt". Not a blocked one —
  an absent one.
- `eventKey` on the report so one photo of one paint can cannot be farmed.

## Rules you must not break

1. **Points only come from `server/src/engine/award.js`.** Never write `ledger_entries`
   yourself.
2. **`server/src/schema.sql` is finished and off limits.** A hazard report is an
   `actions` row of kind `quest` with the hazard signals stored alongside the photo — do
   not add a table. If that genuinely will not work, say so rather than editing it.
3. **No secret gets a `VITE_` prefix.**
4. **Three provenance tiers, never blurred.** A detection is a `Schätzung`. A report is
   `deine Angabe` until something external confirms it.
5. **Real data before invented data.**
6. **UI text in German, code and comments in English.**
7. Use the existing design system. Do not edit `styles/*` or `components/*`.

## Files you own

```
server/src/agent/taxonomy.js        (the hazard category, subtypes and the route fix)
server/src/agent/contract.js        (the hazard flag and the alias map)
server/src/agent/prompt.js          (teach it to look for pictograms)
server/src/agent/mock.js            (a hazard fixture — it must work offline)
server/src/routes/scan.js           (the report endpoint)
server/src/integrations/fes/schadstoff.js   (new)
app/src/screens/Erkannt.tsx
```

Two files you share — **add only, change nothing that exists**:

```
server/src/engine/rewards.js        (the hazard branch; phase 3 owns the rest)
server/src/routes/fes.js            (one route; phase 5 owns the rest)
```

## Never touch

`server/src/index.js`, `app/src/App.tsx`, `schema.sql`, `styles/*`, `components/*`, and
any other screen or route. Your route is registered and your screen is wired already.

## Done when

Photographing a paint can — in **any** of the three scan modes — produces the red card,
offers no way to pick it up, names the nearest official drop-off from real data, and
credits 10 XP for the report and nothing else. With `LLM_PROVIDER=mock` and the laptop
offline, the same.

## Finally

Do not commit. Report what you built, what you left out, and tell the phase 7 session
that hazards must never become claimable quests.
