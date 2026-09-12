/**
 * foodsharing proxy.
 *
 * The team key used to be compiled into the browser bundle as
 * VITE_FS_API_KEY, which made it readable by anyone who opened the site.
 * It lives in server/.env now and never leaves this process.
 *
 * This is a thin pass-through on purpose: the foodsharing API is the one
 * genuinely live partner interface we have, and the app should see its real
 * status codes — 403 for a missing verification, 409 for a taken basket —
 * rather than something we smoothed over.
 */
const BASE = process.env.FS_API_BASE ?? 'https://app-foodsharing-hackathon.azurewebsites.net'
const KEY = process.env.FS_API_KEY ?? ''

/** Only these prefixes are reachable through us. */
const ALLOWED = [
  '/food-share-points',
  '/baskets',
  '/businesses',
  '/pickups',
  '/users',
]

export default async function foodRoutes(app) {
  app.all('/api/food/*', async (request, reply) => {
    if (!KEY) {
      return reply.code(503).send({
        error: 'no_key',
        message: 'Auf dem Server ist kein foodsharing-Schlüssel hinterlegt (FS_API_KEY).',
      })
    }

    const path = '/' + (request.params['*'] ?? '')
    if (!ALLOWED.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))) {
      return reply.code(404).send({ error: 'not_proxied', path })
    }

    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''
    const target = `${BASE}${path}${query}`

    const headers = { 'X-API-Key': KEY, Accept: 'application/json' }
    // Which of the team's two test users is acting. Safe to forward: it only
    // selects between users that belong to this key.
    const actingUser = request.headers['x-user-id']
    if (actingUser) headers['X-User-ID'] = String(actingUser)

    const method = request.method
    let body
    if (method !== 'GET' && method !== 'HEAD' && request.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(request.body)
    }

    try {
      const upstream = await fetch(target, { method, headers, body })
      const text = await upstream.text()
      return reply
        .code(upstream.status)
        .header('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
        .send(text)
    } catch (error) {
      request.log.error({ error, target }, 'foodsharing upstream failed')
      return reply.code(502).send({
        error: 'upstream_unreachable',
        message: 'Die foodsharing-API antwortet gerade nicht.',
      })
    }
  })
}
