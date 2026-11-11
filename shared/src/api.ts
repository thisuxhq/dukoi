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

/** `droidhost status` */
export interface PhoneStatus {
  name: string
  model: string
  android: string
  agentVersion: string
  nodeVersion: string
  agentUptimeSeconds: number
  phoneUptimeSeconds: number
  memory: { totalMb: number; freeMb: number }
  storage: { totalMb: number; freeMb: number } | null
  load: number[]
  apps: { total: number; running: number }
  /** Cores, so load can be shown as a percentage */
  cpuCount: number
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
  /** Custom domain when the public URL is on one (stable), else null */
  domain: string | null
  /** The template it started from (deployed on the phone), else null */
  template: string | null
}

/** The phone's link to Cloudflare for custom domains. */
export interface DomainStatus {
  /** The phone has a Cloudflare login certificate */
  loggedIn: boolean
  /** The domain the login is for, e.g. example.com */
  zone: string | null
  /** While logging in: the Cloudflare page to open */
  loginUrl: string | null
  domains: { app: string; hostname: string }[]
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

// ── Releases ─────────────────────────────────────────────────────────────

/** Where the CLI writes the manifest inside an upload */
export const MANIFEST_PATH = '.droidhost/manifest.json'

/** Written by the CLI into every upload. Tells the phone how to run it. */
export interface ReleaseManifest {
  kind: 'node' | 'static'
  /** For node apps: arguments to node, e.g. ["server.js"]. For static: the folder to serve. */
  start: string[]
  /** Path to GET for the health check, or null for workers that open no port */
  healthCheck: string | null
  /** Shown in `droidhost releases` */
  source: { files: number; bytes: number; cli: string }
}

export const APP_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

// ── Templates ─────────────────────────────────────────────────────────────

/** An app people can start from: `droidhost init <id>`, or Try a template on the phone. */
export interface TemplateInfo {
  id: string
  name: string
  description: string
  /** The setting it needs before it can run, like TELEGRAM_BOT_TOKEN, else null */
  secret: string | null
  /** The one file to change to make it yours */
  edit: string
}

/** Every template, in the order people see them. The folders live in starters/. */
export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'static-site',
    name: 'Static site',
    description: 'A one-page site with your name on it',
    secret: null,
    edit: 'index.html',
  },
  {
    id: 'notes-api',
    name: 'Notes API',
    description: 'A small JSON API with a database',
    secret: null,
    edit: 'server.js',
  },
  {
    id: 'file-drop',
    name: 'File drop',
    description: 'Upload a file, get a link to share',
    secret: null,
    edit: 'server.js',
  },
  {
    id: 'mcp-server',
    name: 'MCP server',
    description: 'A tool your AI assistant can call',
    secret: null,
    edit: 'tools.js',
  },
  {
    id: 'telegram-bot',
    name: 'Telegram bot',
    description: 'A bot that replies, always on',
    secret: 'TELEGRAM_BOT_TOKEN',
    edit: 'bot.js',
  },
]

/** Body of POST /local/templates/:id/deploy */
export interface TemplateDeployRequest {
  env?: Record<string, string>
}

/** Body of PUT /apps/:name/env. Values are never sent back, only names. */
export interface EnvChange {
  set?: Record<string, string>
  unset?: string[]
}

/** Answer to GET and PUT /apps/:name/env */
export interface EnvNames {
  names: string[]
}

/** Setting names apps can use: letters, numbers and underscores */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
