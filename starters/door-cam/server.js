// A camera you can watch from anywhere, using this phone's own camera.
// Chrome on the phone opens /camera and sends photos here. Everyone else watches / and /live.
// You don't need to touch this file: the settings are in settings.js.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve, upgradeWebSocket } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { settings } from './settings.js'

// The camera counts as off when no photo has come in for this long.
const OFFLINE_AFTER_MS = 30_000
const KEEP_EVENTS = 200
const KEEP_DAYS = 7

// Dukoi sets DATA_DIR to a folder that survives deploys and rollbacks.
const DATA = process.env.DATA_DIR ?? '.'
const eventsDir = join(DATA, 'events')
const lapseDir = join(DATA, 'timelapse')
mkdirSync(eventsDir, { recursive: true })
mkdirSync(lapseDir, { recursive: true })

const db = new DatabaseSync(join(DATA, 'door-cam.db'))
db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  photo INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
)`)

// Made up once and kept in DATA_DIR. readOrMake('x.txt', () => 'value')
function readOrMake(name, make) {
  const file = join(DATA, name)
  if (!existsSync(file)) writeFileSync(file, make())
  return readFileSync(file, 'utf8').trim()
}

// Alerts go to ntfy (https://ntfy.sh), a free push service with an app for Android and iOS.
// Set your own topic with: dukoi env set NTFY_TOPIC=...
const topic =
  process.env.NTFY_TOPIC ||
  readOrMake('ntfy-topic.txt', () => `door-cam-${randomBytes(5).toString('hex')}`)

// Only the camera page on this phone gets this key, so nobody else can send it photos.
const cameraKey = readOrMake('camera-key.txt', () => randomBytes(24).toString('base64url'))

// The port people use to reach the app (Dukoi's stable port), learned from requests on the Wi-Fi,
// so the page can show the exact http://localhost:<port>/camera address to open on the phone.
let localPort = readOrMake('local-port.txt', () => '')

let latest = null // the newest photo, a JPEG Buffer
let latestAt = 0
let camera = null // the camera page's WebSocket
const viewers = new Set() // one stream per person watching /live

// If the camera was on before a restart, expect it back. If it doesn't come back, that's an alert.
let online = lastPowerEvent() === 'online'
if (online) latestAt = Date.now()

function lastPowerEvent() {
  return db
    .prepare("SELECT kind FROM events WHERE kind IN ('online', 'offline') ORDER BY id DESC LIMIT 1")
    .get()?.kind
}

function record(kind, photo) {
  const { lastInsertRowid: id } = db
    .prepare('INSERT INTO events (kind, photo) VALUES (?, ?)')
    .run(kind, photo ? 1 : 0)
  if (photo) writeFileSync(join(eventsDir, `${id}.jpg`), photo)
  // Keep the newest events and delete the photos of older ones.
  const old = db
    .prepare('SELECT id FROM events WHERE photo = 1 AND id <= ?')
    .all(Number(id) - KEEP_EVENTS)
  for (const e of old) rmSync(join(eventsDir, `${e.id}.jpg`), { force: true })
  db.prepare('DELETE FROM events WHERE id <= ?').run(Number(id) - KEEP_EVENTS)
}

const pad = (n) => String(n).padStart(2, '0')
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function alert(text, photo) {
  console.log(text)
  const options = photo
    ? { method: 'PUT', body: photo, headers: { Filename: 'door-cam.jpg', Message: text } }
    : { method: 'POST', body: text }
  const res = await fetch(`https://ntfy.sh/${topic}`, options).catch((err) => err)
  if (!res.ok)
    console.error(`Couldn't send the alert to ntfy: ${res.message ?? `HTTP ${res.status}`}`)
}

// The camera sends more photos while someone watches /live, and fewer when nobody does.
function tellCamera() {
  camera?.send(
    JSON.stringify({
      type: 'settings',
      watching: viewers.size > 0,
      fps: viewers.size > 0 ? settings.liveFps : settings.idleFps,
      width: settings.width,
      quality: settings.quality,
      motionArea: settings.motionArea,
    }),
  )
}

// One part of an MJPEG stream: browsers swap in each new photo as it arrives.
function part(photo) {
  const head = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${photo.length}\r\n\r\n`
  return Buffer.concat([Buffer.from(head), photo, Buffer.from('\r\n')])
}

function onPhoto(photo) {
  latest = photo
  latestAt = Date.now()
  if (!online) {
    online = true
    const wasOff = lastPowerEvent() === 'offline'
    record('online')
    if (wasOff) alert('The camera is back on.')
  }
  const chunk = part(photo)
  // A slow viewer skips photos instead of holding everyone up.
  for (const viewer of viewers) if (viewer.desiredSize > 0) viewer.enqueue(chunk)
}

let lastMotionAt = 0
function onMotion() {
  const now = Date.now()
  if (now - lastMotionAt < settings.motionCooldown * 1000) return
  lastMotionAt = now
  record('motion', latest)
  alert(`Motion at ${clock(new Date())}`, latest)
}

function checkOnline() {
  if (online && Date.now() - latestAt > OFFLINE_AFTER_MS) {
    online = false
    record('offline')
    alert(
      'The camera stopped sending photos. Check the phone: Chrome may have closed, or the screen turned off.',
    )
  }
}

// Save the newest photo for the timelapse, and drop days older than a week.
function saveTimelapse() {
  if (!latest || Date.now() - latestAt > 10_000) return
  const now = new Date()
  const folder = join(lapseDir, day(now))
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`),
    latest,
  )
  const keep = new Set(
    Array.from({ length: KEEP_DAYS }, (_, i) => day(new Date(Date.now() - i * 86_400_000))),
  )
  for (const name of readdirSync(lapseDir)) {
    if (!keep.has(name)) rmSync(join(lapseDir, name), { recursive: true, force: true })
  }
}

// True only for Chrome on this phone. Dukoi's proxy sets x-forwarded-for to the real address,
// and Cloudflare adds cf-connecting-ip to everything that comes through a public URL.
function fromThisPhone(c) {
  if (c.req.header('cf-connecting-ip')) return false
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || getConnInfo(c).remote.address || ''
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
}

const page = (name) => readFileSync(new URL(`./public/${name}`, import.meta.url), 'utf8')
const pages = { index: page('index.html'), live: page('live.html'), camera: page('camera.html') }

const app = new Hono()

// Remember the port from requests on the Wi-Fi, like 192.168.1.20:3004.
app.use(async (c, next) => {
  const port = c.req.header('host')?.match(/:(\d+)$/)?.[1]
  if (port && port !== localPort && !c.req.header('cf-connecting-ip')) {
    localPort = port
    writeFileSync(join(DATA, 'local-port.txt'), port)
  }
  await next()
})

app.get('/', (c) => c.html(pages.index))
app.get('/live', (c) => c.html(pages.live))

app.get('/camera', (c) => {
  c.header('cache-control', 'no-store')
  if (!fromThisPhone(c)) {
    return c.html(pages.camera.replace('__CAMERA_KEY__', '').replace('__ALLOWED__', 'false'), 403)
  }
  return c.html(pages.camera.replace('__CAMERA_KEY__', cameraKey).replace('__ALLOWED__', 'true'))
})

app.get('/status', (c) => {
  const events = db
    .prepare('SELECT id, kind, photo, at FROM events ORDER BY id DESC LIMIT 30')
    .all()
  const days = readdirSync(lapseDir).sort().reverse()
  return c.json({
    online,
    lastPhotoAt: latestAt ? new Date(latestAt).toISOString() : null,
    watching: viewers.size,
    topic,
    localPort: localPort || null,
    timelapseEvery: settings.timelapseEvery,
    events,
    days,
  })
})

app.get('/snapshot.jpg', (c) => {
  if (!latest) return c.text("There's no photo yet. Open /camera in Chrome on the phone.", 503)
  return c.body(latest, 200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
})

app.get('/live.mjpeg', () => {
  let viewer
  const body = new ReadableStream({
    start(controller) {
      viewer = controller
      viewers.add(viewer)
      if (latest) viewer.enqueue(part(latest))
      tellCamera()
    },
    cancel() {
      viewers.delete(viewer)
      tellCamera()
    },
  })
  return new Response(body, {
    headers: {
      'content-type': 'multipart/x-mixed-replace; boundary=frame',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
})

app.get('/events/:file{[0-9]+\\.jpg}', (c) => {
  const file = join(eventsDir, c.req.param('file'))
  if (!existsSync(file)) return c.notFound()
  return c.body(readFileSync(file), 200, { 'content-type': 'image/jpeg' })
})

app.get('/timelapse/:day{\\d{4}-\\d{2}-\\d{2}}', (c) => {
  const folder = join(lapseDir, c.req.param('day'))
  return c.json(existsSync(folder) ? readdirSync(folder).sort() : [])
})

app.get('/timelapse/:day{\\d{4}-\\d{2}-\\d{2}}/:file{\\d{2}-\\d{2}-\\d{2}\\.jpg}', (c) => {
  const file = join(lapseDir, c.req.param('day'), c.req.param('file'))
  if (!existsSync(file)) return c.notFound()
  return c.body(readFileSync(file), 200, {
    'content-type': 'image/jpeg',
    'cache-control': 'max-age=604800',
  })
})

// The camera page sends its key first, then JPEG photos as binary messages and motion as text.
app.get(
  '/camera/feed',
  upgradeWebSocket(() => {
    let me = null
    let trusted = false
    return {
      onOpen(_event, ws) {
        me = ws
      },
      onMessage(event, ws) {
        if (typeof event.data === 'string') {
          let message
          try {
            message = JSON.parse(event.data)
          } catch {
            return
          }
          if (message.type === 'hello') {
            if (message.key !== cameraKey) return ws.close(1008, 'Wrong camera key')
            trusted = true
            // One camera at a time: a new camera page takes over from the old one.
            if (camera && camera !== me) camera.close(1000, 'Another camera page took over')
            camera = me
            tellCamera()
            return
          }
          if (trusted && message.type === 'motion') onMotion()
          return
        }
        if (!trusted) return ws.close(1008, 'Send the camera key first')
        onPhoto(Buffer.from(event.data))
      },
      onClose() {
        if (camera === me) camera = null
      },
    }
  }),
)

const port = Number(process.env.PORT ?? 3000)
serve(
  {
    fetch: app.fetch,
    port,
    hostname: process.env.HOST ?? '0.0.0.0',
    // Photos are small. Anything over 2 MB isn't one.
    websocket: { server: new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 }) },
  },
  () => {
    console.log(`door-cam listening on ${port}. Alerts go to ntfy topic ${topic}.`)
    console.log('Open /camera in Chrome on this phone to turn the camera on.')
  },
)

setInterval(checkOnline, 5_000)
setInterval(saveTimelapse, settings.timelapseEvery * 1000)
