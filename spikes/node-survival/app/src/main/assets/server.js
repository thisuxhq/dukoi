// DroidHost survival spike server. No dependencies.
//
// GET /        status: Node version, pid, uptime, hit counter (SQLite)
// GET /gaps    times the heartbeat stopped for over 2 minutes (Doze or a freeze)
// GET /crash   exits with code 1, to test auto-restart

const http = require('node:http')
const path = require('node:path')

const port = Number(process.env.PORT || 3000)
const dataDir = process.env.DATA_DIR || '.'
const startedAt = new Date()
const HEARTBEAT_MS = 30_000
const GAP_MS = 120_000

let db = null
let sqliteProblem = null
try {
  const { DatabaseSync } = require('node:sqlite')
  db = new DatabaseSync(path.join(dataDir, 'spike.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS heartbeats (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, pid INTEGER NOT NULL);
  `)
} catch (error) {
  sqliteProblem = String(error && error.message)
  console.log(`sqlite unavailable: ${sqliteProblem}`)
}

function heartbeat() {
  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
  console.log(`${new Date().toISOString()} heartbeat pid=${process.pid} rss=${memoryMb}MB`)
  if (db) db.prepare('INSERT INTO heartbeats (at, pid) VALUES (?, ?)').run(Date.now(), process.pid)
}
heartbeat()
setInterval(heartbeat, HEARTBEAT_MS)

function findGaps() {
  if (!db) return []
  const rows = db.prepare('SELECT at, pid FROM heartbeats ORDER BY at').all()
  const gaps = []
  for (let i = 1; i < rows.length; i++) {
    const missedMs = rows[i].at - rows[i - 1].at
    if (missedMs > GAP_MS) {
      gaps.push({
        from: new Date(rows[i - 1].at).toISOString(),
        to: new Date(rows[i].at).toISOString(),
        minutes: Math.round(missedMs / 60_000),
        restarted: rows[i].pid !== rows[i - 1].pid,
      })
    }
  }
  return gaps
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}

const server = http.createServer((req, res) => {
  if (req.url === '/crash') {
    send(res, 200, { ok: true, message: 'Exiting with code 1. The supervisor should restart me.' })
    setTimeout(() => process.exit(1), 100)
    return
  }

  if (req.url === '/gaps') {
    const first = db && db.prepare('SELECT MIN(at) AS at FROM heartbeats').get().at
    send(res, 200, {
      watchingSince: first ? new Date(first).toISOString() : null,
      heartbeatSeconds: HEARTBEAT_MS / 1000,
      gaps: findGaps(),
    })
    return
  }

  let hits = null
  if (db) {
    db.prepare('INSERT INTO hits (at) VALUES (?)').run(new Date().toISOString())
    hits = db.prepare('SELECT COUNT(*) AS n FROM hits').get().n
  }
  send(res, 200, {
    ok: true,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    pid: process.pid,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    hits,
    sqlite: sqliteProblem ? `unavailable: ${sqliteProblem}` : 'ok',
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`${new Date().toISOString()} listening on ${port} (node ${process.version})`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing')
  server.close(() => process.exit(0))
})
