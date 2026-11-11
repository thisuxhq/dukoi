// Upload a file, get a link to share. Files stay on the phone.
import { randomBytes } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getMimeType } from 'hono/utils/mime'

// Make it yours: the biggest file people can upload, in MB.
// Cloudflare's free plan stops public uploads at 100 MB.
const MAX_MB = 50

// Dukoi sets DATA_DIR to a folder that survives deploys and rollbacks.
const FILES = join(process.env.DATA_DIR ?? '.', 'files')
mkdirSync(FILES, { recursive: true })

const page = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8').replace(
  '{{MAX_MB}}',
  String(MAX_MB),
)

const app = new Hono()

app.get('/', (c) => c.html(page))

app.post('/upload', async (c) => {
  const size = Number(c.req.header('content-length') ?? 0)
  if (size > MAX_MB * 1024 * 1024) return c.json({ error: `Files can be up to ${MAX_MB} MB.` }, 413)

  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) return c.json({ error: 'Choose a file to upload.' }, 400)

  // A short random id keeps links unguessable; the name keeps them readable.
  const id = randomBytes(3).toString('hex')
  const name = basename(file.name).replace(/[^\w.-]+/g, '-') || 'file'
  mkdirSync(join(FILES, id))
  writeFileSync(join(FILES, id, name), Buffer.from(await file.arrayBuffer()))
  return c.json({ url: `/f/${id}/${name}` }, 201)
})

app.get('/f/:id/:name', (c) => {
  const { id, name } = c.req.param()
  const path = join(FILES, basename(id), basename(name))
  if (!existsSync(path)) return c.text('This file is gone, or the link is wrong.', 404)
  return c.body(Readable.toWeb(createReadStream(path)), 200, {
    'content-type': getMimeType(name) ?? 'application/octet-stream',
    'content-length': String(statSync(path).size),
    'content-disposition': `inline; filename="${name}"`,
    // Uploaded HTML or SVG opens like a picture, but its scripts never run.
    'content-security-policy': 'sandbox',
    'x-content-type-options': 'nosniff',
  })
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(`file-drop listening on ${port}`)
})
