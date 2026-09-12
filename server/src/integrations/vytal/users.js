import { now, one, run } from '../../db.js'
import * as api from './client.js'

/**
 * Registering a ReMain person with Vytal.
 *
 * Vytal's endpoint is `ReferencedAnonUser/Create`, and the documentation is
 * blunt about it: "This Endpoint should be called only once per user." There
 * is no lookup-by-reference to recover from calling it twice — a second call
 * mints a second Vytal user, and the containers the first one is holding
 * simply stop being visible to us. So the UUID is written to `vytal_users`
 * and that row, not the API, is the source of truth from then on.
 *
 * Registration is lazy. Nobody is enrolled with a partner because they opened
 * the app; the account appears the first time someone actually scans a
 * container, which is also the first moment it is any use.
 *
 * What crosses the wire is `remain-<id>` and nothing else. Not a name, not a
 * mail address, not the Google account behind it — Vytal calls these users
 * anonymous and we keep them that way. A hyphen rather than the `remain:<id>`
 * used elsewhere in the app, because this string ends up in a URL query and a
 * colon there is a needless argument with somebody's parser.
 */

export const referenceFor = (userId) => `remain-${userId}`

/**
 * The one refusal worth naming.
 *
 * It blocked the whole integration for a day and the diagnosis is worth
 * keeping, because the error names the wrong thing. The first FES demo token
 * answered 400 `ServiceNameRequired` however the service was passed — query,
 * body, header, all four spellings — while every *other* endpoint accepted it
 * happily. Nothing in the request was at fault: the JWT carried
 * `service: "other"`, and this endpoint alone insists on a registered service
 * name. Vytal reissued the token on 12.09.2026 with `service: "qnips"` and
 * registration started working with no change on our side.
 *
 * So if this fires again, do not go looking through this file. Decode the JWT
 * payload, read the `service` claim, and ask Vytal for a new token. That is
 * what the message says, because "die Anfrage passt nicht zu dem, was Vytal
 * erwartet" would be both true and completely useless.
 */
function explain(body) {
  if (!body?.errors?.includes?.('ServiceNameRequired')) return null
  return new api.VytalError(
    502,
    'service_name_required',
    'Der Vytal-Token ist nicht für die Konto-Anlage freigeschaltet (ServiceNameRequired). Das kann nur Vytal am Token ändern — bis dahin bleibt Mehrweg gesperrt.',
    body,
  )
}

/** The stored Vytal UUID for one of our users, or null if never registered. */
export function vytalUserId(userId) {
  const row = one('SELECT vytal_user_id AS id FROM vytal_users WHERE user_id = ?', userId)
  return row?.id ?? null
}

/**
 * The Vytal UUID for this person, registering them if this is the first time.
 *
 * Races are settled by the table rather than by a lock: two simultaneous
 * first scans can both call Vytal, but only the first `INSERT` survives the
 * primary key and both callers then read back the same row. That wastes one
 * anonymous user on Vytal's side and keeps ours consistent, which is the
 * right way round — a duplicate row here would be the expensive mistake.
 */
export async function ensureVytalUser(userId) {
  const existing = vytalUserId(userId)
  if (existing) return existing

  const reference = referenceFor(userId)

  let answer
  try {
    answer = await api.createAnonUser(reference)
  } catch (error) {
    // A refusal arrives as a non-2xx, so `call()` has already turned it into
    // a VytalError and the body is in `detail`. Re-read it here: this one
    // failure mode is worth naming precisely (see below), and the generic
    // "die Anfrage passt nicht" would send somebody hunting through our code
    // for a bug that is not there.
    throw explain(error?.detail ?? null) ?? error
  }

  const minted = answer?.userId
  if (!answer?.success || !minted) {
    const named = explain(answer)
    if (named) throw named
    throw new api.VytalError(
      502,
      'registration_failed',
      'Vytal konnte kein Konto für dich anlegen.',
      answer,
    )
  }

  run(
    `INSERT INTO vytal_users (user_id, vytal_user_id, reference, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
    userId,
    minted,
    reference,
    now(),
  )

  // Read back rather than returning `minted`: if a parallel request won the
  // insert, its UUID is the one every later call has to use.
  return vytalUserId(userId) ?? minted
}
