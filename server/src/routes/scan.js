import { one } from '../db.js'
import { applyCorrection, classify, logCorrection, recall, remember, status } from '../agent/index.js'
import { CATEGORIES, HAZARD_XP, catalog } from '../agent/taxonomy.js'
import { award } from '../engine/award.js'
import { requireUser } from '../session.js'

/**
 * Phase 4 — the scan agent.
 *
 * POST /api/scan                        photo -> classification
 * GET  /api/scan/status                 which provider would answer right now
 * GET  /api/scan/:photoId               the last classification for that photo
 * POST /api/scan/:photoId/gefahrmeldung a documented hazardous find
 * POST /api/scan/:photoId/korrektur     "falsch erkannt" — logs and re-routes
 *
 * A scan earns nothing. Points come from engine/award.js and only once the
 * action a scan leads to is actually confirmed, so nothing in this file
 * touches the ledger.
 *
 * The one exception is a hazard report, and it proves the rule: what is paid
 * for is the photo, the position and NOT touching the thing. ReMain never
 * rewards anyone for carrying a paint tin or a car battery away themselves.
 */
export default async function scanRoutes(app) {
  app.post('/api/scan', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { photoId, mode, lat, lon, fixture } = request.body ?? {}
    if (typeof photoId !== 'string' || photoId === '') {
      return reply.code(422).send({
        error: 'photo_required',
        message: 'Ohne Foto gibt es nichts zu erkennen.',
      })
    }

    const photo = one('SELECT id, mime, bytes, lat, lon FROM photos WHERE id = ?', photoId)
    if (!photo) {
      return reply.code(404).send({
        error: 'unknown_photo',
        message: 'Dieses Foto kennt der Server nicht mehr.',
      })
    }

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined)

    try {
      const result = await classify({
        photo,
        mode,
        // The position the person sent with the photo counts, and the one
        // sent with the scan only fills a gap.
        lat: num(photo.lat) ?? num(lat),
        lon: num(photo.lon) ?? num(lon),
        fixture: typeof fixture === 'string' ? fixture : undefined,
        log: request.log,
      })

      remember(photoId, result)
      request.log.info(
        {
          photoId,
          provider: result.agent.provider,
          category: result.category,
          ms: result.agent.latencyMs,
        },
        'scan',
      )
      return reply.send({ ...result, ...catalog() })
    } catch (err) {
      // Only a bug gets here: both providers are already covered inside
      // classify(). Still, the camera screen must have something to show.
      request.log.error({ err }, 'scan failed')
      return reply.code(502).send({
        error: 'scan_failed',
        message: 'Die Erkennung ist fehlgeschlagen. Versuch es noch einmal.',
      })
    }
  })

  /** For the person setting up the demo, not for the app. */
  app.get('/api/scan/status', async () => status())

  /** So a reload of the result screen shows the same answer, not a new one. */
  app.get('/api/scan/:photoId', async (request, reply) => {
    const result = recall(request.params.photoId)
    if (!result) {
      return reply.code(404).send({
        error: 'no_scan',
        message: 'Zu diesem Foto liegt keine Erkennung mehr vor.',
      })
    }
    return reply.send({ ...result, ...catalog() })
  })

  /**
   * "Als sichere Meldung speichern" — the only rewarded act on a hazardous
   * find, and a small reward at that.
   *
   * FES has no public intake for this, so the report sits with us and the
   * tier says so: `simulated` when a photo and a position document it,
   * `estimated` when the position is missing and nothing can be checked.
   * `confirmed` is reserved for the day FES or the Mängelmelder answers.
   */
  app.post('/api/scan/:photoId/gefahrmeldung', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { photoId } = request.params
    const scan = recall(photoId)

    if (!scan?.hazard) {
      return reply.code(422).send({
        error: 'not_hazardous',
        message: 'Zu diesem Foto liegt keine Gefahrstoff-Erkennung vor.',
      })
    }

    const photo = one('SELECT id, lat, lon FROM photos WHERE id = ?', photoId)
    const located = Number.isFinite(photo?.lat) && Number.isFinite(photo?.lon)

    const result = award({
      userId: user.id,
      kind: 'hazard',
      refTable: 'photos',
      refId: photoId,
      tier: located ? 'simulated' : 'estimated',
      reason: `Gefahrstoff gemeldet: ${scan.subtype} — dokumentiert, nicht angefasst.`,
      xp: HAZARD_XP,
      // One photo, one report: tapping twice cannot be paid twice.
      eventKey: `hazard:${photoId}`,
    })

    const gemeldet = {
      ...scan,
      hazard: {
        ...scan.hazard,
        reported: true,
        reportedAt: new Date().toISOString(),
        located,
        receiptActionId: result.ok ? result.actionId : (scan.hazard.receiptActionId ?? null),
      },
    }
    remember(photoId, gemeldet)

    request.log.info(
      { photoId, userId: user.id, located, category: scan.category },
      'hazard report',
    )

    return reply.send({
      ...gemeldet,
      ...catalog(),
      message: result.ok
        ? located
          ? 'Meldung gespeichert — mit Foto und Standort.'
          : 'Meldung gespeichert. Ohne Standort kann sie niemand prüfen, deshalb zählt sie nur als deine Angabe.'
        : 'Diese Meldung war schon gespeichert.',
      award: result.ok
        ? { xp: result.xp, coins: result.coins, actionId: result.actionId, totals: result.totals }
        : null,
    })
  })

  /**
   * "Falsch erkannt?" — the most useful thing a person can tell us.
   *
   * There is no table for this: schema.sql is finished and shared by every
   * phase. The correction goes to an append-only log next to the database
   * and re-routes the answer on screen straight away.
   */
  app.post('/api/scan/:photoId/korrektur', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const { photoId } = request.params
    const { category, subtype } = request.body ?? {}

    if (!CATEGORIES[category]) {
      return reply.code(422).send({
        error: 'unknown_category',
        message: 'Diese Kategorie gibt es nicht.',
        categories: catalog().categories,
      })
    }

    const previous = recall(photoId)
    if (!previous) {
      return reply.code(404).send({
        error: 'no_scan',
        message: 'Zu diesem Foto liegt keine Erkennung mehr vor.',
      })
    }

    const photo = one('SELECT lat, lon FROM photos WHERE id = ?', photoId)
    const corrected = applyCorrection(previous, {
      category,
      subtype,
      lat: photo?.lat,
      lon: photo?.lon,
    })
    remember(photoId, corrected)

    const entry = logCorrection({
      photoId,
      userId: user.id,
      mode: previous.mode,
      provider: previous.agent.provider,
      model: previous.agent.model,
      from: previous.category,
      fromSubtype: previous.subtype,
      fromConfidence: previous.confidence,
      to: category,
    })
    request.log.info(entry, 'scan correction')

    return reply.send({ ...corrected, ...catalog() })
  })
}
