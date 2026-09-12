# Sperrmüll: implemented replacement

The Claude reference was inspected in native Chrome, including citizen and driver flows. The replacement adopts its shared-collection model and the application's existing Mainwasser design system. It remains an explicitly simulated FES service.

## Reference coverage

| Reference touchpoint | Implementation |
|---|---|
| Citizen / driver role selection | Existing citizen session; separate `/touren` driver demo. Provisioned driver sessions can access server-backed manifests. |
| Nearby collection notification | Shared-tour opportunity card only in `/mitteilungen`, based on current district availability. |
| Collection area and period | District-based collection periods; approximate area map on booking details. |
| Name, email, mobile, address, postcode | Prefilled name, address/district, optional contact fields and placement instructions. Stored with the request. |
| Camera and AI recognition | Existing working camera/upload and correction flow retained. Result now checks upcoming pickups; further scans can return to the basket. |
| Object list and removal | Up to three objects per draft, editable category/volume, removal and total-volume validation. More items can be added to a compatible existing booking subject to capacity. |
| Single request per address/window | Server checks existing own bookings by normalized address, district and date across object categories. Photo association and request IDs prevent duplicates. |
| Summary and request confirmation | Native accessible modal with basket total, address, collection period, cutoff and explicit simulation disclosure. |
| Waiting for shared planning | Persistent district/date tours collect requests until the displayed cutoff. Server plans due tours on request and every minute. |
| Later arrival window | Planned service window appears in personal booking details, calendar and a persistent notification. This is a model estimate, never a live ETA. |
| Citizen privacy | Personal detail and notifications require ownership; shared-tour data contains aggregate counts and only the owner's window, not other addresses. |
| Driver route / filters | `/touren` offers All / Booked / FES-stop filters and a schematic stop sequence. FES fixed-stop examples and distance comparisons are fictional demo data only. |
| Driver stop popup / completion | Stop sheet lists objects and contact/access details for authorized drivers; completion is persisted once and notifies the owner. Public demo completion affects local demo state only. |
| Lifecycle extras | Reschedule, cancellation, item removal, reminder preferences, local missed-collection report, booking receipt and notification deep links. |

## Behavioral guarantees

- A scan automatically checks existing future registrations. Missing addresses prompt the user to choose an existing pickup address or enter one; an available district truck is never treated as a registered pickup.
- When no existing booking fits, the earliest available collection period is selected. The final user action saves the request in ReMain. No live FES order is submitted.
- The backend enforces category eligibility, six cubic metres per booking, applicable large-device counts, shared vehicle capacity, booking ownership and future availability. Mixed eligible categories can share a booking.
- Bookings, item associations, idempotency records, notifications and rewards commit together. In-flight request IDs support recovery after an interrupted response.
- Shared tour capacity is modeled as 20 m³ and at most 21 stops. Planning uses a deterministic address order and 20-minute service windows; it is not a road-routing optimizer. These parameters are demo assumptions.
- Notification records act as a durable in-app queue. Optional reminders become visible the previous evening at 18:00 and collection morning at 06:00, Europe/Berlin. Rescheduling replaces future reminders, cancellation/completion suppresses them, and historical delivered notices remain.
- Collection is never inferred merely because its date passed. An authorized driver's explicit simulated completion triggers the collected state and notification.
- Registration snapshots preserve original receipt facts when items or dates later change. Existing bookings without item rows remain readable and migrate lazily on modification.
- Public demo session switching cannot switch into a driver account. Driver roles must be provisioned through a trusted administrative path; the existing lightweight session system is not production identity management.

## Verification

- `npm test --prefix server`: 15 integration tests cover date/DST boundaries, eligibility, matching, cross-user access, atomic booking/retries, item capacity, reminder lifecycle, rescheduling, cancellation, legacy rows, mixed-object baskets, shared-tour privacy, driver authorization/completion, request recovery and vehicle capacity.
- `npm run build --prefix app`: TypeScript and production bundle pass. Vite retains its large-bundle advisory.
- Native Chrome: inspected the reference; exercised the replacement's manual booking, confirmation dialog, saved tour details/map, notification deep link and reminder preference dialog against an isolated preview database. Camera permission, real image recognition, mobile-device layouts, and external notification delivery were not exercised by these checks.
- Standard server startup was blocked by absent `server/data/districts.json` in this checkout. A temporary preview harness seeded district fixtures from `app/src/lib/frankfurt.ts` into `/tmp`, without changing application data.

## Remaining external-service boundaries

No live FES connection, provider-confirmed booking, verified road optimization, truck GPS, browser push, email or SMS delivery is included. Maps show approximate district areas; driver route graphics are schematic. The UI labels these limitations. Live provider availability, address resolution, routing/status callbacks and delivery infrastructure are required to replace the simulated adapters.

The local preview is available while its process runs at `http://127.0.0.1:8088/abholung?category=moebel&volume=1`.
