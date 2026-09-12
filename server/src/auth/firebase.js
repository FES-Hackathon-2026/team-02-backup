import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'

/**
 * Firebase ID token verification — without the Admin SDK.
 *
 * A Firebase ID token is a plain RS256 JWT that Google signs with a rotating
 * key pair whose PUBLIC half is published. Verifying one therefore needs no
 * credential of ours at all: only the project id, which is public anyway
 * (it ships in the client bundle). That is why there is no service-account
 * JSON anywhere in this repo — nothing to leak, nothing to rotate, nothing
 * to forget in a dashboard.
 *
 * What we check, per
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 *
 *   alg        RS256, and the key must be one Google currently publishes
 *   iss        https://securetoken.google.com/<project-id>
 *   aud        <project-id>
 *   exp / iat  unexpired, not issued in the future
 *   auth_time  the sign-in already happened
 *   sub        non-empty — this is the stable user id
 *
 * `jose` caches the key set and refetches only when it sees an unknown `kid`,
 * so this costs one network call per key rotation, not one per sign-in.
 */

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || ''

/** Built once, lazily: no network traffic on a server that never sees a token. */
let jwks = null

/** True when the server is configured to accept Google sign-ins. */
export const firebaseEnabled = () => projectId !== ''

export const firebaseProjectId = () => projectId

/** Thrown for every rejection, so the route never leaks jose's internals. */
export class TokenError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TokenError'
  }
}

/**
 * Turns a jose failure into a sentence that names the actual mistake.
 *
 * The default was `ERR_JWT_CLAIM_VALIDATION_FAILED`, which is true and
 * useless: it is the same code whether the projects disagree, the clock is
 * wrong, or the token is an hour old. The project mismatch is the one
 * everybody hits — two ids in two different files, one of them usually a
 * server that was not restarted — and it is invisible from the code alone.
 *
 * `aud` is read back with decodeJwt, which does NOT verify anything. That is
 * fine here: this runs only after verification already failed, and the value
 * is used for one error message, never for a decision.
 *
 * Exported only so a test can hand it a real jose error: a self-signed token
 * fails at the signature stage and never reaches the claim check.
 */
export function explainVerifyFailure(error, idToken) {
  const code = error?.code ?? 'unknown'

  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && (error.claim === 'aud' || error.claim === 'iss')) {
    let got = 'unbekannt'
    try {
      const claims = decodeJwt(idToken)
      got = (Array.isArray(claims.aud) ? claims.aud[0] : claims.aud) ?? 'unbekannt'
    } catch {
      /* unreadable token — the generic half of the sentence still holds */
    }
    return (
      `Das Token gehört zu einem anderen Firebase-Projekt: angemeldet wurde bei „${got}", ` +
      `der Server erwartet „${projectId}". Beide müssen gleich sein — ` +
      `VITE_FIREBASE_PROJECT_ID in app/.env und FIREBASE_PROJECT_ID in server/.env. ` +
      `Danach den Server NEU STARTEN; er liest die Projekt-ID nur beim Start.`
    )
  }

  if (code === 'ERR_JWT_EXPIRED') {
    return 'Das Anmelde-Token ist abgelaufen. Bitte noch einmal anmelden.'
  }

  if (code === 'ERR_JWKS_NO_MATCHING_KEY' || code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
    return 'Die Signatur des Anmelde-Tokens stammt nicht von Google.'
  }

  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    return `Das Anmelde-Token ist ungültig (Feld „${error.claim ?? '?'}").`
  }

  return `Das Anmelde-Token ist ungültig (${code}).`
}

/**
 * Verifies an ID token and returns the profile inside it.
 * Throws TokenError on anything that is not a valid, current token.
 */
export async function verifyIdToken(idToken) {
  if (!firebaseEnabled()) {
    throw new TokenError('FIREBASE_PROJECT_ID ist auf dem Server nicht gesetzt.')
  }
  if (typeof idToken !== 'string' || idToken.length < 20) {
    throw new TokenError('Kein Anmelde-Token übermittelt.')
  }

  jwks ??= createRemoteJWKSet(new URL(JWKS_URL))

  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, jwks, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      // A little slack absorbs a phone whose clock is a few seconds out.
      clockTolerance: 30,
    }))
  } catch (error) {
    throw new TokenError(explainVerifyFailure(error, idToken))
  }

  // jose checks exp/nbf/iss/aud/alg. These three it does not know about.
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new TokenError('Das Anmelde-Token enthält keine Nutzer-ID.')
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + 30) {
    throw new TokenError('Das Anmelde-Token ist noch nicht gültig.')
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    /** 'google.com' for a Google sign-in — recorded so the UI can name it. */
    signInProvider: payload.firebase?.sign_in_provider ?? 'unknown',
  }
}
