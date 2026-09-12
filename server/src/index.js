import 'dotenv/config'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'

import { ROOT } from './db.js'
import contentRoutes from './routes/content.js'
import fesRoutes from './routes/fes.js'
import marketWriteRoutes from './routes/market-write.js'
import mobilityRoutes from './routes/mobility.js'
import questsWriteRoutes from './routes/quests-write.js'
import rewardRoutes from './routes/rewards.js'
import vytalRoutes from './routes/vytal.js'
import foodRoutes from './routes/food.js'
import metaRoutes from './routes/meta.js'
import photoRoutes from './routes/photos.js'
import receiptRoutes from './routes/receipt.js'
import scanRoutes from './routes/scan.js'
import sessionRoutes from './routes/session.js'
import { seed } from './seed.js'

/**
 * One process: the API and the built app.
 *
 * Two deploys means two things that can be down when the judges arrive, and
 * it means CORS. One service that serves its own frontend has neither.
 */
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 2_000_000,
})

await app.register(cookie)
await app.register(multipart, { limits: { fileSize: 1_500_000, files: 1 } })

await app.register(metaRoutes)
await app.register(sessionRoutes)
await app.register(contentRoutes)
await app.register(photoRoutes)
await app.register(foodRoutes)

// Pre-registered for the phases being built in parallel. Each owns exactly
// one file under routes/ and nobody has to touch this one.
await app.register(receiptRoutes)    // phase 3
await app.register(scanRoutes)       // phase 4
await app.register(fesRoutes)        // phase 5
await app.register(marketWriteRoutes) // phase 6
await app.register(questsWriteRoutes) // phase 7
await app.register(mobilityRoutes)   // phase 8
await app.register(vytalRoutes)      // phase 9
await app.register(rewardRoutes)     // phase 10

/* ------------------------------------------------------------------
   The built client. In development Vite serves it instead, so a missing
   dist is normal and must not stop the API from starting.
   ------------------------------------------------------------------ */
const dist = join(ROOT, '..', 'app', 'dist')

if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, index: ['index.html'] })

  // Real URLs: /quests reloads into the app rather than 404ing. Anything
  // under /api that got this far is genuinely missing.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'unknown_route', path: request.url })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.log.warn('app/dist not found — API only. Run `npm run build` in app/ to serve the client.')
}

const result = seed()
app.log.info(
  `seed: ${result.districts} Stadtteile, ${result.places} echte Orte` +
    (result.demo ? `, Demo-Inhalte angelegt` : `, Demo-Inhalte schon vorhanden`),
)

const port = Number(process.env.PORT ?? 8080)
await app.listen({ port, host: '0.0.0.0' })
