// Databases and templates: what the Templates page and a database's page read
// from and do to the phone. Like phone.remote.ts, these run on the local
// server, which signs each call with this computer's key.
import {
  APP_NAME_PATTERN,
  type DatabaseInfo,
  type DatabaseKindStatus,
  type DeployResult,
  type TemplateInfo,
} from '@dukoi/shared'
import * as v from 'valibot'
import type { Problem } from '#lib/problem.js'
import { fail, followLogAt, problem, signed } from '#lib/server/phone.js'
import { command, getRequestEvent, query } from '$app/server'
import { type LogLine, parseLogLine } from './log-line.js'

const REFRESH_MS = 2000
const LOG_LINES = 500
const Name = v.pipe(v.string(), v.regex(APP_NAME_PATTERN))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Catalog {
  kinds: DatabaseKindStatus[]
  templates: TemplateInfo[]
  /** App names, for "Give these apps REDIS_URL" */
  apps: string[]
  problem: Problem | null
}

/** Everything the Templates page offers. Phones from before 0.5.0 have no databases. */
export const getCatalog = query(async (): Promise<Catalog> => {
  try {
    const [kinds, templates, apps] = await Promise.all([
      signed<DatabaseKindStatus[]>('/database-kinds').catch(() => []),
      signed<TemplateInfo[]>('/templates').catch(() => []),
      signed<{ name: string }[]>('/apps'),
    ])
    return { kinds, templates, apps: apps.map((a) => a.name), problem: null }
  } catch (err) {
    return { kinds: [], templates: [], apps: [], problem: problem(err) }
  }
})

export interface DatabaseDetail {
  db: DatabaseInfo | null
  /** Every app on the phone, for Connect an app */
  apps: string[]
  problem: Problem | null
}

/** One database, refreshed every 2 seconds. */
export const liveDatabase = query.live(Name, async function* (name) {
  let last: DatabaseDetail = { db: null, apps: [], problem: null }
  while (true) {
    try {
      const [db, apps] = await Promise.all([
        signed<DatabaseInfo>(`/databases/${name}`),
        signed<{ name: string }[]>('/apps'),
      ])
      last = { db, apps: apps.map((a) => a.name), problem: null }
    } catch (err) {
      last = { ...last, problem: problem(err) }
    }
    yield last
    await sleep(REFRESH_MS)
  }
})

/** A database's log: the last 500 lines, then every new one. */
export const liveDatabaseLogs = query.live(Name, async function* (name) {
  const { request } = getRequestEvent()
  let lines: LogLine[] = []
  while (!request.signal.aborted) {
    try {
      lines = []
      for await (const batch of followLogAt(
        `/databases/${encodeURIComponent(name)}/logs`,
        LOG_LINES,
        request.signal,
      )) {
        lines = [...lines, ...batch.map(parseLogLine)].slice(-LOG_LINES)
        yield { lines, problem: null as Problem | null }
      }
    } catch (err) {
      if (request.signal.aborted) return
      yield { lines, problem: problem(err) }
    }
    await sleep(3000)
  }
})

/** Make a Redis or Postgres. Waits until it takes connections. */
export const createDatabase = command(
  v.object({
    kind: v.picklist(['redis', 'postgres']),
    name: v.optional(Name),
    apps: v.array(Name),
    wifi: v.boolean(),
  }),
  async (body) => {
    try {
      return await signed<DatabaseInfo>('/databases', {
        method: 'POST',
        body,
        timeoutMs: 120_000,
      })
    } catch (err) {
      fail(err)
    }
  },
)

/** Wi-Fi on or off, a new password, or connect and disconnect apps. */
export const changeDatabase = command(
  v.object({
    name: Name,
    wifi: v.optional(v.boolean()),
    newPassword: v.optional(v.boolean()),
    connect: v.optional(v.array(Name)),
    disconnect: v.optional(v.array(Name)),
  }),
  async ({ name, ...change }) => {
    try {
      return await signed<DatabaseInfo>(`/databases/${name}`, {
        method: 'PATCH',
        body: change,
        timeoutMs: 120_000,
      })
    } catch (err) {
      fail(err)
    }
  },
)

/** Start, stop or restart a database. */
export const controlDatabase = command(
  v.object({ name: Name, action: v.picklist(['start', 'stop', 'restart']) }),
  async ({ name, action }) => {
    try {
      await signed(`/databases/${name}/${action}`, { method: 'POST', timeoutMs: 90_000 })
    } catch (err) {
      fail(err)
    }
  },
)

/** Deletes a database and its data, and takes its URL from the apps. */
export const removeDatabase = command(Name, async (name) => {
  try {
    await signed(`/databases/${name}`, { method: 'DELETE', timeoutMs: 60_000 })
  } catch (err) {
    fail(err)
  }
})

/** Deploys a template from the phone's own copy, like Try a template on the phone. */
export const deployTemplate = command(
  v.object({ id: Name, env: v.optional(v.record(v.string(), v.string())) }),
  async ({ id, env }) => {
    try {
      return await signed<DeployResult>(`/templates/${id}/deploy`, {
        method: 'POST',
        body: { env },
        timeoutMs: 120_000,
      })
    } catch (err) {
      fail(err)
    }
  },
)
