# Sperrmüll replacement plan

Status: implemented with the reference coverage and service limits recorded in `sperrmuell-implementation.md`. The original delivery plan below is retained for context.

## Reference and scope

Requested reference: https://claude.ai/code/artifact/03f52f7c-33ef-41a5-9fae-50848a3b9445?via=auto_preview

The initial HTTP fetch returned only the Claude frame shell. During implementation, native Chrome made the artifact accessible. Both citizen and driver journeys were inspected: collection notification, area, contact details, photo recognition, basket, request summary, later tour/ETA, driver filters, and stop completion. Shared-tour support was added to the original plan accordingly.

Replace the current Sperrmüll experience end to end. Interpret “transport” as a collection service for the scanned object. Automatically check future collections; reuse an eligible booking when possible, otherwise prepare the earliest eligible new booking. Preserve the existing final booking confirmation until automatic booking preferences and required address/contact data are explicitly configured in the product.

## Current implementation

- `app/src/screens/Scan.tsx` uploads a photo, calls `/api/scan`, and opens `/erkannt/:photoId`.
- `Erkannt.tsx` displays classification, correction, estimates, and recommended routes. It does not resolve upcoming collections.
- `Abholung.tsx` reads category/volume prefill, asks for address and district, loads slots, books, and displays confirmation. Normalize scan context: result navigation passes `{ scan }`, while this screen also supports flat state/query prefill.
- `Kalender.tsx` displays collection dates and personal bookings and supports cancellation.
- `server/src/routes/fes.js` exposes categories, slots, booking, personal pickups, cancellation, and calendar data. Booking creates a reward through the central award engine.
- `server/src/integrations/fes/pickup.js` simulates dates, capacity, booking references, and collection constraints. These are not live FES confirmations. `INTEGRATION.md` records missing provider capabilities.
- `server/src/schema.sql` stores single-category pickups with booked/cancelled/collected status. New item associations and lifecycle events are needed.
- No persisted collection notification pipeline was found in the inspected app/server source.

## Target scan-to-collection flow

1. Scan or upload an object. Preserve photo ID, category, confidence, volume, and optional location across reloads.
2. Show the object result immediately with a separate “Abholung wird geprüft …” card. A transport lookup failure must not discard recognition.
3. Ask for missing pickup address; GPS or district alone does not establish a collection address. Allow category and volume correction; either correction invalidates the previous match.
4. Resolve eligibility and future transport using server time and Europe/Berlin display dates. Check verified address/service area, object category, combined volume, item limits, booking cutoff, status, and provider capability.
5. If this object already belongs to an active booking, show that booking and its date/window. Do not create another booking or award.
6. If a compatible personal future booking exists, show its details and offer to add the object. Confirm provider support and capacity before committing the update. A truck visiting the district does not mean the object is registered for pickup.
7. If no compatible booking exists, preselect the earliest bookable slot and open the prefilled booking review. Show alternatives. Submit after required details and the final confirmation, or under a previously configured automatic-booking preference.
8. Persist success and open booking details with reference, items, address, date/window, preparation instructions, reminder controls, and calendar link. Provider timeouts remain “confirmation pending” until reconciled.
9. Keep home, calendar, booking detail, notifications, and receipt consistent through reschedule, cancellation, completion, or collection problems.

Proposed lookup horizon: next 90 days, provider-configurable. Search beyond that on explicit request. “No suitable transport” and “service unavailable” must be separate results; neither means a booking succeeded.

## Touchpoint inventory

| Touchpoint | Planned change |
|---|---|
| Home (`Start.tsx`) | Upcoming pickup card, date/window, status, outstanding action, booking detail link |
| Scan (`Scan.tsx`) | Durable scan identity and booking context; preserve camera/upload failure recovery |
| Result (`Erkannt.tsx`) | Upcoming-transport card, checking/matched/no-match/error states, correction-triggered refresh |
| Booking (`Abholung.tsx`) | Replace long form with prefilled object/address/transport review and persistent draft |
| Booking detail (new) | Reloadable `/abholung/:pickupId`, item list, reference, preparation, reminders, lifecycle actions |
| Calendar (`Kalender.tsx`) | Distinguish personal booking from general collection schedule; link exact booking; reflect updates |
| Navigation (`App.tsx`) | Booking detail and notification deep links; preserve `/abholung` and existing scan links |
| Notifications (new) | Persistent inbox, unread state, event details, deep links, optional push settings |
| Knowledge (`Wissen.tsx`) | Route unsupported categories to relevant alternatives without losing scan context |
| Marketplace (`Markt.tsx`) | Preserve reuse alternative; item given away can be removed from booking, with explicit cancellation if booking becomes empty |
| Rewards / impact / receipts | Preserve central award rules, provenance, deduplication, and receipt links; booking is not proof of completed collection |
| Integration status | Clearly expose simulated versus live service, availability, and data freshness |

## Popup and feedback inventory

Use inline feedback for routine status, sheets for decisions, and toasts for brief acknowledgements. Every proposed interaction below must later be compared against the supplied artifact.

| Trigger | Surface and content | Action / recovery |
|---|---|---|
| Missing address | Address sheet with district and pickup location | Save and rerun lookup; manual entry if location denied |
| Uncertain classification | Object correction sheet, photo and editable category/volume | Confirm and rerun eligibility |
| Matching future booking | Transport detail sheet with date/window, items, capacity, source | Add object or choose another date |
| Object already registered | Existing booking card | Open booking; no duplicate write |
| No compatible booking | Prefilled booking sheet, earliest date and alternatives | Review details and book |
| Required details missing | Field-level errors | Keep draft and focus first invalid field |
| Booking submission | Progress state; disable repeat submit | Recover by request ID after reconnect |
| Booking succeeds | Confirmation sheet with reference and instructions | Open detail, calendar, reminder preference |
| Slot expires / capacity changes | Conflict sheet with refreshed options | Select replacement; preserve object/address |
| No available slots | Empty-state card | Change date range or use supported alternative |
| Provider failure | Inline error with freshness information | Retry; never treat error as no-match |
| Booking outcome unknown | Pending confirmation card | Check status; no blind duplicate submission |
| Unsupported object / excessive volume | Explanation card and appropriate service link | Correct category or use alternative |
| Reschedule | Date selection and confirmation sheet | Commit only after replacement accepted; preserve old booking on failure |
| Cancel / remove last item | Confirmation dialog stating booking and reminder effects | Cancel or keep booking; show cutoff errors |
| Reminder setup | Timing/channel preference sheet | Optional browser permission after user chooses push |
| Missed collection | Problem sheet with available provider actions | Report issue; distinguish report received from resolved |
| Unsaved edits | Discard confirmation only when needed | Keep editing or discard |

Dialogs require focus trapping, Escape dismissal where safe, restored focus, readable titles, screen-reader announcements, and one active modal at a time.

## Notifications

Persist transactional events: booking confirmed, item added, date changed, cancellation confirmed, provider delay/cancellation, collection completed, and collection issue update. Emit only from confirmed state transitions. Never infer completion because a date passed. Support opted-in preparation and collection reminders; proposed defaults are previous evening and collection morning, adjusted to provider instructions and cutoff.

Use a durable notification outbox written with the booking transition, a retrying dispatcher, delivery deduplication, and unread/read storage. Event key includes booking ID, event type, and booking version. Rescheduling invalidates old reminders; cancellation suppresses future reminders. Reopening the app loads missed events. Unsupported or denied push leaves the in-app inbox functional. Push requires a service worker and subscription lifecycle; email/SMS are outside scope unless requested.

## Backend and data changes

- Add a transport resolver service separate from image recognition. Proposed `POST /api/fes/resolve` takes `photoId`, confirmed address, category, and volume; returns `needs_input`, `ineligible`, `already_booked`, `existing_booking`, `available_slots`, `no_availability`, or `unavailable`, plus reasons, timestamps, and source. Read-only resolution never books.
- Extend the provider adapter for address resolution, category-aware availability, booking item updates, rescheduling, and status reconciliation. Unsupported capabilities must be explicit. Keep simulation available and visibly labeled until a live provider integration exists.
- Extend pickups with provider identity/reference, normalized address, service window/time zone, version, request key, and pending/failure lifecycle states. Introduce pickup items linked to scans, booking events, notification preferences, notifications, and an outbox. Index owner/status/date and event/request keys.
- Extend booking writes with idempotency keys; add booking detail, item update, reschedule, and status endpoints. Revalidate availability on every write. Check ownership for all booking/scan access. Concurrent tabs must not reserve the same scanned object twice.
- External provider calls and local transactions need reconciliation: reserve an operation locally, call provider, then commit its result and outbox; recover ambiguous timeouts by provider request/reference lookup.
- Preserve historical pickups and receipts through additive migrations. Existing single-category rows become legacy items with no required scan link.
- Extend `app/src/lib/client.ts` with typed resolver, booking, item, and notification contracts; use shared invalidation for home/calendar/detail/session after mutations.
- Keep reward creation in `engine/award.js`. Reusing or updating a booking must not create duplicate XP. Preserve existing append-only cancellation policy and distinguish estimates, simulated outcomes, and provider confirmations.

## Design alignment

Use existing `Screen`, `Icon`, `Tag`, `Label`, card/button/chip classes, and sheet styling. Follow `app/src/styles/tokens.css`: Mainwasser pastel blue, cool paper, navy text, 18px card radius, existing typography and spacing. Gold remains reserved for rewards. Keep light theme default and test opt-in dark theme. Adopt the artifact's verified interaction structure once available, adapting its visual styling to these tokens.

Use one prominent transport card and one primary action per step, German product copy, clear absolute dates plus optional relative timing, and provider windows instead of invented precise truck ETAs. Preserve mobile safe areas and sticky action placement; test narrow screens, zoom, long addresses, keyboard operation, loading, empty, error, and disabled states.

## Delivery sequence

1. Reference reconciliation: obtain rendered artifact/export, inventory every screen/action/popup, and map each against this plan. Resolve any differences in automatic-booking behavior.
2. Domain foundation: migrations, typed states, resolver, provider capability boundary, idempotency, item association, lifecycle reconciliation.
3. Main flow: scan result transport resolution, replacement booking experience, booking detail, refresh-safe drafts and deep links.
4. Connected surfaces: home, calendar, reuse/knowledge paths, integration status, rewards and receipts.
5. Notifications: outbox/worker, inbox, reminder preferences, optional push, cancellation/reschedule suppression.
6. Verification and rollout: targeted domain/integration tests, end-to-end flow checks, reference interaction checklist, responsive/accessibility visual review, then enable new flow behind a flag. Keep existing routes and migrated data usable during rollback; only retire old components after parity review.

## Acceptance checks

- Suitable future booking appears after scan; adding the object persists exactly once and does not create a new booking.
- No suitable booking opens the earliest eligible booking flow; successful provider acceptance creates exactly one booking, receipt, and notification event.
- Merely available transport is never displayed as a registered collection; simulated dates never display as provider-confirmed.
- Missing address, denied camera/location, uncertain category, hazardous/unsupported items, excessive volume, no slots, and offline lookup each have a working recovery path.
- Matching excludes past/cancelled/incompatible bookings and accounts for combined item volume, cutoffs, and Europe/Berlin midnight/DST boundaries.
- Duplicate scans, repeated clicks, concurrent tabs, stale slots, and ambiguous provider timeouts cannot create duplicate bookings or rewards.
- Refresh/back navigation restores correct object and booking context; users cannot access another user's booking or notification.
- Reschedule failure preserves original booking; success updates all surfaces and replaces reminders. Cancellation removes scheduled reminders without erasing historical receipts.
- Completion notifications require a real provider event or explicitly labeled user report, never elapsed time alone.
- Push refusal leaves in-app notifications usable; retries and worker restarts do not duplicate visible events.
- Existing non-Sperrmüll scan routes, calendar fractions, and historical booking/receipt links still work.
- Run frontend typecheck/build and add focused backend/integration tests for the new domain behavior. No automated checks were run for this planning-only document.

Outstanding dependency: live future transport and actual booking require an authorized provider API with address, availability, booking, and status capabilities; current simulated adapter cannot supply those guarantees.
