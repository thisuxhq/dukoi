// The phone this dashboard controls, and signed calls to it. It uses the same
// key and paired phones as the CLI, so there's no second pairing, and the key
// never reaches the browser.
import { signRequest } from '@droidhost/shared'
import { error } from '@sveltejs/kit'
import { type CallOptions, call, pickPhone, unreachable } from 'droidhost/client'
import { computerKey, type SavedPhone } from 'droidhost/config'

import type { Problem } from '#lib/problem.js'

export type { Problem }

let chosen: SavedPhone | null = null

/** `droidhost dashboard --device x` passes its choice in DROIDHOST_DEVICE. */
export function phone(): SavedPhone {
  chosen ??= pickPhone(process.env.DROIDHOST_DEVICE || undefined)
  return chosen
}

export function signed<T>(path: string, opts?: CallOptions): Promise<T> {
  return call<T>(phone(), path, opts)
}

/** Turns the CLI's errors into the page's words. */
export function problem(err: unknown): Problem {
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, hint } = err as { message: string; hint?: string }
    return { message, hint }
  }
  return { message: 'Something went wrong.' }
}

/** For commands: fail with the phone's own words. */
export function fail(err: unknown): never {
  error(400, problem(err))
}

/** Follows an app's log: yields the new lines from each chunk the phone sends. */
export async function* followLog(
  app: string,
  lines: number,
  signal: AbortSignal,
): AsyncGenerator<string[]> {
  const p = phone()
  const path = `/apps/${encodeURIComponent(app)}/logs?lines=${lines}&follow=1`
  let res: Response
  try {
    res = await fetch(`http://${p.host}:${p.port}${path}`, {
      headers: signRequest({ method: 'GET', path, body: '' }, computerKey()),
      signal,
    })
  } catch (err) {
    throw unreachable(p, err)
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as Problem | null
    throw body ?? { message: 'Couldn’t read the logs.' }
  }
  const decoder = new TextDecoder()
  let partial = ''
  for await (const chunk of res.body) {
    const text = partial + decoder.decode(chunk, { stream: true })
    const parts = text.split('\n')
    partial = parts.pop() ?? ''
    // Lines starting with ":" are keep-alives.
    const lines = parts.filter((line) => line && !line.startsWith(':'))
    if (lines.length > 0) yield lines
  }
}
