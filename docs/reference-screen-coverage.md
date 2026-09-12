# ReMain reference screen integration

Reference: https://claude.ai/code/artifact/96294c86-a93e-499d-82e9-5bf58ab08ae9
Branch: `feature/sperrmuell-shared-tours`.

The compact reference style is applied through the shared shell: cool paper, rounded white cards, blue actions, reward-only gold, consistent icons, curved navigation and sticky actions. Data, eligibility, booking limits and reward amounts come from the existing services rather than the illustration's sample values.

| Artboard | Connected implementation |
| --- | --- |
| Main | `/`: level progress, earned coins, scan, calendar, nearby quests/market/returns, city progress, notification entry and extra actions |
| Scan | `/scan`: camera/gallery, modes, classification, persistent result, additional-item basket and safe hazard routes |
| SofaDetail | `/erkannt/:photoId`: large photo, classification/correction, expandable reasoning, transport lookup, market and knowledge handoffs |
| SperrmuellBooking | `/abholung`: editable address summary, optional contact details, item basket, future shared periods, existing-booking match, capacity checks and confirmation sheet |
| RepairMarkt | `/markt` and `/markt/:id`: offers, category/distance filters, repair businesses, reservation, release, two-party handover and receipt |
| QuestsMap | `/quests`: map fitted to results, radius/status filters, selected quest first, claim, proof and route actions |
| QuestComplete | `/quests/:id/nachweis`: before/after comparison slider when both photos exist, upload, evidence signals, pending review, completion and receipt |
| LevelUp | Global modal after server-confirmed level increase, exactly-once +50 bonus and level-8 Klimaheld badge |
| PeerReview | `/review/:submissionId`: paired photos, three answers, anonymity, quorum and one-time reviewer reward |
| QuestRoute | `/route/:questId`: transport comparison, saved declared mode, claim/start, route details and proof handoff; mode used by ledger and receipt |
| Kalender | `/kalender`: month navigation, date selection/filtering, booked collections, detail links, cancellation and registration through notifications |
| WasMacheIchDamit | `/wissen`: scan category preserved, category picker, disposal rules, alternatives, collection date, source information and a three-question quiz with an exactly-once +10 bonus |
| EssenRetten | `/essen`: provider account/verification, filters, requests, pickups, history, receipts and connection retry |
| Mehrweg | `/mehrweg`: selectable active containers, return partner, return, repeat protection, all returned containers and receipts |
| Wirkung | `/wirkung`: four contribution cards, expandable underlying facts/receipts, city progress, badges and redemption |
| Stadtteile | `/stadtteile`: gap to leading district, season, own contribution, expandable full district table, real next-step links and signed invitation links rewarded after the new account’s first scored photo action |
| Belohnungen | `/belohnungen`: balance, eligibility, redemption confirmation, issued codes and refresh |
| Nachweis | `/nachweis/:actionId`: confirmed/input/estimated/simulated provenance, exact credit, declared transport, rules and retry |
| DesignSystem | Shared tokens, shell, cards, focus/touch targets, modal, safe-area handling and ReMain PWA branding |

Additional collection screens remain integrated: `/abholung/:pickupId`, `/mitteilungen`, `/touren`, `/integrationen`. The booking lifecycle includes item addition/removal, rescheduling, cancellation, reminders, request recovery, missed collection, driver planning and completion. Citizen views do not expose other households' manifests.

## Deliberate adaptations

- A collection reserves a shared period. Exact arrival information follows tour planning. It is not advertised as a live FES appointment.
- The existing three-item / 6 m³ limit remains authoritative.
- Five scored activities in a Berlin calendar week award +30 XP once. Each newly reached level awards +50 XP once; level 8 unlocks the Klimaheld badge. The quiz awards +10 XP once. A signed invitation earns its referrer +50 XP after a scored photo-linked action by the new account. Bonus rows have receipts but do not count as activities or consume daily action slots.
- Invitation links are copied for the user to share. No invitation is sent automatically.
- Route start records a declared transport mode and claims the quest. It does not record GPS or claim live turn-by-turn guidance. The same factors and deductions power preview, ledger and receipt; no separate car-only penalty is invented.
- FES remains explicitly simulated. Vytal now uses the real partner integration from main; a configured store token is required. Reminders are in-app. GTFS is the supplied historical service day, not live departures. Coupon codes remain simulated partner redemption.

## Verification

- `npm run build --prefix app`: TypeScript and production bundle.
- `npm test --prefix server`: 27 passing tests using isolated database flows covering collection lifecycle, market handover, quest journey/proof/quorum, receipt consistency, Vytal repeat protection, coupon balance, transport preview consistency, quiz/referral eligibility, milestone idempotency and transactional rollback.
- Read-only checks through the running Vite proxy: account, collections, notifications, quests, market, impact, coupons, mobility, foodsharing and Vytal return HTTP 200.
- Native browser checks: home, calendar day filtering, calendar-to-booking navigation, booking form/sticky footer, impact cards, quest selection and quest-to-route handoff, weekly goal popup and knowledge quiz popup.
- Live foodsharing writes and every camera/device combination were not exercised. No real rescue was reserved during verification.

Local setup restored the supplied foodsharing configuration in ignored `server/.env` and generated ignored GTFS data. Neither credentials nor generated data are part of the branch changes. The GTFS builder now supports macOS libarchive tar when 7-Zip is absent.

## Notification entry and market photographs

Collection opportunities and citizen booking shortcuts were removed from the dashboard. New collection requests start in notifications; calendar, knowledge and scan handoffs lead there, preserving query parameters and scan state. Existing booking deep links and in-progress basket scanning still work. Opportunity lookup has loading, retry and no-capacity states.

Repair-market cards and details prefer uploaded item photos. Missing or failed uploads use labeled category-example photographs for furniture, electrical appliances and bicycles. These are real photographs, not evidence of the advertised item. Unknown categories keep an explicit missing-photo state. Attribution and license links appear on the detail screen; asset provenance is in `app/public/images/market/CREDITS.md`.

Current verification: frontend build passes; downloaded JPEGs inspected. Native browser control failed to start, and a fresh Claude reference fetch returned only the frame shell. The earlier documented reference inspection and current flow code were used for this update; exact fresh visual parity is not claimed.

## Main integration verification

Merged `origin/main` at `1d0a06f` into the feature branch. Google/Firebase authentication, settings/theme/account controls, QR-based Vytal checkout/return and home food/return status are included. The compact reference UI, notifications-only collection entry, market photographs, shared tours and progression rewards remain.

Merge fixes preserve invitation binding for guest and new Google accounts, refresh rewards after Vytal returns, reject demo switching into real accounts or driver roles, and remove collection/progression/Vytal child records when deleting an account.

Validation: production build passed; 27 backend tests passed; `node scripts/vytal-selftest.mjs` passed every simulated-partner check. Both development servers restarted and existing SQLite data migrated without resetting it. Local Firebase configuration and `VYTAL_JWT` are absent, so live Google/Vytal operations were not verified. npm audit reports an existing high-severity `@fastify/static` advisory; its suggested fix is a major-version upgrade, left outside this merge.
