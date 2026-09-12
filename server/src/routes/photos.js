import { id, now, one, run } from '../db.js'
import { requireUser } from '../session.js'

const MAX_BYTES = 1_500_000
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Photo upload.
 *
 * The browser downscales and re-encodes through a canvas before sending,
 * which is what actually removes the EXIF block — including the GPS tag and
 * the camera serial. So the server does not strip metadata; it refuses
 * anything that still looks like an original.
 *
 * Position and capture time arrive as separate, explicit fields that the
 * person agreed to send. That is a better privacy story than silently
 * reading them out of a file, and it is the one the app can honestly show.
 */
export default async function photoRoutes(app) {
  app.post('/api/photos', async (request, reply) => {
    const user = requireUser(request, reply)
    if (!user) return

    const file = await request.file({ limits: { fileSize: MAX_BYTES } })
    if (!file) {
      return reply.code(422).send({ error: 'no_file', message: 'Es kam kein Bild an.' })
    }
    if (!ALLOWED.has(file.mimetype)) {
      return reply.code(415).send({
        error: 'unsupported_type',
        message: 'Bitte ein JPEG, PNG oder WebP schicken.',
      })
    }

    let bytes
    try {
      bytes = await file.toBuffer()
    } catch {
      return reply.code(413).send({
        error: 'too_large',
        message: 'Das Bild ist zu groß. Die App verkleinert normalerweise vorher.',
      })
    }

    const fields = file.fields ?? {}
    const numberField = (name) => {
      const raw = fields[name]?.value
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }

    const photoId = id('ph')
    run(
      `INSERT INTO photos (id, user_id, mime, bytes, byte_size, lat, lon, taken_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      photoId,
      user.id,
      file.mimetype,
      bytes,
      bytes.length,
      numberField('lat'),
      numberField('lon'),
      fields.takenAt?.value ?? null,
      now(),
    )

    return reply.code(201).send({ id: photoId, byteSize: bytes.length })
  })

  app.get('/api/photos/:id', async (request, reply) => {
    const photo = one('SELECT mime, bytes FROM photos WHERE id = ?', request.params.id)
    if (!photo) return reply.code(404).send({ error: 'unknown_photo' })

    // Photo ids are random and a photo never changes, so it can cache hard.
    return reply
      .header('Content-Type', photo.mime)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(photo.bytes)
  })
}
