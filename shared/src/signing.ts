// Signed requests and responses for the admin API.
//
// The CLI signs every request with its device key. The phone checks the key is
// paired, the signature is right, the time is close and the nonce is new. The
// phone signs its JSON responses with its own key, which the CLI pinned at
// pairing, so a fake phone on the same Wi-Fi can't answer for it.
import { randomBytes } from 'node:crypto'
import { sha256Hex, signText, verifyText } from './keys.ts'

export const HEADER = {
  key: 'x-dukoi-key',
  time: 'x-dukoi-time',
  nonce: 'x-dukoi-nonce',
  signature: 'x-dukoi-signature',
  /** The phone's PROTOCOL_VERSION, on every admin API response */
  protocol: 'x-dukoi-protocol',
} as const

/** How far apart the computer's and phone's clocks may be. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export interface RequestToSign {
  method: string
  /** Path and query, e.g. /apps/my-api/logs?lines=50 */
  path: string
  body?: Uint8Array | string
}

function requestText(req: RequestToSign, time: string, nonce: string): string {
  const body = req.body ?? ''
  return [
    'dukoi-request-v1',
    req.method.toUpperCase(),
    req.path,
    time,
    nonce,
    sha256Hex(body),
  ].join('\n')
}

function responseText(status: number, nonce: string, body: Uint8Array | string): string {
  return ['dukoi-response-v1', String(status), nonce, sha256Hex(body)].join('\n')
}

/** Headers the CLI adds to a request. */
export function signRequest(
  req: RequestToSign,
  key: { publicKey: string; privateKeyPem: string },
  now = Date.now(),
): Record<string, string> {
  const time = String(now)
  const nonce = randomBytes(16).toString('base64url')
  return {
    [HEADER.key]: key.publicKey,
    [HEADER.time]: time,
    [HEADER.nonce]: nonce,
    [HEADER.signature]: signText(key.privateKeyPem, requestText(req, time, nonce)),
  }
}

export type VerifyResult =
  | { ok: true; publicKey: string; nonce: string }
  | { ok: false; code: 'NOT_SIGNED' | 'BAD_SIGNATURE' | 'CLOCK_SKEW' | 'REPLAY'; message: string }

/** Remembers recent nonces so a captured request can't be sent twice. */
export class NonceCache {
  private seen = new Map<string, number>()

  /** Returns false if the nonce was already used. */
  use(nonce: string, now = Date.now()): boolean {
    for (const [n, at] of this.seen) {
      if (now - at > MAX_CLOCK_SKEW_MS * 2) this.seen.delete(n)
    }
    if (this.seen.has(nonce)) return false
    this.seen.set(nonce, now)
    return true
  }
}

/** Checks a signed request on the phone. Doesn't check the key is paired. */
export function verifyRequest(
  req: RequestToSign,
  headers: Record<string, string | string[] | undefined>,
  nonces: NonceCache,
  now = Date.now(),
): VerifyResult {
  const get = (name: string) => {
    const v = headers[name]
    return Array.isArray(v) ? v[0] : v
  }
  const publicKey = get(HEADER.key)
  const time = get(HEADER.time)
  const nonce = get(HEADER.nonce)
  const signature = get(HEADER.signature)
  if (!publicKey || !time || !nonce || !signature) {
    return {
      ok: false,
      code: 'NOT_SIGNED',
      message: 'This request isn’t signed by a paired computer.',
    }
  }
  if (Math.abs(now - Number(time)) > MAX_CLOCK_SKEW_MS) {
    return {
      ok: false,
      code: 'CLOCK_SKEW',
      message: 'The computer’s clock and the phone’s clock are more than 5 minutes apart.',
    }
  }
  if (!verifyText(publicKey, requestText(req, time, nonce), signature)) {
    return { ok: false, code: 'BAD_SIGNATURE', message: 'The request signature doesn’t match.' }
  }
  if (!nonces.use(nonce, now)) {
    return { ok: false, code: 'REPLAY', message: 'This request was already used.' }
  }
  return { ok: true, publicKey, nonce }
}

/** Signature header the phone adds to a JSON response. */
export function signResponse(
  status: number,
  nonce: string,
  body: Uint8Array | string,
  privateKeyPem: string,
): string {
  return signText(privateKeyPem, responseText(status, nonce, body))
}

/** Checks a response came from the pinned phone. */
export function verifyResponse(
  status: number,
  nonce: string,
  body: Uint8Array | string,
  signature: string | null,
  phoneKey: string,
): boolean {
  if (!signature) return false
  return verifyText(phoneKey, responseText(status, nonce, body), signature)
}
