// dukoi mcp: local MCP server over stdio for Claude Desktop, Cursor, Claude Code, etc.
//
//   dukoi mcp                Start the JSON-RPC 2.0 MCP server on stdin/stdout
//   dukoi mcp install        Register dukoi in installed MCP client configs
//   dukoi mcp install --off  Remove dukoi from those configs
//
// Never write non-JSON-RPC output to stdout while serving; diagnostics go to stderr.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  type AppAuthResult,
  type AppInfo,
  DATABASE_KINDS,
  type DatabaseInfo,
  type DatabaseKind,
  type DeployResult,
  DUKOI_VERSION,
  type EnvNames,
  type ExposeResult,
  type PhoneStatus,
  REQUEST_ID_PATTERN,
  type ReleaseInfo,
  type ReplayResult,
  type RequestDetail,
  type RequestSummary,
} from '@dukoi/shared'
import { call, pickPhone } from '../client.ts'
import { loadPhones } from '../config.ts'
import { CliError, info, ok } from '../output.ts'
import { maskUrl } from './db.ts'
import { deploy } from './deploy.ts'

export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const

// ── JSON-RPC 2.0 types ───────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: unknown
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type McpHandler = (message: unknown) => Promise<JsonRpcResponse | null>

export interface McpDeps {
  defaultDevice?: string
  loadPhones: typeof loadPhones
  pickPhone: typeof pickPhone
  call: typeof call
  deploy: typeof deploy
}

interface ToolAnnotations {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotations
  run: (args: Record<string, unknown>, deps: McpDeps) => Promise<Record<string, unknown>>
}

// ── Helpers ──────────────────────────────────────────────────────────────

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

const okRpc = (id: string | number | null, result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  result,
})

const errRpc = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError('BAD_ARGS', `Missing required string parameter "${key}".`)
  }
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new CliError('BAD_ARGS', `Parameter "${key}" must be a string.`)
  }
  return value.trim()
}

function optionalBool(args: Record<string, unknown>, key: string): boolean {
  const value = args[key]
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') {
    throw new CliError('BAD_ARGS', `Parameter "${key}" must be a boolean.`)
  }
  return value
}

function clampInt(value: unknown, fallback: number, min: number, max: number, key: string): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CliError('BAD_ARGS', `Parameter "${key}" must be a number.`)
  }
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new CliError('BAD_ARGS', `Parameter "${key}" must be an array of non-empty strings.`)
  }
  return value.map((item) => item.trim())
}

function maskDatabase(db: DatabaseInfo): DatabaseInfo {
  return {
    ...db,
    url: maskUrl(db.url),
    wifiUrl: db.wifiUrl ? maskUrl(db.wifiUrl) : null,
  }
}

function deviceOf(args: Record<string, unknown>, deps: McpDeps): string | undefined {
  return optionalString(args, 'device') ?? deps.defaultDevice
}

function formatToolError(err: unknown): {
  content: [{ type: 'text'; text: string }]
  isError: true
} {
  const e =
    err instanceof CliError
      ? err
      : new CliError('UNEXPECTED', err instanceof Error ? err.message : String(err))
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) },
        }),
      },
    ],
    isError: true,
  }
}

// ── Tools ────────────────────────────────────────────────────────────────

const DEVICE_PROP = {
  type: 'string',
  description: 'Paired phone name (optional; defaults to the last used phone)',
}

const TOOLS: ToolDef[] = [
  // Read-only tools
  {
    name: 'dukoi_devices',
    description: 'List phones paired with this computer and which one was used last.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    async run(_args, deps) {
      const { phones, lastUsed } = deps.loadPhones()
      return { phones, lastUsed }
    },
  },
  {
    name: 'dukoi_status',
    description: 'Get health, memory, storage, load, and uptime for a paired phone.',
    inputSchema: {
      type: 'object',
      properties: { device: DEVICE_PROP },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const phone = deps.pickPhone(deviceOf(args, deps))
      const status = await deps.call<PhoneStatus>(phone, '/status')
      return { phone: phone.name, status }
    },
  },
  {
    name: 'dukoi_ps',
    description: 'List all apps on the phone with their status, CPU, memory, uptime, and URLs.',
    inputSchema: {
      type: 'object',
      properties: { device: DEVICE_PROP },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const phone = deps.pickPhone(deviceOf(args, deps))
      const apps = await deps.call<AppInfo[]>(phone, '/apps')
      return { phone: phone.name, apps }
    },
  },
  {
    name: 'dukoi_logs',
    description: 'Fetch recent log lines for an app on the phone.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        lines: {
          type: 'integer',
          minimum: 1,
          maximum: 2000,
          default: 100,
          description: 'Number of recent log lines (1-2000, default 100)',
        },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const app = requireString(args, 'app')
      const lines = clampInt(args.lines, 100, 1, 2000, 'lines')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const res = await deps.call<{ lines: string[] }>(
        phone,
        `/apps/${encodeURIComponent(app)}/logs?lines=${lines}`,
      )
      return { app, lines: res.lines }
    },
  },
  {
    name: 'dukoi_inspect',
    description:
      'List recent captured HTTP requests for an app, or inspect one redacted request by ID (e.g. r_001).',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        id: {
          type: 'string',
          description: 'Captured request ID (e.g. r_001) to view full details',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Maximum requests to list when id is omitted (1-100, default 50)',
        },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const app = requireString(args, 'app')
      const id = optionalString(args, 'id')
      if (id && !REQUEST_ID_PATTERN.test(id)) {
        throw new CliError(
          'BAD_REQUEST_ID',
          `"${id}" isn't a request ID.`,
          'Request IDs look like r_001. Call dukoi_inspect without id to list recent IDs.',
        )
      }
      const limit = id ? 0 : clampInt(args.limit, 50, 1, 100, 'limit')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const basePath = `/apps/${encodeURIComponent(app)}/requests`
      if (id) {
        const request = await deps.call<RequestDetail>(
          phone,
          `${basePath}/${encodeURIComponent(id)}`,
        )
        return { app, request }
      }
      const { requests } = await deps.call<{ requests: RequestSummary[] }>(
        phone,
        `${basePath}?limit=${limit}`,
      )
      return { app, requests }
    },
  },
  {
    name: 'dukoi_releases',
    description: 'List the last 5 releases for an app on the phone.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const app = requireString(args, 'app')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const releases = await deps.call<ReleaseInfo[]>(
        phone,
        `/apps/${encodeURIComponent(app)}/releases`,
      )
      return { app, releases }
    },
  },
  {
    name: 'dukoi_env_list',
    description:
      'List environment variable names configured for an app (values are never returned).',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const app = requireString(args, 'app')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const { names } = await deps.call<EnvNames>(phone, `/apps/${encodeURIComponent(app)}/env`)
      return { app, names }
    },
  },
  {
    name: 'dukoi_db_list',
    description: 'List Redis and Postgres databases on the phone (passwords in URLs are masked).',
    inputSchema: {
      type: 'object',
      properties: { device: DEVICE_PROP },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, deps) {
      const phone = deps.pickPhone(deviceOf(args, deps))
      const all = await deps.call<DatabaseInfo[]>(phone, '/databases')
      return { databases: all.map(maskDatabase) }
    },
  },

  // Mutating / action tools
  {
    name: 'dukoi_deploy',
    description:
      'Build, pack, upload, start, and health-check a local folder as an app on the phone.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Path to the local app folder' },
        name: { type: 'string', description: 'Override the app name' },
        noHealthCheck: {
          type: 'boolean',
          default: false,
          description: 'Skip the HTTP health check (for background workers)',
        },
        device: DEVICE_PROP,
      },
      required: ['folder'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, deps) {
      const folder = requireString(args, 'folder')
      const name = optionalString(args, 'name')
      const noHealthCheck = optionalBool(args, 'noHealthCheck')
      const device = deviceOf(args, deps)
      const result: DeployResult = await deps.deploy({
        folder,
        name,
        device,
        noHealthCheck,
        json: false,
        quiet: true,
      })
      return { ...result }
    },
  },
  {
    name: 'dukoi_replay',
    description: 'Replay a previously captured HTTP request against the live app.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        id: { type: 'string', description: 'Captured request ID (e.g. r_001)' },
        device: DEVICE_PROP,
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, deps) {
      const app = requireString(args, 'app')
      const id = requireString(args, 'id')
      if (!REQUEST_ID_PATTERN.test(id)) {
        throw new CliError(
          'BAD_REQUEST_ID',
          `"${id}" isn't a request ID.`,
          'Request IDs look like r_001. Call dukoi_inspect to see recent IDs.',
        )
      }
      const phone = deps.pickPhone(deviceOf(args, deps))
      const { request } = await deps.call<ReplayResult>(
        phone,
        `/apps/${encodeURIComponent(app)}/requests/${encodeURIComponent(id)}/replay`,
        { method: 'POST', timeoutMs: 45_000 },
      )
      return { app, request }
    },
  },
  {
    name: 'dukoi_control',
    description: 'Start, stop, or restart an app on the phone.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        action: {
          type: 'string',
          enum: ['start', 'stop', 'restart'],
          description: 'Lifecycle action to perform',
        },
        device: DEVICE_PROP,
      },
      required: ['app', 'action'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, deps) {
      const app = requireString(args, 'app')
      const action = requireString(args, 'action')
      if (action !== 'start' && action !== 'stop' && action !== 'restart') {
        throw new CliError(
          'BAD_ARGS',
          `Invalid action "${action}".`,
          'Use start, stop, or restart.',
        )
      }
      const phone = deps.pickPhone(deviceOf(args, deps))
      const info = await deps.call<AppInfo>(phone, `/apps/${encodeURIComponent(app)}/${action}`, {
        method: 'POST',
        timeoutMs: 30_000,
      })
      return { app: info }
    },
  },
  {
    name: 'dukoi_rollback',
    description: 'Roll an app back to its previous release, or a specific release ID.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        to: { type: 'string', description: 'Optional release ID to roll back to' },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, deps) {
      const app = requireString(args, 'app')
      const to = optionalString(args, 'to')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const result = await deps.call<DeployResult>(
        phone,
        `/apps/${encodeURIComponent(app)}/rollback`,
        { method: 'POST', body: to ? { to } : {}, timeoutMs: 60_000 },
      )
      return { ...result }
    },
  },
  {
    name: 'dukoi_expose',
    description:
      'Give an app a public HTTPS URL, turn public access off, or toggle/rotate private access auth.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        off: { type: 'boolean', default: false, description: 'Stop exposing the app publicly' },
        auth: {
          type: 'boolean',
          default: false,
          description: 'Enable private access token before exposing',
        },
        noAuth: { type: 'boolean', default: false, description: 'Disable private access token' },
        rotate: { type: 'boolean', default: false, description: 'Rotate the private access token' },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async run(args, deps) {
      const app = requireString(args, 'app')
      const off = optionalBool(args, 'off')
      const auth = optionalBool(args, 'auth')
      const noAuth = optionalBool(args, 'noAuth')
      const rotate = optionalBool(args, 'rotate')
      if (auth && noAuth) {
        throw new CliError('BAD_ARGS', 'Use either auth or noAuth, not both.')
      }
      const phone = deps.pickPhone(deviceOf(args, deps))
      const basePath = `/apps/${encodeURIComponent(app)}`
      const exposePath = `${basePath}/expose`

      if (off) {
        await deps.call(phone, exposePath, { method: 'DELETE', timeoutMs: 45_000 })
        return { app, publicUrl: null }
      }

      if (noAuth) {
        await deps.call<AppAuthResult>(phone, `${basePath}/auth`, { method: 'DELETE' })
        return { app, auth: false }
      }

      let authResult: AppAuthResult | null = null
      if (auth || rotate) {
        authResult = await deps.call<AppAuthResult>(phone, `${basePath}/auth`, {
          method: 'POST',
          body: { rotate },
        })
      }

      const result = await deps.call<ExposeResult>(phone, exposePath, {
        method: 'POST',
        timeoutMs: 45_000,
      })
      const loginUrl = authResult?.token
        ? `${result.publicUrl}/_dukoi/auth?token=${encodeURIComponent(authResult.token)}`
        : null

      return {
        ...result,
        ...(authResult ? { auth: authResult.auth, token: authResult.token, loginUrl } : {}),
      }
    },
  },
  {
    name: 'dukoi_env_set',
    description:
      'Set or unset environment variables for an app and restart it. Returns variable names only (never values).',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name' },
        set: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Key-value pairs to set',
        },
        unset: {
          type: 'array',
          items: { type: 'string' },
          description: 'Variable names to remove',
        },
        device: DEVICE_PROP,
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, deps) {
      const app = requireString(args, 'app')
      let set: Record<string, string> | undefined
      if (args.set !== undefined && args.set !== null) {
        if (typeof args.set !== 'object' || Array.isArray(args.set)) {
          throw new CliError('BAD_ARGS', 'Parameter "set" must be an object of string values.')
        }
        set = {}
        for (const [k, v] of Object.entries(args.set as Record<string, unknown>)) {
          if (typeof v !== 'string') {
            throw new CliError('BAD_ARGS', `Environment value for "${k}" must be a string.`)
          }
          set[k] = v
        }
      }
      const unset = optionalStringArray(args, 'unset')
      const hasSet = set !== undefined && Object.keys(set).length > 0
      const hasUnset = unset !== undefined && unset.length > 0
      if (!hasSet && !hasUnset) {
        throw new CliError(
          'BAD_ARGS',
          'Provide at least one variable in "set" or "unset".',
          'Example: { "app": "my-api", "set": { "API_KEY": "..." } }',
        )
      }
      const phone = deps.pickPhone(deviceOf(args, deps))
      const { names } = await deps.call<EnvNames>(phone, `/apps/${encodeURIComponent(app)}/env`, {
        method: 'PUT',
        body: { ...(hasSet ? { set } : {}), ...(hasUnset ? { unset } : {}) },
        timeoutMs: 30_000,
      })
      return { app, names }
    },
  },
  {
    name: 'dukoi_db_create',
    description:
      'Create a Redis or Postgres database on the phone (passwords in returned URLs are masked).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['redis', 'postgres'], description: 'Database kind' },
        name: { type: 'string', description: 'Optional database name' },
        apps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Apps to automatically connect with REDIS_URL or DATABASE_URL',
        },
        wifi: {
          type: 'boolean',
          default: false,
          description: 'Allow other devices on Wi-Fi to connect',
        },
        device: DEVICE_PROP,
      },
      required: ['kind'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(args, deps) {
      const kind = requireString(args, 'kind') as DatabaseKind
      if (!DATABASE_KINDS.some((k) => k.id === kind)) {
        throw new CliError(
          'BAD_ARGS',
          `Dukoi can't make a "${kind}" database.`,
          'Use "redis" or "postgres".',
        )
      }
      const name = optionalString(args, 'name')
      const apps = optionalStringArray(args, 'apps') ?? []
      const wifi = optionalBool(args, 'wifi')
      const phone = deps.pickPhone(deviceOf(args, deps))
      const created = await deps.call<DatabaseInfo>(phone, '/databases', {
        method: 'POST',
        body: { kind, name, apps, wifi },
        timeoutMs: 120_000,
      })
      return { database: maskDatabase(created) }
    },
  },
  {
    name: 'dukoi_db_connect',
    description:
      'Connect or disconnect a database and one or more apps (passwords in returned URLs are masked).',
    inputSchema: {
      type: 'object',
      properties: {
        db: { type: 'string', description: 'Database name' },
        apps: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'App names to connect or disconnect',
        },
        action: {
          type: 'string',
          enum: ['connect', 'disconnect'],
          description: 'Whether to connect or disconnect the apps',
        },
        device: DEVICE_PROP,
      },
      required: ['db', 'apps', 'action'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(args, deps) {
      const db = requireString(args, 'db')
      const apps = optionalStringArray(args, 'apps')
      const action = requireString(args, 'action')
      if (!apps || apps.length === 0) {
        throw new CliError('BAD_ARGS', 'Provide at least one app in "apps".')
      }
      if (action !== 'connect' && action !== 'disconnect') {
        throw new CliError(
          'BAD_ARGS',
          `Invalid action "${action}".`,
          'Use "connect" or "disconnect".',
        )
      }
      const phone = deps.pickPhone(deviceOf(args, deps))
      const updated = await deps.call<DatabaseInfo>(phone, `/databases/${encodeURIComponent(db)}`, {
        method: 'PATCH',
        body: action === 'connect' ? { connect: apps } : { disconnect: apps },
        timeoutMs: 90_000,
      })
      return { database: maskDatabase(updated) }
    },
  },
]

// ── Resources ────────────────────────────────────────────────────────────

const RESOURCES = [
  {
    uri: 'dukoi://devices',
    name: 'Paired phones',
    description: 'Phones paired with this computer and the last used device',
    mimeType: 'application/json',
  },
  {
    uri: 'dukoi://phone/status',
    name: 'Phone status',
    description: 'Health, memory, storage, load, and uptime of the active phone',
    mimeType: 'application/json',
  },
  {
    uri: 'dukoi://apps',
    name: 'Apps',
    description: 'All apps running or stopped on the active phone',
    mimeType: 'application/json',
  },
]

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'dukoi://apps/{app}/logs',
    name: 'App logs',
    description: 'Recent log lines for an app (last 100 lines)',
    mimeType: 'text/plain',
  },
  {
    uriTemplate: 'dukoi://apps/{app}/requests',
    name: 'App HTTP requests',
    description: 'Recent captured HTTP requests for an app (last 50)',
    mimeType: 'application/json',
  },
]

async function readResource(
  uri: string,
  deps: McpDeps,
): Promise<{ contents: [{ uri: string; mimeType: string; text: string }] } | null> {
  if (uri === 'dukoi://devices') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(deps.loadPhones(), null, 2),
        },
      ],
    }
  }
  if (uri === 'dukoi://phone/status') {
    const phone = deps.pickPhone(deps.defaultDevice)
    const status = await deps.call<PhoneStatus>(phone, '/status')
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(status, null, 2) }],
    }
  }
  if (uri === 'dukoi://apps') {
    const phone = deps.pickPhone(deps.defaultDevice)
    const apps = await deps.call<AppInfo[]>(phone, '/apps')
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(apps, null, 2) }],
    }
  }
  const appMatch = uri.match(/^dukoi:\/\/apps\/([^/]+)\/(logs|requests)$/)
  if (appMatch) {
    const app = decodeURIComponent(appMatch[1] as string)
    const kind = appMatch[2]
    const phone = deps.pickPhone(deps.defaultDevice)
    if (kind === 'logs') {
      const { lines } = await deps.call<{ lines: string[] }>(
        phone,
        `/apps/${encodeURIComponent(app)}/logs?lines=100`,
      )
      return {
        contents: [{ uri, mimeType: 'text/plain', text: lines.join('\n') }],
      }
    }
    const { requests } = await deps.call<{ requests: RequestSummary[] }>(
      phone,
      `/apps/${encodeURIComponent(app)}/requests?limit=50`,
    )
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(requests, null, 2) }],
    }
  }
  return null
}

// ── Prompts ──────────────────────────────────────────────────────────────

const PROMPTS = [
  {
    name: 'debug-app',
    description:
      'Diagnose a misbehaving or crashed Dukoi app using status, logs, and HTTP requests.',
    arguments: [{ name: 'app', description: 'App name on the phone', required: true }],
  },
  {
    name: 'deploy-check',
    description: 'Check a local project folder for Dukoi readiness before deploying to the phone.',
    arguments: [{ name: 'folder', description: 'Path to the local app folder', required: true }],
  },
]

function getPrompt(name: string, args: Record<string, unknown>) {
  if (name === 'debug-app') {
    const app = typeof args.app === 'string' ? args.app.trim() : ''
    if (!app) return null
    return {
      description: `Debug the Dukoi app "${app}"`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Debug the Dukoi app "${app}" on my phone:`,
              `1. Call dukoi_ps and dukoi_status to check whether "${app}" is running, restarting, or crashed and whether the phone is low on memory or storage.`,
              `2. Call dukoi_logs for "${app}" to inspect recent stdout, stderr, and agent events.`,
              `3. Call dukoi_inspect for "${app}" to check recent HTTP requests and inspect any 4xx/5xx failures by ID.`,
              `4. Summarize the root cause and suggest the minimal fix (or whether to rollback with dukoi_rollback).`,
            ].join('\n'),
          },
        },
      ],
    }
  }
  if (name === 'deploy-check') {
    const folder = typeof args.folder === 'string' ? args.folder.trim() : ''
    if (!folder) return null
    return {
      description: `Check "${folder}" before deploying to Dukoi`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Review the local project in "${folder}" before deploying it with Dukoi:`,
              `1. Verify it targets Node.js 24 LTS (no Bun-only APIs) and binds to process.env.PORT (default 3000) on 0.0.0.0.`,
              `2. Check package.json start/build scripts, native dependencies (Android arm64), and any required environment variables (set via dukoi_env_set, never hardcoded).`,
              `3. Call dukoi_devices and dukoi_status to confirm a paired phone is ready.`,
              `4. When ready, deploy using dukoi_deploy with folder "${folder}".`,
            ].join('\n'),
          },
        },
      ],
    }
  }
  return undefined
}

// ── Protocol handler ─────────────────────────────────────────────────────

const DEFAULT_DEPS: McpDeps = { loadPhones, pickPhone, call, deploy }

export function createMcpHandler(overrides: Partial<McpDeps> = {}): McpHandler {
  const deps: McpDeps = { ...DEFAULT_DEPS, ...overrides }

  return async (message: unknown): Promise<JsonRpcResponse | null> => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return errRpc(null, -32600, 'Invalid Request: expected a JSON-RPC object.')
    }
    const req = message as JsonRpcRequest
    const hasId = req.id !== undefined
    const id = hasId ? (req.id as string | number | null) : null

    if (typeof req.method !== 'string' || req.method === '') {
      return errRpc(id, -32600, 'Invalid Request: missing method.')
    }

    // Notifications (no id) never receive a response.
    if (!hasId) return null

    const params =
      req.params && typeof req.params === 'object' && !Array.isArray(req.params) ? req.params : {}

    switch (req.method) {
      case 'initialize': {
        const requested =
          typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined
        const protocolVersion =
          requested && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
            ? requested
            : MCP_PROTOCOL_VERSIONS[0]
        return okRpc(id, {
          protocolVersion,
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: 'dukoi', version: DUKOI_VERSION },
        })
      }

      case 'ping':
        return okRpc(id, {})

      case 'tools/list':
        return okRpc(id, {
          tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            annotations,
          })),
        })

      case 'tools/call': {
        const toolName = typeof params.name === 'string' ? params.name : ''
        const tool = TOOLS.find((t) => t.name === toolName)
        if (!tool) return errRpc(id, -32602, `There's no tool called "${toolName}".`)
        const rawArgs = params.arguments ?? {}
        if (typeof rawArgs !== 'object' || Array.isArray(rawArgs) || rawArgs === null) {
          return errRpc(id, -32602, 'Tool arguments must be a JSON object.')
        }
        try {
          const data = await tool.run(rawArgs as Record<string, unknown>, deps)
          return okRpc(id, {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }, null, 2) }],
          })
        } catch (err) {
          return okRpc(id, formatToolError(err))
        }
      }

      case 'resources/list':
        return okRpc(id, { resources: RESOURCES })

      case 'resources/templates/list':
        return okRpc(id, { resourceTemplates: RESOURCE_TEMPLATES })

      case 'resources/read': {
        const uri = typeof params.uri === 'string' ? params.uri : ''
        if (!uri) return errRpc(id, -32602, 'Missing required parameter "uri".')
        try {
          const res = await readResource(uri, deps)
          if (!res) return errRpc(id, -32002, `Unknown resource URI: ${uri}`)
          return okRpc(id, res)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return errRpc(id, -32603, msg)
        }
      }

      case 'prompts/list':
        return okRpc(id, { prompts: PROMPTS })

      case 'prompts/get': {
        const promptName = typeof params.name === 'string' ? params.name : ''
        const promptArgs =
          params.arguments &&
          typeof params.arguments === 'object' &&
          !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : {}
        const result = getPrompt(promptName, promptArgs)
        if (result === undefined) {
          return errRpc(id, -32602, `There's no prompt called "${promptName}".`)
        }
        if (result === null) {
          return errRpc(id, -32602, `Missing required argument for prompt "${promptName}".`)
        }
        return okRpc(id, result)
      }

      default:
        return errRpc(id, -32601, `Unknown method: ${req.method}`)
    }
  }
}

// ── Stdio transport ──────────────────────────────────────────────────────

export async function serveStdio(
  handler: McpHandler,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const rl = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY })
  for await (const rawLine of rl) {
    const line = rawLine.trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      output.write(`${JSON.stringify(errRpc(null, -32700, 'Parse error: invalid JSON.'))}\n`)
      continue
    }
    const response = await handler(parsed)
    if (response !== null) {
      output.write(`${JSON.stringify(response)}\n`)
    }
  }
}

// ── Client installer (`dukoi mcp install`) ───────────────────────────────

export interface McpClient {
  name: string
  /** Installed if any of these paths exist */
  detect: string[]
  /** Config file holding mcpServers */
  config: string
}

export function mcpClients(
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): McpClient[] {
  const claudeDesktopDir =
    platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude')
      : platform === 'win32'
        ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude')
        : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'Claude')

  return [
    {
      name: 'Claude Desktop',
      detect: [claudeDesktopDir],
      config: join(claudeDesktopDir, 'claude_desktop_config.json'),
    },
    {
      name: 'Cursor',
      detect: [join(home, '.cursor')],
      config: join(home, '.cursor', 'mcp.json'),
    },
    {
      name: 'Claude Code',
      detect: [join(home, '.claude.json'), join(home, '.claude')],
      config: join(home, '.claude.json'),
    },
  ]
}

function dukoiBinary(): string {
  return basename(process.execPath).startsWith('dukoi') ? process.execPath : 'dukoi'
}

function readJsonObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new CliError(
      'BAD_CONFIG',
      `Couldn't read ${file} as JSON.`,
      'Fix the JSON syntax in that file and run `dukoi mcp install` again.',
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError(
      'BAD_CONFIG',
      `${file} isn't a JSON object.`,
      'Fix that file and run `dukoi mcp install` again.',
    )
  }
  return parsed as Record<string, unknown>
}

export interface McpInstallOptions {
  off: boolean
  device?: string
  json: boolean
  home?: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  command?: string
}

export function mcpInstall(opts: McpInstallOptions): void {
  const home = opts.home ?? homedir()
  const platform = opts.platform ?? process.platform
  const env = opts.env ?? process.env
  const command = opts.command ?? dukoiBinary()
  const args = opts.device ? ['mcp', '--device', opts.device] : ['mcp']

  const found = mcpClients(home, platform, env).filter((client) =>
    client.detect.some((path) => existsSync(path)),
  )

  if (opts.off) {
    const removed: string[] = []
    for (const client of found) {
      if (!existsSync(client.config)) continue
      const data = readJsonObject(client.config)
      const servers = data.mcpServers
      if (!servers || typeof servers !== 'object' || Array.isArray(servers)) continue
      const map = { ...(servers as Record<string, unknown>) }
      if (!('dukoi' in map)) continue
      delete map.dukoi
      data.mcpServers = map
      writeFileSync(client.config, `${JSON.stringify(data, null, 2)}\n`)
      removed.push(client.config)
    }
    if (opts.json) return void console.log(JSON.stringify({ ok: true, removed }))
    return void ok(
      removed.length > 0
        ? 'Removed the Dukoi MCP server'
        : 'Dukoi MCP server wasn’t registered in any client',
    )
  }

  if (found.length === 0) {
    if (opts.json) return void console.log(JSON.stringify({ ok: true, clients: [], files: [] }))
    throw new CliError(
      'NO_CLIENTS',
      "Couldn't find Claude Desktop, Cursor, or Claude Code on this computer.",
      `Add this to your MCP client config manually:\n  { "mcpServers": { "dukoi": { "command": "${command}", "args": ${JSON.stringify(args)} } } }`,
    )
  }

  const files: string[] = []
  const names: string[] = []
  for (const client of found) {
    const data = readJsonObject(client.config)
    const existing =
      data.mcpServers && typeof data.mcpServers === 'object' && !Array.isArray(data.mcpServers)
        ? (data.mcpServers as Record<string, unknown>)
        : {}
    data.mcpServers = { ...existing, dukoi: { command, args } }
    mkdirSync(dirname(client.config), { recursive: true })
    writeFileSync(client.config, `${JSON.stringify(data, null, 2)}\n`)
    files.push(client.config)
    names.push(client.name)
  }

  if (opts.json) return void console.log(JSON.stringify({ ok: true, clients: names, files }))
  ok(`Registered Dukoi MCP server for ${formatList(names)}`)
  info('\n  Restart your client to pick up the new Dukoi tools.')
}

const formatList = (names: string[]) =>
  names.length === 1 ? (names[0] as string) : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

// ── CLI entry point ──────────────────────────────────────────────────────

export interface McpOptions {
  device?: string
  off: boolean
  json: boolean
}

export async function mcp(action: string | undefined, opts: McpOptions): Promise<void> {
  if (action === 'install') {
    mcpInstall({ off: opts.off, device: opts.device, json: opts.json })
    return
  }
  if (action !== undefined) {
    throw new CliError(
      'BAD_ARGS',
      `There's no "mcp ${action}".`,
      'Use `dukoi mcp` to start the server, or `dukoi mcp install` to register it.',
    )
  }
  const handler = createMcpHandler({ defaultDevice: opts.device })
  await serveStdio(handler)
}
