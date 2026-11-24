import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import {
  type AppAuthResult,
  type AppInfo,
  type DatabaseInfo,
  type DeployResult,
  DUKOI_VERSION,
  type EnvNames,
  type ExposeResult,
  type PhoneStatus,
  type ReleaseInfo,
  type ReplayResult,
  type RequestDetail,
  type RequestSummary,
} from '@dukoi/shared'
import type { CallOptions, Target } from '../client.ts'
import type { SavedPhone } from '../config.ts'
import { CliError } from '../output.ts'
import {
  createMcpHandler,
  MCP_PROTOCOL_VERSIONS,
  type McpDeps,
  mcp,
  mcpClients,
  mcpInstall,
  serveStdio,
} from './mcp.ts'

// ── Fixtures ─────────────────────────────────────────────────────────────

const PHONE: SavedPhone = {
  name: 'pixel-7',
  host: '192.168.1.42',
  port: 7070,
  publicKey: 'pk_test',
  model: 'Pixel 7',
  pairedAt: '2026-11-01T00:00:00Z',
}

const PHONE_STATUS: PhoneStatus = {
  name: 'pixel-7',
  model: 'Pixel 7',
  android: '15',
  agentVersion: DUKOI_VERSION,
  nodeVersion: '24.22.2',
  agentUptimeSeconds: 1200,
  phoneUptimeSeconds: 86400,
  memory: { totalMb: 8192, freeMb: 4096 },
  storage: { totalMb: 64000, freeMb: 32000 },
  load: [0.2, 0.3, 0.4],
  apps: { total: 1, running: 1 },
  cpuCount: 8,
}

const APP: AppInfo = {
  name: 'notes-api',
  state: 'running',
  port: 3000,
  release: 'rel_1',
  pid: 1234,
  restarts: 0,
  lastExit: null,
  startedAt: '2026-11-24T00:00:00Z',
  cpuPercent: 1.5,
  memoryMb: 48,
  localUrl: 'http://192.168.1.42:3000',
  publicUrl: null,
  domain: null,
  template: 'notes-api',
}

const DATABASE: DatabaseInfo = {
  name: 'redis',
  kind: 'redis',
  state: 'running',
  port: 6380,
  pid: 4321,
  restarts: 0,
  lastExit: null,
  startedAt: '2026-11-24T00:00:00Z',
  cpuPercent: 0.5,
  memoryMb: 12,
  url: 'redis://:supersecretpass@127.0.0.1:6380',
  wifiUrl: 'redis://:supersecretpass@192.168.1.42:6380',
  apps: ['notes-api'],
  envName: 'REDIS_URL',
}

const REQUEST_SUMMARY: RequestSummary = {
  id: 'r_001',
  at: '2026-11-24T10:00:00Z',
  method: 'POST',
  path: '/notes',
  status: 500,
  durationMs: 42,
  reqBytes: 24,
  resBytes: 18,
  from: '192.168.1.10',
  replayedFrom: null,
}

const REQUEST_DETAIL: RequestDetail = {
  ...REQUEST_SUMMARY,
  reqHeaders: { authorization: '[redacted]', 'content-type': 'application/json' },
  reqBody: '{"title":"hello"}',
  reqTruncated: false,
  reqBinary: false,
  resHeaders: { 'content-type': 'application/json' },
  resBody: '{"error":"boom"}',
  resTruncated: false,
  resBinary: false,
}

const RELEASE: ReleaseInfo = {
  id: 'rel_1',
  createdAt: '2026-11-24T00:00:00Z',
  sizeBytes: 16384,
  live: true,
}

const DEPLOY_RESULT: DeployResult = {
  app: APP,
  release: 'rel_2',
  tookMs: 950,
}

interface CallRecord {
  target: Target
  path: string
  opts?: CallOptions
}

function makeFakeDeps(overrides: Partial<McpDeps> = {}) {
  const calls: CallRecord[] = []
  const deployCalls: Parameters<McpDeps['deploy']>[0][] = []
  const pickedDevices: (string | undefined)[] = []

  const deps: McpDeps = {
    loadPhones: () => ({ phones: [PHONE], lastUsed: PHONE.name }),
    pickPhone: (name?: string) => {
      pickedDevices.push(name)
      if (name && name !== PHONE.name) {
        throw new CliError('UNKNOWN_DEVICE', `No paired phone called "${name}".`)
      }
      return PHONE
    },
    call: (async <T>(target: Target, path: string, opts?: CallOptions): Promise<T> => {
      calls.push({ target, path, opts })
      const method = opts?.method ?? 'GET'
      if (method === 'GET' && path === '/status') return PHONE_STATUS as T
      if (method === 'GET' && path === '/apps') return [APP] as T
      if (method === 'GET' && path.startsWith('/apps/notes-api/logs')) {
        return { lines: ['2026-11-24T10:00:00Z out listening on 3000'] } as T
      }
      if (method === 'GET' && path.startsWith('/apps/notes-api/requests?')) {
        return { requests: [REQUEST_SUMMARY] } as T
      }
      if (method === 'GET' && path === '/apps/notes-api/requests/r_001') {
        return REQUEST_DETAIL as T
      }
      if (method === 'POST' && path === '/apps/notes-api/requests/r_001/replay') {
        return {
          request: { ...REQUEST_DETAIL, id: 'r_002', status: 200, replayedFrom: 'r_001' },
        } as ReplayResult as T
      }
      if (method === 'GET' && path === '/apps/notes-api/releases') {
        return [RELEASE] as T
      }
      if (method === 'GET' && path === '/apps/notes-api/env') {
        return { names: ['API_KEY', 'REDIS_URL'] } as EnvNames as T
      }
      if (method === 'PUT' && path === '/apps/notes-api/env') {
        return { names: ['API_KEY', 'NEW_KEY'] } as EnvNames as T
      }
      if (method === 'GET' && path === '/databases') {
        return [DATABASE] as T
      }
      if (method === 'POST' && path === '/databases') {
        return DATABASE as T
      }
      if (method === 'PATCH' && path === '/databases/redis') {
        return DATABASE as T
      }
      if (method === 'POST' && /^\/apps\/notes-api\/(start|stop|restart)$/.test(path)) {
        return APP as T
      }
      if (method === 'POST' && path === '/apps/notes-api/rollback') {
        return DEPLOY_RESULT as T
      }
      if (method === 'DELETE' && path === '/apps/notes-api/expose') {
        return {} as T
      }
      if (method === 'POST' && path === '/apps/notes-api/expose') {
        return {
          app: 'notes-api',
          publicUrl: 'https://demo.trycloudflare.com',
        } as ExposeResult as T
      }
      if (method === 'POST' && path === '/apps/notes-api/auth') {
        return { app: 'notes-api', auth: true, token: 'tok_secret_123' } as AppAuthResult as T
      }
      if (method === 'DELETE' && path === '/apps/notes-api/auth') {
        return { app: 'notes-api', auth: false, token: null } as AppAuthResult as T
      }
      throw new CliError('NOT_FOUND', `Unhandled mock call: ${method} ${path}`)
    }) as McpDeps['call'],
    deploy: async (opts) => {
      deployCalls.push(opts)
      return DEPLOY_RESULT
    },
    ...overrides,
  }
  return { deps, calls, deployCalls, pickedDevices }
}

function parseToolText(res: Awaited<ReturnType<ReturnType<typeof createMcpHandler>>>) {
  expect(res).not.toBeNull()
  const r = res?.result as { content: [{ type: 'text'; text: string }]; isError?: boolean }
  return { payload: JSON.parse(r.content[0].text), isError: r.isError }
}

// ── Protocol handshake, ping, notifications, errors ──────────────────────

describe('MCP protocol lifecycle', () => {
  test('initialize negotiates supported protocol version and server info', async () => {
    const { deps } = makeFakeDeps()
    const handle = createMcpHandler(deps)

    const res = await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    })
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'dukoi', version: DUKOI_VERSION },
      },
    })

    // Unknown future version falls back to newest supported version
    const fallback = await handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '2099-01-01' },
    })
    expect((fallback?.result as { protocolVersion: string } | undefined)?.protocolVersion).toBe(
      MCP_PROTOCOL_VERSIONS[0],
    )
  })

  test('notifications/initialized returns null (no response)', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  test('ping returns empty object', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)
    expect(await handle({ jsonrpc: '2.0', id: 'p1', method: 'ping' })).toEqual({
      jsonrpc: '2.0',
      id: 'p1',
      result: {},
    })
  })

  test('rejects invalid JSON-RPC and unknown methods', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)

    expect((await handle('not an object'))?.error?.code).toBe(-32600)
    expect((await handle({ jsonrpc: '2.0', id: 1 }))?.error?.code).toBe(-32600)
    expect((await handle({ jsonrpc: '2.0', id: 2, method: 'nope/method' }))?.error?.code).toBe(
      -32601,
    )
  })
})

// ── Tools ────────────────────────────────────────────────────────────────

describe('MCP tools', () => {
  test('tools/list advertises all 16 tools with annotations', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)
    const res = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const tools =
      (
        res?.result as
          | {
              tools: {
                name: string
                annotations: { readOnlyHint: boolean; destructiveHint: boolean }
              }[]
            }
          | undefined
      )?.tools ?? []

    expect(tools.map((t) => t.name)).toEqual([
      'dukoi_devices',
      'dukoi_status',
      'dukoi_ps',
      'dukoi_logs',
      'dukoi_inspect',
      'dukoi_releases',
      'dukoi_env_list',
      'dukoi_db_list',
      'dukoi_deploy',
      'dukoi_replay',
      'dukoi_control',
      'dukoi_rollback',
      'dukoi_expose',
      'dukoi_env_set',
      'dukoi_db_create',
      'dukoi_db_connect',
    ])

    const byName = new Map(tools.map((t) => [t.name, t.annotations]))
    for (const ro of [
      'dukoi_devices',
      'dukoi_status',
      'dukoi_ps',
      'dukoi_logs',
      'dukoi_inspect',
      'dukoi_releases',
      'dukoi_env_list',
      'dukoi_db_list',
    ]) {
      expect(byName.get(ro)?.readOnlyHint).toBe(true)
      expect(byName.get(ro)?.destructiveHint).toBe(false)
    }
    expect(byName.get('dukoi_rollback')?.destructiveHint).toBe(true)
    expect(byName.get('dukoi_expose')?.destructiveHint).toBe(true)
  })

  test('read-only tools return expected data and mask database passwords', async () => {
    const { deps, calls } = makeFakeDeps()
    const handle = createMcpHandler(deps)

    const devices = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'dukoi_devices' },
      }),
    )
    expect(devices.payload.ok).toBe(true)
    expect(devices.payload.phones).toHaveLength(1)
    expect(devices.payload.lastUsed).toBe('pixel-7')

    const status = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'dukoi_status' },
      }),
    )
    expect(status.payload.status.model).toBe('Pixel 7')

    const ps = parseToolText(
      await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dukoi_ps' } }),
    )
    expect(ps.payload.apps[0].name).toBe('notes-api')

    const logs = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'dukoi_logs', arguments: { app: 'notes-api', lines: 5000 } },
      }),
    )
    expect(logs.payload.lines).toHaveLength(1)
    // Clamped to 2000
    expect(calls.at(-1)?.path).toBe('/apps/notes-api/logs?lines=2000')

    const inspectList = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'dukoi_inspect', arguments: { app: 'notes-api', limit: 200 } },
      }),
    )
    expect(inspectList.payload.requests).toHaveLength(1)
    expect(calls.at(-1)?.path).toBe('/apps/notes-api/requests?limit=100')

    const inspectOne = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'dukoi_inspect', arguments: { app: 'notes-api', id: 'r_001' } },
      }),
    )
    expect(inspectOne.payload.request.id).toBe('r_001')
    expect(inspectOne.payload.request.reqHeaders.authorization).toBe('[redacted]')

    const releases = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'dukoi_releases', arguments: { app: 'notes-api' } },
      }),
    )
    expect(releases.payload.releases[0].id).toBe('rel_1')

    const envList = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'dukoi_env_list', arguments: { app: 'notes-api' } },
      }),
    )
    expect(envList.payload.names).toEqual(['API_KEY', 'REDIS_URL'])

    const dbList = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'dukoi_db_list' },
      }),
    )
    const dbText = JSON.stringify(dbList.payload)
    expect(dbText).not.toContain('supersecretpass')
    expect(dbList.payload.databases[0].url).toBe('redis://:•••@127.0.0.1:6380')
    expect(dbList.payload.databases[0].wifiUrl).toBe('redis://:•••@192.168.1.42:6380')
  })

  test('mutating tools call expected endpoints, stay quiet on deploy, and never echo secrets', async () => {
    const { deps, calls, deployCalls } = makeFakeDeps({ defaultDevice: 'pixel-7' })
    const handle = createMcpHandler(deps)

    // dukoi_deploy
    const dep = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'dukoi_deploy',
          arguments: { folder: './my-app', name: 'notes-api', noHealthCheck: true },
        },
      }),
    )
    expect(dep.payload.release).toBe('rel_2')
    expect(deployCalls[0]).toEqual({
      folder: './my-app',
      name: 'notes-api',
      device: 'pixel-7',
      noHealthCheck: true,
      json: false,
      quiet: true,
    })

    // dukoi_replay
    const rep = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'dukoi_replay', arguments: { app: 'notes-api', id: 'r_001' } },
      }),
    )
    expect(rep.payload.request.id).toBe('r_002')
    expect(rep.payload.request.replayedFrom).toBe('r_001')

    // dukoi_control
    const ctrl = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'dukoi_control', arguments: { app: 'notes-api', action: 'restart' } },
      }),
    )
    expect(ctrl.payload.app.name).toBe('notes-api')
    expect(calls.at(-1)?.path).toBe('/apps/notes-api/restart')

    // dukoi_rollback
    const rb = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'dukoi_rollback', arguments: { app: 'notes-api', to: 'rel_1' } },
      }),
    )
    expect(rb.payload.release).toBe('rel_2')
    expect(calls.at(-1)?.opts?.body).toEqual({ to: 'rel_1' })

    // dukoi_expose with auth, off, and noAuth
    const expAuth = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'dukoi_expose', arguments: { app: 'notes-api', auth: true } },
      }),
    )
    expect(expAuth.payload.publicUrl).toBe('https://demo.trycloudflare.com')
    expect(expAuth.payload.auth).toBe(true)
    expect(expAuth.payload.loginUrl).toContain('tok_secret_123')

    const expOff = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'dukoi_expose', arguments: { app: 'notes-api', off: true } },
      }),
    )
    expect(expOff.payload.publicUrl).toBeNull()

    const expNoAuth = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'dukoi_expose', arguments: { app: 'notes-api', noAuth: true } },
      }),
    )
    expect(expNoAuth.payload.auth).toBe(false)

    // dukoi_env_set: must never echo secret values
    const envSet = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'dukoi_env_set',
          arguments: {
            app: 'notes-api',
            set: { NEW_KEY: 'top_secret_value_xyz' },
            unset: ['OLD_KEY'],
          },
        },
      }),
    )
    expect(envSet.payload.names).toEqual(['API_KEY', 'NEW_KEY'])
    expect(JSON.stringify(envSet.payload)).not.toContain('top_secret_value_xyz')

    // dukoi_db_create: must mask password in URLs
    const dbCreate = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'dukoi_db_create',
          arguments: { kind: 'redis', apps: ['notes-api'], wifi: true },
        },
      }),
    )
    expect(JSON.stringify(dbCreate.payload)).not.toContain('supersecretpass')
    expect(dbCreate.payload.database.url).toBe('redis://:•••@127.0.0.1:6380')

    // dukoi_db_connect: must mask password in URLs
    const dbConn = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'dukoi_db_connect',
          arguments: { db: 'redis', apps: ['notes-api'], action: 'disconnect' },
        },
      }),
    )
    expect(JSON.stringify(dbConn.payload)).not.toContain('supersecretpass')
    expect(calls.at(-1)?.opts?.body).toEqual({ disconnect: ['notes-api'] })
  })

  test('tool errors return structured isError payload with code, message, and hint', async () => {
    const { deps } = makeFakeDeps({
      pickPhone: () => {
        throw new CliError('NOT_PAIRED', 'Not paired yet.', 'Run `dukoi pair`.')
      },
    })
    const handle = createMcpHandler(deps)

    const res = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'dukoi_status' },
      }),
    )
    expect(res.isError).toBe(true)
    expect(res.payload).toEqual({
      ok: false,
      error: { code: 'NOT_PAIRED', message: 'Not paired yet.', hint: 'Run `dukoi pair`.' },
    })

    // Unknown tool returns JSON-RPC -32602
    const unknown = await handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'dukoi_nonexistent' },
    })
    expect(unknown?.error?.code).toBe(-32602)

    // Validation errors return structured isError
    const badId = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'dukoi_inspect', arguments: { app: 'notes-api', id: 'invalid' } },
      }),
    )
    expect(badId.isError).toBe(true)
    expect(badId.payload.error.code).toBe('BAD_REQUEST_ID')

    const badExpose = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'dukoi_expose',
          arguments: { app: 'notes-api', auth: true, noAuth: true },
        },
      }),
    )
    expect(badExpose.isError).toBe(true)
    expect(badExpose.payload.error.code).toBe('BAD_ARGS')

    const emptyEnv = parseToolText(
      await handle({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'dukoi_env_set', arguments: { app: 'notes-api' } },
      }),
    )
    expect(emptyEnv.isError).toBe(true)
    expect(emptyEnv.payload.error.code).toBe('BAD_ARGS')
  })
})

// ── Resources & Prompts ──────────────────────────────────────────────────

describe('MCP resources and prompts', () => {
  test('lists and reads static resources and app resource templates', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)

    const list = await handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' })
    expect(
      (list?.result as { resources: { uri: string }[] } | undefined)?.resources.map((r) => r.uri),
    ).toEqual(['dukoi://devices', 'dukoi://phone/status', 'dukoi://apps'])

    const templates = await handle({ jsonrpc: '2.0', id: 2, method: 'resources/templates/list' })
    expect(
      (
        templates?.result as { resourceTemplates: { uriTemplate: string }[] } | undefined
      )?.resourceTemplates.map((t) => t.uriTemplate),
    ).toEqual(['dukoi://apps/{app}/logs', 'dukoi://apps/{app}/requests'])

    const devices = await handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/read',
      params: { uri: 'dukoi://devices' },
    })
    const devText =
      (devices?.result as { contents: [{ text: string }] } | undefined)?.contents[0].text ?? ''
    expect(JSON.parse(devText).lastUsed).toBe('pixel-7')

    const status = await handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'dukoi://phone/status' },
    })
    expect(
      JSON.parse(
        (status?.result as { contents: [{ text: string }] } | undefined)?.contents[0].text ?? '',
      ).model,
    ).toBe('Pixel 7')

    const apps = await handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'dukoi://apps' },
    })
    expect(
      JSON.parse(
        (apps?.result as { contents: [{ text: string }] } | undefined)?.contents[0].text ?? '',
      )[0].name,
    ).toBe('notes-api')

    const logs = await handle({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/read',
      params: { uri: 'dukoi://apps/notes-api/logs' },
    })
    expect(
      (logs?.result as { contents: [{ uri: string; text: string; mimeType: string }] } | undefined)
        ?.contents[0],
    ).toEqual({
      uri: 'dukoi://apps/notes-api/logs',
      mimeType: 'text/plain',
      text: '2026-11-24T10:00:00Z out listening on 3000',
    })

    const reqs = await handle({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'dukoi://apps/notes-api/requests' },
    })
    expect(
      JSON.parse(
        (reqs?.result as { contents: [{ text: string }] } | undefined)?.contents[0].text ?? '',
      )[0].id,
    ).toBe('r_001')

    const unknown = await handle({
      jsonrpc: '2.0',
      id: 8,
      method: 'resources/read',
      params: { uri: 'dukoi://unknown' },
    })
    expect(unknown?.error?.code).toBe(-32002)
  })

  test('lists and gets prompts', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)

    const list = await handle({ jsonrpc: '2.0', id: 1, method: 'prompts/list' })
    expect(
      (list?.result as { prompts: { name: string }[] } | undefined)?.prompts.map((p) => p.name),
    ).toEqual(['debug-app', 'deploy-check'])

    const debug = await handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'prompts/get',
      params: { name: 'debug-app', arguments: { app: 'notes-api' } },
    })
    const debugText =
      (debug?.result as { messages: [{ content: { text: string } }] } | undefined)?.messages[0]
        .content.text ?? ''
    expect(debugText).toContain('notes-api')
    expect(debugText).toContain('dukoi_logs')

    const check = await handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/get',
      params: { name: 'deploy-check', arguments: { folder: './my-api' } },
    })
    const checkText =
      (check?.result as { messages: [{ content: { text: string } }] } | undefined)?.messages[0]
        .content.text ?? ''
    expect(checkText).toContain('./my-api')
    expect(checkText).toContain('dukoi_deploy')

    const missingArg = await handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/get',
      params: { name: 'debug-app', arguments: {} },
    })
    expect(missingArg?.error?.code).toBe(-32602)

    const unknownPrompt = await handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'prompts/get',
      params: { name: 'unknown' },
    })
    expect(unknownPrompt?.error?.code).toBe(-32602)
  })
})

// ── Stdio framing ────────────────────────────────────────────────────────

describe('serveStdio', () => {
  test('handles chunked newline-delimited JSON-RPC, notifications, and parse errors', async () => {
    const handle = createMcpHandler(makeFakeDeps().deps)
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []
    output.on('data', (c) => chunks.push(String(c)))

    const done = serveStdio(handle, input, output)

    // Split one JSON message across two chunks, followed by a notification, bad JSON, and ping
    input.write('{"jsonrpc":"2.0","id":1,"meth')
    input.write('od":"initialize","params":{"protocolVersion":"2025-11-25"}}\n')
    input.write('\n')
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    input.write('{not json}\n')
    input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')
    input.end()

    await done

    const lines = chunks
      .join('')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines).toHaveLength(3)
    expect(lines[0].id).toBe(1)
    expect(lines[0].result.serverInfo.name).toBe('dukoi')
    expect(lines[1].error.code).toBe(-32700)
    expect(lines[2]).toEqual({ jsonrpc: '2.0', id: 2, result: {} })
  })
})

// ── mcp install / --off ──────────────────────────────────────────────────

describe('dukoi mcp install', () => {
  let home: string
  let log: ReturnType<typeof spyOn>

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dukoi-mcp-'))
    log = spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    log.mockRestore()
    rmSync(home, { recursive: true, force: true })
  })

  test('registers only in installed clients and preserves existing keys and servers', () => {
    const claudeDir = join(home, 'Library', 'Application Support', 'Claude')
    mkdirSync(claudeDir, { recursive: true })
    const claudeConfig = join(claudeDir, 'claude_desktop_config.json')
    writeFileSync(
      claudeConfig,
      JSON.stringify({
        theme: 'dark',
        mcpServers: { other: { command: 'other-mcp', args: [] } },
      }),
    )

    mkdirSync(join(home, '.cursor'), { recursive: true })
    const claudeCodeConfig = join(home, '.claude.json')
    writeFileSync(claudeCodeConfig, JSON.stringify({ numStartups: 5 }))

    mcpInstall({
      off: false,
      json: true,
      home,
      platform: 'darwin',
      command: '/usr/local/bin/dukoi',
    })

    const out = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(out.ok).toBe(true)
    expect(out.clients).toEqual(['Claude Desktop', 'Cursor', 'Claude Code'])

    const desktopJson = JSON.parse(readFileSync(claudeConfig, 'utf8'))
    expect(desktopJson.theme).toBe('dark')
    expect(desktopJson.mcpServers.other).toEqual({ command: 'other-mcp', args: [] })
    expect(desktopJson.mcpServers.dukoi).toEqual({
      command: '/usr/local/bin/dukoi',
      args: ['mcp'],
    })

    const cursorJson = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'))
    expect(cursorJson.mcpServers.dukoi).toEqual({
      command: '/usr/local/bin/dukoi',
      args: ['mcp'],
    })

    const codeJson = JSON.parse(readFileSync(claudeCodeConfig, 'utf8'))
    expect(codeJson.numStartups).toBe(5)
    expect(codeJson.mcpServers.dukoi).toEqual({
      command: '/usr/local/bin/dukoi',
      args: ['mcp'],
    })

    // --off removes only dukoi and preserves everything else
    mcpInstall({ off: true, json: true, home, platform: 'darwin' })
    const offOut = JSON.parse(log.mock.calls[1]?.[0] as string)
    expect(offOut.ok).toBe(true)
    expect(offOut.removed).toHaveLength(3)

    const desktopAfter = JSON.parse(readFileSync(claudeConfig, 'utf8'))
    expect(desktopAfter.theme).toBe('dark')
    expect(desktopAfter.mcpServers.other).toEqual({ command: 'other-mcp', args: [] })
    expect(desktopAfter.mcpServers.dukoi).toBeUndefined()
  })

  test('throws NO_CLIENTS when no client directory exists (unless --json)', () => {
    expect(() => mcpInstall({ off: false, json: false, home, platform: 'darwin' })).toThrow(
      CliError,
    )

    mcpInstall({ off: false, json: true, home, platform: 'darwin' })
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual({
      ok: true,
      clients: [],
      files: [],
    })
    expect(existsSync(join(home, '.claude.json'))).toBe(false)
  })

  test('resolves Claude Desktop config path on Linux and Windows', () => {
    const linux = mcpClients(home, 'linux', { XDG_CONFIG_HOME: '/xdg' }).find(
      (c) => c.name === 'Claude Desktop',
    )
    expect(linux?.config).toBe(join('/xdg', 'Claude', 'claude_desktop_config.json'))

    const win = mcpClients(home, 'win32', { APPDATA: '/appdata' }).find(
      (c) => c.name === 'Claude Desktop',
    )
    expect(win?.config).toBe(join('/appdata', 'Claude', 'claude_desktop_config.json'))
  })

  test('rejects unknown mcp subcommands', async () => {
    await expect(mcp('bogus', { off: false, json: false })).rejects.toThrow(CliError)
  })
})
