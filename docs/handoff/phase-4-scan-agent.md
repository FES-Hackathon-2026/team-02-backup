You are building **Phase 4 — the Scan-Agent** of ReMain, in parallel with two other
sessions working on other phases of the same repo. Timebox: **55 minutes.**

## What ReMain is

A mobile-first PWA for the Frankfurt Impact Challenge (FES hackathon, team 02). It has
one core action — take a photo — and turns it into the right next step: book an FES
bulky-waste collection, offer the thing on a repair marketplace, report it as a
clean-up quest, or just explain which bin it belongs in.

Repo: `D:\team-02`, branch `build/remain-app`. Phases 1 and 2 are done: design system,
router, session, Fastify server, SQLite, and a seed with 1011 real Frankfurt places
pulled from OpenStreetMap.

**Read `docs/PHASES.md` and `docs/PLAN.md` before you write anything.** They carry the
rules and the scope. This prompt is the summary, those are the source.

## Run it

```
cd server && npm start     # API + built app on http://localhost:8080
cd app && npm run dev      # client on :5173, proxies /api to :8080
```

## Your job

Turn a photo into a classification the person can argue with.

**In scope**
- Camera capture in `app/src/screens/Scan.tsx` (it is currently a styled shell with a
  disabled shutter). Capture → downscale client-side to ≤1280px / ~180KB via canvas →
  `POST /api/photos` (already exists, returns `{id}`) → `POST /api/scan`.
- `server/src/agent/` with two providers behind one interface, chosen by
  `LLM_PROVIDER` in `server/.env`:
  - `groq` — free tier, a vision model. **Check Groq's current model list for the
    exact id**; they change often. Put it in `GROQ_VISION_MODEL`.
  - `mock` — deterministic fixtures, no network.
- `server/src/routes/scan.js` — replace the 501 stub. Contract:
  ```
  POST /api/scan  { photoId, mode, lat?, lon? }
    -> { category, subtype, confidence, estimatedVolumeM3,
         reusableProbability, reasoning: string[], suggestedRoute }
  ```
  `mode` is `sperrmuell | fundstueck | wissen`. `suggestedRoute` is
  `pickup | market | knowledge | quest`. Constrain the model to this JSON schema and
  validate before returning — never pass raw model output through.
- `app/src/screens/Erkannt.tsx` — replace the stub. Shows the category, the confidence,
  **the reasoning in plain German**, a `Tag von="estimate"` because a classification is
  an estimate and never a confirmed fact, three routed actions with their point
  preview, and a "Falsch erkannt? Kategorie korrigieren" affordance that logs the
  correction.

**Out of scope** — do not build these, other phases own them: Ollama or OpenRouter
adapters, hazardous-material logic, several objects in one photo, the booking flow
itself (phase 5), the marketplace write path (phase 6).

## The mock provider is not a fallback, it is the stage insurance

Build it first, keep it working, and test it with the network off. On demo day the
venue wifi will be bad or Groq will rate-limit, and `LLM_PROVIDER=mock` is what makes
the demo run anyway. Put a visible indicator in the UI showing which provider answered.

## Rules you must not break

1. **Points only come from `server/src/engine/award.js`.** Do not write to
   `ledger_entries` yourself. A scan alone earns nothing — the action it leads to does.
2. **`server/src/schema.sql` is finished and off limits.** It already covers every
   phase. If you genuinely need a column, say so instead of editing it.
3. **No secret ever gets a `VITE_` prefix.** Vite inlines those into the public
   bundle. Keys live in `server/.env`.
4. **A model's answer is an estimate.** It is tagged `Schätzung` in the UI, never
   `bestätigt`. The whole product rests on that distinction.
5. **UI text in German, code and comments in English.**
6. Use the existing design system — `components/ui.tsx`, `Screen.tsx`, `Icon.tsx`,
   `styles/tokens.css`. Do not add colours or edit those files.

## Files you own

```
server/src/agent/**            (new)
server/src/routes/scan.js      (replace the stub)
app/src/screens/Scan.tsx
app/src/screens/Erkannt.tsx
server/.env                    (add your keys)
```

**Never touch:** `server/src/index.js`, `app/src/App.tsx`, `schema.sql`, `engine/*`,
`styles/*`, `components/*`, or any other screen. The route and the registration are
already wired for you.

`app/src/lib/client.ts` — add your response type at the bottom only, nothing else.

## Done when

A photo of a chair becomes "Möbel, 87 %, hier ist warum" plus three routes in under six
seconds — and with `LLM_PROVIDER=mock` and the laptop in airplane mode, the same.

## Finally

Do not commit. Report what you built, what you left out, and anything the other
sessions need to know.
