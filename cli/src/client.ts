// Talks to a phone's admin API. Signs every request with this computer's key
// and checks every response is signed by the phone we paired with.
import { randomBytes } from 'node:crypto'
import { type ApiError, HEADER, signRequest, verifyResponse } from '@droidhost/shared'
import { computerKey, loadPhones, markUsed, type SavedPhone } from './config.ts'
import { CliError } from './output.ts'

export interface Target {
  host: string
  port: number
  /** null before pairing, when we don't know the phone's key yet */
  publicKey: string | null
}

export interface CallOptions {
  method?: string
  body?: unknown
  /** Sign with this computer's key (needed for everything but /info and /pair) */
  signed?: boolean
  timeoutMs?: number
}

export async function call<T>(target: Target, path: string, opts: CallOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const body = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  let nonce: string
  if (opts.signed ?? true) {
    Object.assign(headers, signRequest({ method, path, body }, computerKey()))
    nonce = headers[HEADER.nonce] as string
  } else {
    nonce = randomBytes(16).toString('base64url')
    headers[HEADER.nonce] = nonce
  }

  let res: Response
  try {
    res = await fetch(`http://${target.host}:${target.port}${path}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    })
  } catch (err) {
    throw unreachable(target, err)
  }
  const text = await res.text()
  return parseVerified<T>(target, res, text, nonce)
}

export function parseVerified<T>(target: Target, res: Response, text: string, nonce: string): T {
  if (
    target.publicKey &&
    !verifyResponse(res.status, nonce, text, res.headers.get(HEADER.signature), target.publicKey)
  ) {
    throw new CliError(
      'BAD_PHONE_SIGNATURE',
      `The answer from ${target.host} wasn't signed by your paired phone.`,
      'Something else may be using its address. Check the phone is on, then run `droidhost pair` again.',
    )
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new CliError(
      'BAD_RESPONSE',
      `The phone sent something that isn't JSON (HTTP ${res.status}).`,
    )
  }
  if (!res.ok) throw CliError.from(value as ApiError)
  return value as T
}

export function unreachable(target: Target, err: unknown): CliError {
  const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'not reachable'
  return new CliError(
    'PHONE_UNREACHABLE',
    `The phone at ${target.host}:${target.port} is ${reason}.`,
    'Check the phone is on the same Wi-Fi and DroidHost is running, then try again.',
  )
}

/** The phone to use: --device, else the last one used, else the only one. */
export function pickPhone(name?: string): SavedPhone {
  const { phones, lastUsed } = loadPhones()
  if (phones.length === 0) {
    throw new CliError(
      'NOT_PAIRED',
      'This computer isn’t paired with a phone yet.',
      'Run `droidhost pair`.',
    )
  }
  const phone = name
    ? phones.find((p) => p.name === name)
    : (phones.find((p) => p.name === lastUsed) ?? phones[0])
  if (!phone) {
    throw new CliError(
      'UNKNOWN_DEVICE',
      `No paired phone called "${name}".`,
      `Paired phones: ${phones.map((p) => p.name).join(', ')}`,
    )
  }
  markUsed(phone.name)
  return phone
}
