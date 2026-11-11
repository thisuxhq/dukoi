// Serves a static site. The agent starts itself in this mode for apps with no
// package.json: node agent.mjs --serve-static <folder>
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

export function serveStatic(root: string, port: number): void {
  const base = normalize(root)
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let path = normalize(join(base, decodeURIComponent(url.pathname)))
    if (path !== base && !path.startsWith(base + sep)) {
      res.writeHead(403).end('Forbidden')
      return
    }
    try {
      if (statSync(path).isDirectory()) path = join(path, 'index.html')
      const st = statSync(path)
      res.writeHead(200, {
        'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
        'content-length': st.size,
      })
      if (req.method === 'HEAD') res.end()
      else createReadStream(path).pipe(res)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    }
  }).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on ${port}`))
}
