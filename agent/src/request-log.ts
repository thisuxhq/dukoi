// In-memory ring buffer of recent HTTP requests for one app.
// Kept in RAM only (no disk wear on the phone), capped per app and per body.
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { RequestDetail, RequestSummary } from '@dukoi/shared'

export const MAX_REQUESTS = 100
export const MAX_BODY_BYTES = 64 * 1024

const SENSITIVE_HEADER = /(authorization|cookie|token|secret|api[-_]?key|password|signature)/i
const BINARY_TYPE =
  /^(image|video|audio|font)\/|application\/(octet-stream|pdf|zip|gzip|wasm)|multipart\/form-data/i

export interface StoredRequest {
  summary: RequestSummary
  /** Raw request headers kept on the phone for replay, never sent to clients unredacted. */
  rawReqHeaders: Record<string, string>
  reqBody: Buffer
  reqTruncated: boolean
  resHeaders: Record<string, string>
  resBody: Buffer
  resTruncated: boolean
}

export class BodyCollector {
  private chunks: Buffer[] = []
  private kept = 0
  totalBytes = 0

  push(chunk: Buffer | string): void {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    this.totalBytes += buf.length
    const room = MAX_BODY_BYTES - this.kept
    if (room <= 0) return
    if (buf.length <= room) {
      this.chunks.push(buf)
      this.kept += buf.length
    } else {
      this.chunks.push(buf.subarray(0, room))
      this.kept += room
    }
  }

  get truncated(): boolean {
    return this.totalBytes > MAX_BODY_BYTES
  }

  buffer(): Buffer {
    if (this.chunks.length === 0) return Buffer.alloc(0)
    if (this.chunks.length === 1) return this.chunks[0] as Buffer
    return Buffer.concat(this.chunks, this.kept)
  }
}

export class RequestLog {
  private items: StoredRequest[] = []
  private nextSeq = 1
  private listeners = new Set<(summary: RequestSummary) => void>()
  private clearListeners = new Set<() => void>()

  record(input: {
    at: Date
    method: string
    path: string
    status: number
    durationMs: number
    from: string | null
    replayedFrom: string | null
    reqHeaders: IncomingHttpHeaders
    reqCollector: BodyCollector
    resHeaders: OutgoingHttpHeaders | IncomingHttpHeaders
    resCollector: BodyCollector
  }): RequestDetail {
    const id = `r_${String(this.nextSeq++).padStart(3, '0')}`
    const summary: RequestSummary = {
      id,
      at: input.at.toISOString(),
      method: input.method,
      path: input.path,
      status: input.status,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      reqBytes: input.reqCollector.totalBytes,
      resBytes: input.resCollector.totalBytes,
      from: input.from,
      replayedFrom: input.replayedFrom,
    }
    const stored: StoredRequest = {
      summary,
      rawReqHeaders: flattenHeaders(input.reqHeaders),
      reqBody: input.reqCollector.buffer(),
      reqTruncated: input.reqCollector.truncated,
      resHeaders: flattenHeaders(input.resHeaders),
      resBody: input.resCollector.buffer(),
      resTruncated: input.resCollector.truncated,
    }
    this.items.push(stored)
    if (this.items.length > MAX_REQUESTS) this.items.shift()
    for (const listener of this.listeners) listener(summary)
    return toDetail(stored)
  }

  /** Recent request summaries, oldest first. */
  list(limit = MAX_REQUESTS): RequestSummary[] {
    if (limit <= 0) return []
    return this.items.slice(-Math.min(limit, MAX_REQUESTS)).map((i) => i.summary)
  }

  /** Redacted detail for the API/CLI/dashboard. */
  get(id: string): RequestDetail | null {
    const found = this.items.find((i) => i.summary.id === id)
    return found ? toDetail(found) : null
  }

  /** Raw stored entry, used only on the phone for replay. */
  getRaw(id: string): StoredRequest | null {
    return this.items.find((i) => i.summary.id === id) ?? null
  }

  clear(): void {
    this.items = []
    for (const listener of this.clearListeners) listener()
  }

  subscribe(listener: (summary: RequestSummary) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeClear(listener: () => void): () => void {
    this.clearListeners.add(listener)
    return () => this.clearListeners.delete(listener)
  }
}

export function flattenHeaders(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADER.test(k) ? '[redacted]' : v
  }
  return out
}

function isBinary(headers: Record<string, string>, buf: Buffer): boolean {
  if (buf.length === 0) return false
  const ct = headers['content-type'] ?? ''
  if (BINARY_TYPE.test(ct)) return true
  const enc = headers['content-encoding'] ?? ''
  if (enc && enc.toLowerCase() !== 'identity') return true
  return buf.includes(0)
}

function toDetail(stored: StoredRequest): RequestDetail {
  const reqBinary = isBinary(stored.rawReqHeaders, stored.reqBody)
  const resBinary = isBinary(stored.resHeaders, stored.resBody)
  return {
    ...stored.summary,
    reqHeaders: redactHeaders(stored.rawReqHeaders),
    reqBody: reqBinary ? null : stored.reqBody.toString('utf8'),
    reqTruncated: stored.reqTruncated,
    reqBinary,
    resHeaders: redactHeaders(stored.resHeaders),
    resBody: resBinary ? null : stored.resBody.toString('utf8'),
    resTruncated: stored.resTruncated,
    resBinary,
  }
}

export function clientAddress(
  headers: IncomingHttpHeaders,
  remoteAddress: string | undefined,
): string | null {
  const cf = headers['cf-connecting-ip']
  const forwarded = headers['x-forwarded-for']
  const raw =
    (typeof cf === 'string' && cf.trim()) ||
    (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim()) ||
    remoteAddress ||
    ''
  if (!raw) return null
  return raw.replace(/^::ffff:/, '')
}
