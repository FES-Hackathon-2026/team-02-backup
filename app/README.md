# Save2Share — mobile web app

Mobile-first PWA for the **Frankfurt Impact Challenge 2026** (Team 02).
Modules: **Frankfurt foodsharing** (live API) + **traffiQ** (mobility datasets).

> **Rescue minus travel.** Food rescued *minus* the travel the rescue causes.
> Driving 12 km by car for 1 kg of fruit earns zero points — and the app says why.
> That is the perverse incentive the task brief asks us to design out.

## Run it locally

```bash
cd app
npm install
cp .env.example .env     # then paste the team key into VITE_FS_API_KEY
npm run dev
```

* Laptop: <http://localhost:5173> — use the browser's device toolbar for mobile view.
* **Phone on the same wifi:** `npm run dev` already binds to `--host`; open
  `http://<your-lan-ip>:5173` (find it with `ipconfig` on Windows, `ifconfig` on macOS/Linux).

Without a key the app still starts and asks for one under ⚙ → API key. Keys
entered there are stored in `localStorage` for that browser only.

```bash
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build exactly as Pages will
npm run typecheck   # types only, no build
```

## Android and iOS

It is a website first and an installable app second — no store submission, no
native shell. Both platforms are covered by:

| Concern | How it is handled |
|---|---|
| Install to home screen | `manifest.webmanifest` (Android/Chrome) plus `apple-mobile-web-app-*` meta tags, which iOS reads instead of the manifest |
| Notch and home bar | `viewport-fit=cover` with `env(safe-area-inset-*)` padding on the shell and tab bar |
| iOS zoom on input focus | every `.field` is `font-size: 16px`, below which Safari zooms |
| Double-tap zoom | `touch-action: manipulation` |
| Rubber-band flash | `overscroll-behavior-y: none` |
| Tap targets | 44 px minimum on tab bar, chips and buttons |
| Dark mode | `prefers-color-scheme`, with `[data-theme]` overrides ready for a manual switch |

**No service worker, deliberately.** An offline cache would mean testers and
judges seeing a stale build after a deploy, which is a bad trade during a
hackathon. Add `vite-plugin-pwa` later if offline support becomes worth it.

## Structure

```
app/
  index.html              PWA meta, viewport, icons
  vite.config.ts          base path for GitHub Pages
  public/                 manifest + generated icons (copied verbatim)
  src/
    main.tsx              mount point
    App.tsx               shell: user switching, tab state, settings
    styles.css            design tokens, shell, provenance markers
    components/
      TabBar.tsx          bottom navigation
      OpportunityCard.tsx one row in the discovery list
      SettingsSheet.tsx   API key entry
    screens/
      Discover.tsx        ✅ loads live data and ranks it
      Receipts.tsx        ⬜ placeholder — see TODO(#3)
      Impact.tsx          ⬜ placeholder — see TODO(#4)
      Fair.tsx            ✅ rules, verification state, live HTTP log
    lib/
      api.ts              typed client, records every call for the proof log
      impact.ts           CO₂ maths, reward rules, relevance ranking
      config.ts           API key + base URL resolution
      types.ts            API response types (from SCHEMA.md)
```

### What works today

Discover pulls food share points, nearby baskets and demo businesses from the
live API, computes a net impact for each, and ranks them by relevance rather
than distance. Fair shows the rule set, the user's verification state and a
live log of every HTTP call. User switching between the team's two test
accounts works.

### What is stubbed

Grep for `TODO(#n)`:

1. **Action sheet** (`App.tsx`) — adjust amount and travel mode, show the net
   breakdown and the reward reasons, then reserve → confirm against the API.
2. **"On my way"** (`Discover.tsx`) — pick two traffiQ stops, rank by detour
   minutes, charge only the detour. The maths is already in `lib/impact.ts`.
3. **Receipts** (`Receipts.tsx`) — the provenance receipt, line by line.
4. **Impact** (`Impact.tsx`) — personal totals plus the traffiQ collective view.
5. **Cheat buttons** (`Fair.tsx`) — trigger 400/409/403 live on stage.

## Where every number comes from

Three tiers, marked visually everywhere they appear:

| Tier | Meaning | Examples |
|---|---|---|
| `API` | confirmed by the server | pickup id, timestamp, coordinates, `expires_at`, verification status |
| `input` | stated by the user, unverifiable | amount in kg, travel mode |
| `estimate` | computed from a documented assumption | CO₂e values, points |

No estimate is ever presented as a measurement. All assumptions live in one
place — `ASSUMPTIONS` in `src/lib/impact.ts` — and are printed in the Fair tab.

**The CO₂ factors are our assumptions, not verified figures.** 1.9 kg CO₂e/kg
food, 154 g/km car, 78 g/km transit are in the right ballpark for German public
sources, but verify them before quoting a number on stage.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `app/dist` to GitHub Pages:

<https://fes-hackathon-2026.github.io/team-02/>

One-time repository setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. *(optional)* **Settings → Secrets and variables → Actions → New secret**,
   name `FS_API_KEY`, value the team key. Without it the deployed app simply
   asks each visitor for a key.
3. The repo must be public for Pages on a free org plan — which also matches
   the open-source requirement.

`BASE_PATH` is derived from the repository name in the workflow, so renaming the
repo does not break asset paths. For a custom domain, set `BASE_PATH=/`.

Pull requests run `.github/workflows/ci.yml` — type-check, build, and a check
that the output is actually servable.

## Licence

MIT, see [`LICENSE`](../LICENSE). The datasets under `Mobilitätsdaten/` and the
API documentation under `Foodsharing API/` belong to the organisers and their
partners and are **not** covered by it.
