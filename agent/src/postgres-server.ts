// Postgres for the phone: PGlite (Postgres compiled to WebAssembly) behind a
// password check. Built on its own into postgres.mjs, next to PGlite's .wasm
// and .data files, and started by the agent: node postgres.mjs <data folder>
//
// PGlite's socket server lets anyone in. On a phone every Android app can
// reach 127.0.0.1, so this asks for the password first (Postgres's plain
// password exchange) and only then hands the connection to PGlite.
import { createServer, type Socket } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const SSL_REQUEST = 80877103
const GSS_REQUEST = 80877104
const CANCEL_REQUEST = 80877102

/** Reads the startup and password messages, then calls `ok` or turns the client away. */
export function passwordGate(
  password: string,
  ok: (client: Socket, pending: Buffer) => Promise<void>,
) {
  return (client: Socket) => {
    let buf = Buffer.alloc(0)
    let startup: Buffer | null = null
    const onData = async (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      while (true) {
        if (!startup) {
          if (buf.length < 8) return
          const len = buf.readInt32BE(0)
          if (len < 8 || len > 10_000) return void client.destroy()
          if (buf.length < len) return
          const code = buf.readInt32BE(4)
          const message = buf.subarray(0, len)
          buf = buf.subarray(len)
          // No TLS here: say no and the client carries on in plain text.
          if (code === SSL_REQUEST || code === GSS_REQUEST) {
            client.write('N')
            continue
          }
          if (code === CANCEL_REQUEST) return void client.destroy()
          startup = message
          client.write(authRequest())
          continue
        }
        if (buf.length < 5) return
        const len = buf.readInt32BE(1)
        if (len < 4 || len > 10_000) return void client.destroy()
        if (buf.length < len + 1) return
        const type = String.fromCharCode(buf[0] as number)
        const given = buf
          .subarray(5, len + 1)
          .toString()
          .replace(/\0$/, '')
        buf = buf.subarray(len + 1)
        client.off('data', onData)
        if (type !== 'p' || given !== password) {
          client.end(errorResponse('28P01', 'Wrong password.'))
          return
        }
        client.pause()
        // PGlite answers the startup message itself, with AuthenticationOk.
        await ok(client, Buffer.concat([startup, buf]))
        client.resume()
        return
      }
    }
    client.on('data', onData)
    client.on('error', () => client.destroy())
  }
}

/** AuthenticationCleartextPassword */
function authRequest(): Buffer {
  const b = Buffer.alloc(9)
  b.write('R')
  b.writeInt32BE(8, 1)
  b.writeInt32BE(3, 5)
  return b
}

function errorResponse(code: string, message: string): Buffer {
  const body = Buffer.from(`SFATAL\0VFATAL\0C${code}\0M${message}\0\0`)
  const head = Buffer.alloc(5)
  head.write('E')
  head.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([head, body])
}

async function main(): Promise<void> {
  const dataDir = process.argv[2]
  const port = Number(process.env.PORT)
  const host = process.env.HOST ?? '127.0.0.1'
  const password = process.env.DUKOI_DB_PASSWORD
  if (!dataDir || !port || !password) {
    console.error('Usage: PORT=… DUKOI_DB_PASSWORD=… node postgres.mjs <data folder>')
    process.exit(2)
  }

  const db = await PGlite.create({ dataDir })
  // We use PGlite's connection handling without its listener: it never
  // listens anywhere, so nothing can skip the password check. Pinned version.
  const pglite = new PGLiteSocketServer({ db, maxConnections: 50 }) as unknown as {
    active: boolean
    handleConnection(socket: Socket): Promise<void>
  }
  pglite.active = true

  const server = createServer(
    passwordGate(password, async (client, pending) => {
      await pglite.handleConnection(client)
      client.emit('data', pending)
    }),
  )
  server.listen(port, host, () =>
    console.log(`Postgres (PGlite) is taking connections on port ${port}.`),
  )

  const stop = async () => {
    server.close()
    await db.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\0'))
  await main()
