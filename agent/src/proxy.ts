// Each app's stable port. It forwards to whichever release is live, so a
// deploy or rollback switches traffic without the URL changing.
import { createServer, request, type Server } from 'node:http'
import { connect } from 'node:net'

export class StablePort {
  /** Port of the live release, or null while nothing is running */
  target: number | null = null
  private server: Server

  constructor(
    readonly port: number,
    private appName: string,
  ) {
    this.server = createServer((req, res) => {
      if (!this.target) {
        res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '2' })
        res.end(`${this.appName} isn't running right now.`)
        return
      }
      const upstream = request(
        {
          host: '127.0.0.1',
          port: this.target,
          method: req.method,
          path: req.url,
          headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '' },
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers)
          up.pipe(res)
        },
      )
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
        res.end(`${this.appName} didn't answer.`)
      })
      req.pipe(upstream)
    })

    // WebSockets and other upgrades: join the two sockets.
    this.server.on('upgrade', (req, socket, head) => {
      if (!this.target) return socket.destroy()
      const up = connect(this.target, '127.0.0.1', () => {
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
        }
        up.write(`${lines.join('\r\n')}\r\n\r\n`)
        if (head.length) up.write(head)
        up.pipe(socket).pipe(up)
      })
      up.on('error', () => socket.destroy())
      socket.on('error', () => up.destroy())
    })
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, '0.0.0.0', () => resolve())
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()))
  }
}

/** A free port on 127.0.0.1 for a release to listen on. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const address = s.address()
      const port = typeof address === 'object' && address ? address.port : 0
      s.close(() => resolve(port))
    })
  })
}
