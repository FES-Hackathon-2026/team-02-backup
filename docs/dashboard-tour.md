# Dashboard tour

On the first dashboard visit for each user on this device, a six-step tour highlights the actual camera, notifications, quests, market, impact and settings controls. Next advances the spotlight, Back revisits the previous step, and Skip, Escape or Got it finish the tour. No route or action is triggered while explaining a control.

Completion is stored under `remain.dashboard-tour.v1.<user-id>`; blocked storage falls back to in-memory completion. This is separate from the introductory onboarding shown once per device. The dashboard's “Show dashboard tour” button can still replay the tour manually.

The tour uses a native modal dialog to keep background controls inert and keyboard focus within the tour. It restores prior focus and scrolling on close. Position follows target bounds and card size on resize/scroll. Reduced motion disables spotlight transitions. All copy uses the German/English catalogs and the card uses the active theme.

Validation: production build and localization checks pass. `npm run test:dashboard-tour --prefix app` checks per-user completion, storage restoration/failure and card positioning around top/bottom controls at mobile and desktop viewport sizes. Interactive browser and device verification remains outstanding because browser control is unavailable.
