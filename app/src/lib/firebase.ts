/**
 * Google sign-in, via Firebase Authentication.
 *
 * Everything Firebase is behind this file and behind a dynamic `import()`.
 * Two reasons:
 *
 *   1. The SDK is ~200 kB of JavaScript that only matters to somebody who
 *      presses the Google button. Loading it lazily keeps the first paint —
 *      the thing a judge with a phone actually waits for — unaffected.
 *   2. A build with no Firebase project configured must still run. Nothing
 *      here is imported at module scope, so an unconfigured deployment never
 *      downloads the SDK at all and shows a disabled Google sign-in button.
 *
 * The config values below are PUBLIC by design. A Firebase web config is an
 * address, not a credential — Google's docs say so explicitly. What protects
 * the account is the authorised-domain list in the console plus the server
 * verifying every ID token (server/src/auth/firebase.js). So VITE_ prefixes
 * are correct here, unlike everything in server/.env.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  // Only needed by other Firebase products; harmless and keeps the console's
  // copy-paste snippet working verbatim.
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
}

/** True when this build has enough config to attempt a Google sign-in. */
export const firebaseConfigured: boolean =
  config.apiKey !== '' && config.authDomain !== '' && config.projectId !== ''

/** Anything the user should read rather than a raw Firebase error code. */
export class SignInError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Two crumbs in localStorage, so the common load never touches the SDK.
 *
 * REDIRECT  a redirect sign-in is in flight; the answer is waiting on the
 *           next load. Without this we would have to call getRedirectResult
 *           every single time, which means downloading the SDK every single
 *           time — exactly what the lazy import is here to avoid.
 * ACTIVE    this device has a live Firebase session, so signing out has to
 *           clear Google's half too even on a load that never opened it.
 */
const REDIRECT_KEY = 'remain.googleRedirect'
const ACTIVE_KEY = 'remain.googleActive'

/** Private mode and locked-down browsers throw on access, not just return null. */
function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function setFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable — sign-in still works, it just cannot be resumed */
  }
}

/** Loaded once, then reused — a second sign-in does not refetch the SDK. */
let authPromise: Promise<import('firebase/auth').Auth> | null = null

async function getAuthInstance() {
  authPromise ??= (async () => {
    const [{ initializeApp, getApps, getApp }, { getAuth, setPersistence, browserLocalPersistence }] =
      await Promise.all([import('firebase/app'), import('firebase/auth')])

    // getApps() guards against React 18 StrictMode mounting twice in dev.
    const app = getApps().length > 0 ? getApp() : initializeApp(config)
    const auth = getAuth(app)
    auth.useDeviceLanguage()

    // Survives a reload, which is what makes the redirect fallback below
    // able to finish what it started.
    await setPersistence(auth, browserLocalPersistence).catch(() => undefined)
    return auth
  })()
  return authPromise
}

/**
 * German for the handful of Firebase codes a real person can actually hit.
 * Everything else falls through with its code attached, which is what makes
 * a bug report useful.
 */
function describe(code: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Die Anmeldung wurde abgebrochen.'
    case 'auth/network-request-failed':
      return 'Keine Verbindung zu Google. Bitte Netz prüfen und nochmal versuchen.'
    case 'auth/unauthorized-domain':
      return 'Diese Adresse ist in der Firebase-Konsole nicht freigegeben (Authentication → Settings → Authorized domains).'
    case 'auth/operation-not-allowed':
      return 'Google-Anmeldung ist im Firebase-Projekt nicht aktiviert (Authentication → Sign-in method).'
    case 'auth/account-exists-with-different-credential':
      return 'Zu dieser E-Mail gibt es schon ein Konto mit einem anderen Anmeldeweg.'
    default:
      return `Die Anmeldung bei Google ist fehlgeschlagen (${code}).`
  }
}

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'auth/unknown'

/**
 * Signs in with Google and returns a fresh ID token for the server.
 *
 * Popup first. The redirect flow is the documented fallback, but it is also
 * the one that breaks on Safari and Firefox when the auth handler lives on
 * `<project>.firebaseapp.com`, because the browser blocks storage on a
 * third-party domain mid-flow. So we only fall back when the popup itself
 * could not open — a blocked pop-up or a webview that has none.
 */
export async function signInWithGoogle(): Promise<string> {
  if (!firebaseConfigured) {
    throw new SignInError(
      'app/not-configured',
      'Google-Anmeldung ist in diesem Build nicht eingerichtet (VITE_FIREBASE_* fehlen).',
    )
  }

  const auth = await getAuthInstance()
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth')

  const provider = new GoogleAuthProvider()
  // Always ask which account, instead of silently reusing the one Google
  // happens to consider current. On a shared demo phone that matters.
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const credential = await signInWithPopup(auth, provider)
    setFlag(ACTIVE_KEY, true)
    return await credential.user.getIdToken()
  } catch (error) {
    const code = codeOf(error)

    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      setFlag(REDIRECT_KEY, true)
      // Navigates away. The answer arrives in consumeRedirectResult() on the
      // next load, so nothing after this line runs — the promise that never
      // settles keeps the button in its busy state while the page leaves.
      try {
        await signInWithRedirect(auth, provider)
      } catch (redirectError) {
        setFlag(REDIRECT_KEY, false)
        const redirectCode = codeOf(redirectError)
        throw new SignInError(redirectCode, describe(redirectCode))
      }
      return await new Promise<string>(() => {})
    }
    throw new SignInError(code, describe(code))
  }
}

/** True when the last load started a redirect sign-in that has not landed yet. */
export const redirectPending = (): boolean => firebaseConfigured && flag(REDIRECT_KEY)

/**
 * Picks up a sign-in that finished by redirect. Returns the ID token, or
 * null when this load is an ordinary one.
 *
 * Cheap to call on every load: without a pending redirect it returns before
 * importing anything.
 */
export async function consumeRedirectResult(): Promise<string | null> {
  if (!redirectPending()) return null
  setFlag(REDIRECT_KEY, false)
  try {
    const auth = await getAuthInstance()
    const { getRedirectResult } = await import('firebase/auth')
    const credential = await getRedirectResult(auth)
    if (!credential) return null
    setFlag(ACTIVE_KEY, true)
    return await credential.user.getIdToken()
  } catch {
    // A failed redirect must never keep the app from starting; the login
    // screen simply appears and the person can press the button again.
    return null
  }
}

/**
 * Ends the Firebase half of the session.
 *
 * Signing out of our server but not out of Firebase is the classic logout
 * bug: the cookie is gone, yet Google still considers the device signed in.
 * Both halves, always — including on a load that never opened the SDK,
 * which is what the ACTIVE flag is for.
 */
export async function signOutOfGoogle(): Promise<void> {
  if (!firebaseConfigured) return
  if (authPromise === null && !flag(ACTIVE_KEY)) return

  setFlag(ACTIVE_KEY, false)
  setFlag(REDIRECT_KEY, false)
  try {
    const auth = await getAuthInstance()
    const { signOut } = await import('firebase/auth')
    await signOut(auth)
  } catch {
    /* the server cookie is already gone — this device is signed out either way */
  }
}
