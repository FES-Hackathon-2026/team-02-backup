# Splash and onboarding

The startup splash uses a rotating return loop around the existing leaf icon. It appears once per app load for 1.4 seconds, or until session loading finishes if that takes longer. Reduced-motion users have no extra delay or animation. Navigation inside the app does not restart the animation.

New signed-out visitors see three illustrated screens covering scanning, the repair market and collection notifications. Next, Back, progress dots and Skip are native buttons. Completing or skipping saves `remain.onboarding.v1` on this device. When storage is blocked, completion remains in memory. Existing signed-in users go straight to their destination. The introduction does not change the URL, so invitation parameters and deep links survive.

Settings → View introduction replays all three steps and returns to Settings. German and English use the existing language picker and reviewed catalog; all colors follow the current theme. Illustrations use local SVG and the existing icon family, with no remote image dependency.

Validation: production build, localization suite and `npm run test:onboarding --prefix app` pass. The onboarding suite verifies stored completion, blocked storage, bilingual initial rendering, progress semantics and splash accessibility. Browser control was unavailable; visual review and interactive navigation on devices remain unverified.
