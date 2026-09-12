# German and English

Choose **Einstellungen → Sprache → Sprache der App**, or use the language selector on sign-in. German remains the default. The choice is saved in `remain.language` on this device, applies immediately, survives reload/sign-out and synchronizes across tabs. When local storage is unavailable, the choice remains active in memory.

## Implementation

- `app/src/lib/i18n.ts` owns the language store, React subscription, locale selection, interpolation and presentation translation. Switching languages rerenders the existing component tree without changing route keys, clearing form drafts or rewriting API data.
- Screen copy, dialogs, menu labels, accessibility labels, placeholders and known system responses are translated where they render. Values submitted to APIs, category IDs, references, addresses, names and user-authored posts remain canonical. Dynamic values are not evaluated as markup.
- `de.json` records German source messages; `en.json` provides English translations; `en.reviewed.json` overrides reviewed terminology and important flows. The initial broad catalog was generated locally with Argos Translate, then core UI, account deletion, collections and notifications were reviewed. No translation service receives application/user data at runtime.
- Dates and numbers use `de-DE` / `en-GB`. Calendar weekdays, notification timestamps and system collection date labels also follow the language. Frankfurt collection times remain Europe/Berlin.
- The document language is updated. Browser auto-translation is disabled for the app to avoid double translation.
- Original external/provider prose, free-form scan explanations not found in the system catalog, proper names and user content retain their original language. New system messages should be added to the catalogs; unknown strings fall back to their source rather than disappearing.

## Updating translations

Run `node scripts/extract-i18n.mjs` after changing system copy. Add English entries for new German keys; use `en.reviewed.json` for editorial corrections. Render copy with `t(...)`, including accessible labels. Do not translate IDs or API payloads. Do not translate a component's already-localized text again when it can contain user content.

Run `npm run test:i18n --prefix app` and `npm run build --prefix app`. Localization tests cover both languages, rendered navigation and language picker, persistence/storage failure/cross-tab changes, preserved interpolation values, HTML escaping, canonical option values, notification/date translation and catalog coverage. Existing backend workflows are checked with `npm test --prefix server`.

Validation: 10 localization checks, 28 backend tests and production build pass. Native browser control was unavailable during this task, so interactive visual checks on every screen/device remain unverified.
