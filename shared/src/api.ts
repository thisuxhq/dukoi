// Admin API shapes, shared by the phone agent and the CLI.
//
// The agent listens on ADMIN_PORT on the phone's Wi-Fi address. It's never
// exposed through a tunnel. Everything except /pair/* needs a signed request
// from a paired computer.

export const ADMIN_PORT = 7070
export const MDNS_SERVICE = '_droidhost._tcp.local'
/** First port handed to apps. Each app keeps its port across deploys. */
export const FIRST_APP_PORT = 3000

/** Every error response has this shape, and so does `--json` error output. */
export interface ApiError {
  code: string
  message: string
  /** What to do next, in plain words */
  hint?: string
}

// ── Phone ────────────────────────────────────────────────────────────────

export interface PhoneInfo {
  name: string
  model: string
  android: string
  /** base64url Ed25519 public key */
  publicKey: string
  agentVersion: string
  nodeVersion: string
  protocol: number
}

// ── Pairing ──────────────────────────────────────────────────────────────

export interface PairRequest {
  /** The computer's public key */
  publicKey: string
  /** Shown on the phone, e.g. "Sanju's MacBook" */
  name: string
}

export type PairState = 'pending' | 'approved' | 'denied' | 'expired'

export interface PairStatus {
  state: PairState
  /** The same 6 digits shown on the phone */
  code: string
  phone: PhoneInfo
}

export interface PairedComputer {
  publicKey: string
  name: string
  pairedAt: string
}

// ── Apps ─────────────────────────────────────────────────────────────────

export type AppState = 'stopped' | 'starting' | 'running' | 'restarting' | 'crashed'

export interface AppInfo {
  name: string
  state: AppState
  /** Stable port: same across deploys and rollbacks */
  port: number
  release: string | null
  pid: number | null
  restarts: number
  /** e.g. "killed (SIGKILL)" or "crashed with code 1" */
  lastExit: string | null
  startedAt: string | null
  cpuPercent: number | null
  memoryMb: number | null
  localUrl: string
  publicUrl: string | null
}

export interface ReleaseInfo {
  id: string
  createdAt: string
  sizeBytes: number
  live: boolean
}

export interface DeployResult {
  app: AppInfo
  release: string
  /** Milliseconds from upload received to healthy */
  tookMs: number
}

export interface ExposeResult {
  app: string
  publicUrl: string
}

/** Query string for log requests */
export interface LogQuery {
  lines?: number
  follow?: boolean
}
