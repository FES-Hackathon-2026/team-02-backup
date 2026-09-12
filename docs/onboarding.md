# Splash and onboarding

The startup splash uses a rotating return loop around the existing leaf icon. It appears once per app load for 1.4 seconds, or until session loading finishes if that takes longer. Reduced-motion users have no extra delay or animation. Navigation inside the app does not restart the animation.

Onboarding currently appears on every launch or full refresh, including for signed-in users. It ignores previously saved completion. Next, Back, progress dots and Skip are native buttons. Completing or skipping dismisses it until the next launch; navigation within the app does not show it again. The introduction does not change the URL, so invitation parameters and deep links survive. Signed-in users continue to their destination; signed-out users continue to sign-in.

Settings → View introduction replays all three steps and returns to Settings. German and English use the existing language picker and reviewed catalog; all colors follow the current theme. Illustrations use local SVG and the existing icon family, with no remote image dependency.

Validation: production build, localization suite and `npm run test:onboarding --prefix app` pass. The onboarding suite verifies stored completion, blocked storage, bilingual initial rendering, progress semantics and splash accessibility. Browser control was unavailable; visual review and interactive navigation on devices remain unverified.
