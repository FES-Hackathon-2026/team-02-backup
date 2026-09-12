# Splash and onboarding

The startup splash uses the ReMain mark: a reusable box inside blue-and-gold returning arrows. The arrows rotate around the box. It appears once per app load for 1.4 seconds, or until session loading finishes if that takes longer. Reduced-motion users have no extra delay or animation. Navigation inside the app does not restart the animation.

The introduction has three steps: Scan, Pass it on, and Plan a collection. Each uses a short heading and one sentence. Completion is saved under `remain.introduced.v2`, so existing users see the revised introduction once. Add `?onboarding=1` to replay on every full refresh of that URL. Next, Back, progress dots and Skip are native buttons. The introduction does not change the URL, so invitation parameters and deep links survive. Signed-in users continue to their destination; signed-out users continue to Google sign-in.

German and English use the existing language picker and reviewed catalog; screen colors follow the current theme. Illustrations use local SVG and the existing icon family, with no remote image dependency.

The splash, onboarding header and sign-in share `app/src/assets/remain-mark.svg`. Run `npm run icons --prefix app` after changing it to regenerate the favicon, Android/PWA icons and Apple touch icon. Manifest and HTML icon references include a cache version; increment it when replacing the artwork.

Validation commands: production build, localization suite and `npm run test:onboarding --prefix app`. The onboarding suite checks the legacy completion helper, blocked storage, bilingual initial rendering, progress semantics and splash accessibility. Browser control was unavailable; interactive navigation on devices remains unverified.
