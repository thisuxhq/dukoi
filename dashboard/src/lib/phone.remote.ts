// Everything the dashboard reads from and does to the phone. These run on the
// local server, which signs each call with this computer's key.
import {
  APP_NAME_PATTERN,
  type AppInfo,
  type DatabaseInfo,
  type PhoneStatus,
  type ReleaseInfo,
} from '@dukoi/shared'
import * as v from 'valibot'
import { fail, followLogAt, type Problem, phone, problem, signed } from '#lib/server/phone.js'
import { command, getRequestEvent, query } from '$app/server'
import { type LogLine, parseLogLine } from './log-line.js'

export type { LogLine }

const REFRESH_MS = 2000
const LOG_LINES = 500
const AppName = v.pipe(v.string(), v.regex(APP_NAME_PATTERN))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Overview {
  phone: { name: string; model: string; host: string }
  status: PhoneStatus | null
  apps: AppInfo[]
  databases: DatabaseInfo[]
  problem: Problem | null
}

/** The phone, its apps and databases, refreshed every 2 seconds. A lost phone shows as a problem, not an error. */
export const liveOverview = query.live(async function* () {
  const p = phone()
  let last: Overview | null = null
  while (true) {
    try {
      const [status, apps, databases] = await Promise.all([
        signed<PhoneStatus>('/status'),
        signed<AppInfo[]>('/apps'),
        // Phones from before 0.5.0 have no databases.
        signed<DatabaseInfo[]>('/databases').catch(() => []),
      ])
      last = {
        phone: { name: p.name, model: p.model, host: p.host },
        status,
        apps,
        databases,
        problem: null,
      }
    } catch (err) {
      last = {
        phone: { name: p.name, model: p.model, host: p.host },
        status: last?.status ?? null,
        apps: last?.apps ?? [],
        databases: last?.databases ?? [],
        problem: problem(err),
      }
    }
    yield last
    await sleep(REFRESH_MS)
  }
})

export interface AppDetail {
  app: AppInfo | null
  releases: ReleaseInfo[]
  problem: Problem | null
}

/** One app and its releases, refreshed every 2 seconds. */
export const liveApp = query.live(AppName, async function* (name) {
  let last: AppDetail = { app: null, releases: [], problem: null }
  while (true) {
    try {
      const [app, releases] = await Promise.all([
        signed<AppInfo>(`/apps/${name}`),
        signed<ReleaseInfo[]>(`/apps/${name}/releases`),
      ])
      last = { app, releases, problem: null }
    } catch (err) {
      last = { ...last, problem: problem(err) }
    }
    yield last
    await sleep(REFRESH_MS)
  }
})

export interface Logs {
  lines: LogLine[]
  problem: Problem | null
}

/** The last 500 lines, then every new line as it's written. Reconnects if the phone drops. */
export const liveLogs = query.live(AppName, async function* (name) {
  const { request } = getRequestEvent()
  let lines: LogLine[] = []
  while (!request.signal.aborted) {
    try {
      // Each connection starts with the recent lines, so start fresh.
      lines = []
      for await (const batch of followLogAt(
        `/apps/${encodeURIComponent(name)}/logs`,
        LOG_LINES,
        request.signal,
      )) {
        lines = [...lines, ...batch.map(parseLogLine)].slice(-LOG_LINES)
        yield { lines, problem: null } satisfies Logs
      }
    } catch (err) {
      if (request.signal.aborted) return
      yield { lines, problem: problem(err) } satisfies Logs
    }
    await sleep(3000)
  }
})

const Action = v.object({ name: AppName, action: v.picklist(['start', 'stop', 'restart']) })

/** Start, stop or restart an app. Restart waits for the health check. */
export const control = command(Action, async ({ name, action }) => {
  try {
    await signed(`/apps/${name}/${action}`, { method: 'POST', timeoutMs: 60_000 })
  } catch (err) {
    fail(err)
  }
})

/** Go back to an earlier release. */
export const rollback = command(
  v.object({ name: AppName, to: v.string() }),
  async ({ name, to }) => {
    try {
      await signed(`/apps/${name}/rollback`, { method: 'POST', body: { to }, timeoutMs: 60_000 })
    } catch (err) {
      fail(err)
    }
  },
)
