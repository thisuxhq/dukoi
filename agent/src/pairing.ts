// Pairing: a computer asks, the phone shows a code, the owner taps Approve.
import {
  type PairedComputer,
  type PairRequest,
  type PairState,
  type PairStatus,
  pairingCode,
} from '@droidhost/shared'
import type { Agent } from './agent.ts'
import { HttpError } from './http.ts'

/** A pairing request waits this long for a tap on the phone. */
export const PAIR_TIMEOUT_MS = 2 * 60 * 1000

interface Pending {
  publicKey: string
  name: string
  code: string
  state: PairState
  createdAt: number
}

export function pairingRoutes(agent: Agent): void {
  const pending = new Map<string, Pending>()
  const phoneKey = () => agent.store.state.identity.publicKey

  const expire = () => {
    const now = Date.now()
    for (const p of pending.values()) {
      if (p.state === 'pending' && now - p.createdAt > PAIR_TIMEOUT_MS) p.state = 'expired'
      if (now - p.createdAt > PAIR_TIMEOUT_MS * 2) pending.delete(p.publicKey)
    }
  }

  const status = (publicKey: string): PairStatus => {
    expire()
    const code = pairingCode(publicKey, phoneKey())
    if (agent.store.isPaired(publicKey)) return { state: 'approved', code, phone: agent.info() }
    const p = pending.get(publicKey)
    if (!p)
      throw new HttpError(
        404,
        'NO_PAIRING',
        'This computer hasn’t asked to pair.',
        'Run `droidhost pair`.',
      )
    return { state: p.state, code, phone: agent.info() }
  }

  // ── From the computer (public: anyone on the Wi-Fi can ask) ────────────

  agent.router.on('POST', '/pair/request', 'public', (ctx) => {
    const { publicKey, name } = ctx.json<PairRequest>()
    if (!publicKey || Buffer.from(publicKey, 'base64url').length !== 32) {
      throw new HttpError(400, 'BAD_KEY', 'The pairing request needs a 32-byte Ed25519 public key.')
    }
    if (!agent.store.isPaired(publicKey)) {
      const cleanName = String(name || 'A computer').slice(0, 60)
      pending.set(publicKey, {
        publicKey,
        name: cleanName,
        code: pairingCode(publicKey, phoneKey()),
        state: 'pending',
        createdAt: Date.now(),
      })
      console.log(`Pairing requested by ${cleanName}`)
    }
    return status(publicKey)
  })

  agent.router.on('GET', '/pair/status', 'public', (ctx) => {
    const key = ctx.query.get('key')
    if (!key) throw new HttpError(400, 'NO_KEY', 'Add ?key=<computer public key>.')
    return status(key)
  })

  // ── From the phone app (local only) ─────────────────────────────────────

  agent.router.on('GET', '/local/pairing', 'local', () => {
    expire()
    return {
      pending: [...pending.values()]
        .filter((p) => p.state === 'pending')
        .map(({ publicKey, name, code }) => ({ publicKey, name, code })),
      computers: agent.store.state.computers,
    }
  })

  const decide = (approve: boolean) => (ctx: { params: Record<string, string> }) => {
    expire()
    const p = pending.get(ctx.params.key ?? '')
    if (p?.state !== 'pending') {
      throw new HttpError(404, 'NO_PAIRING', 'That pairing request is gone or has expired.')
    }
    p.state = approve ? 'approved' : 'denied'
    if (approve) {
      const computer: PairedComputer = {
        publicKey: p.publicKey,
        name: p.name,
        pairedAt: new Date().toISOString(),
      }
      agent.store.state.computers.push(computer)
      agent.store.save()
      console.log(`Paired with ${p.name}`)
    }
    return { state: p.state }
  }
  agent.router.on('POST', '/local/pairing/:key/approve', 'local', decide(true))
  agent.router.on('POST', '/local/pairing/:key/deny', 'local', decide(false))

  // Removing a computer works from the phone, or from the computer itself.
  const remove = (key: string) => {
    const before = agent.store.state.computers.length
    agent.store.state.computers = agent.store.state.computers.filter((c) => c.publicKey !== key)
    if (agent.store.state.computers.length === before) {
      throw new HttpError(404, 'NOT_PAIRED', 'That computer isn’t paired.')
    }
    agent.store.save()
    return { removed: key }
  }
  agent.router.on('DELETE', '/local/computers/:key', 'local', (ctx) => remove(ctx.params.key ?? ''))
  agent.router.on('DELETE', '/computers/self', 'paired', (ctx) => remove(ctx.computer ?? ''))
  agent.router.on('GET', '/computers', 'paired', () => agent.store.state.computers)
}
