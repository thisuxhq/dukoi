// dukoi bench: readings while the load runs, and the phone's signature on the result.
import { readFileSync } from 'node:fs'
import { freemem, totalmem } from 'node:os'
import {
  type BatteryNow,
  type BenchSample,
  type BenchSignature,
  benchSignedText,
  sha256Hex,
  signText,
} from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { HttpError } from './http.ts'

export function benchRoutes(agent: Agent): void {
  const r = agent.router

  r.on('GET', '/bench/sample', 'paired', async (ctx): Promise<BenchSample> => {
    const name = ctx.query.get('app')
    const app = name ? (await agent.apps.list()).find((a) => a.name === name) : undefined
    return {
      battery: readBattery(agent.paths.battery),
      app: app ? { cpuPercent: app.cpuPercent, memoryMb: app.memoryMb } : null,
      memory: {
        totalMb: Math.round(totalmem() / 1024 / 1024),
        freeMb: Math.round(freemem() / 1024 / 1024),
      },
    }
  })

  // The phone signs exactly the bytes it was sent, so dukoi.com can tell
  // which phone a shared result came from and that nothing changed on the way.
  r.on('POST', '/bench/sign', 'paired', (ctx): BenchSignature => {
    let result: { version?: unknown }
    try {
      result = ctx.json()
    } catch {
      throw new HttpError(400, 'BAD_RESULT', 'That benchmark result isn’t JSON.')
    }
    if (result?.version !== 1)
      throw new HttpError(400, 'BAD_RESULT', 'That isn’t a benchmark result this phone knows.')
    const { identity } = agent.store.state
    return {
      phoneKey: identity.publicKey,
      signature: signText(identity.privateKeyPem, benchSignedText(sha256Hex(ctx.body))),
    }
  })
}

/** The battery as the phone app last wrote it, or null on phones that don't write it. */
export function readBattery(file: string): BatteryNow | null {
  try {
    const b = JSON.parse(readFileSync(file, 'utf8')) as Partial<BatteryNow>
    return {
      level: typeof b.level === 'number' ? b.level : null,
      temperatureC: typeof b.temperatureC === 'number' ? b.temperatureC : null,
      pluggedIn: b.pluggedIn === true,
      at: typeof b.at === 'string' ? b.at : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}
