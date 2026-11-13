import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type DeployResult, HEADER, signRequest } from '@dukoi/shared'
import { readAppFolder } from '../app-folder.ts'
import { parseVerified, pickPhone, unreachable } from '../client.ts'
import { computerKey } from '../config.ts'
import { c, info, ok } from '../output.ts'
import { packApp } from '../pack-app.ts'

export { CLI_VERSION } from '../pack-app.ts'

export interface DeployOptions {
  folder: string
  name?: string
  device?: string
  noHealthCheck: boolean
  json: boolean
  /** Lines to end with instead of the logs and public URL tips (init uses this) */
  next?: string[]
  /** Print nothing, not even JSON (bench uses this) */
  quiet?: boolean
}

export async function deploy(opts: DeployOptions): Promise<DeployResult> {
  const silent = opts.json || opts.quiet === true
  const step = (msg: string) => !silent && ok(msg)
  const app = readAppFolder(opts.folder, { name: opts.name, noHealthCheck: opts.noHealthCheck })
  const phone = pickPhone(opts.device)
  const t0 = Date.now()

  const upload = packApp(app, step, silent)
  const result = await send(phone, app.name, upload)
  step(`Uploaded to ${phone.name}`)
  step(`Started and healthy (release ${result.release})`)

  if (opts.quiet) return result
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, ...result, totalMs: Date.now() - t0 }))
    return result
  }
  info('')
  info(`  ${c.dim('Local ')}  ${c.cyan(result.app.localUrl)}`)
  if (result.app.publicUrl) info(`  ${c.dim('Public')}  ${c.cyan(result.app.publicUrl)}`)
  info('')
  if (opts.next) {
    for (const line of opts.next) info(`  ${line}`)
    return result
  }
  info(`  ${c.dim('Logs  ')}  dukoi logs ${app.name}`)
  if (!result.app.publicUrl) info(`  ${c.dim('Public')}  dukoi expose ${app.name}`)
  info(c.dim(`\n  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`))
  return result
}

async function send(
  phone: ReturnType<typeof pickPhone>,
  name: string,
  upload: Buffer,
): Promise<DeployResult> {
  const sha256 = createHash('sha256').update(upload).digest('hex')
  const path = `/apps/${encodeURIComponent(name)}/deploy?sha256=${sha256}`
  const headers = signRequest({ method: 'POST', path, body: '' }, computerKey())
  let res: Response
  try {
    res = await fetch(`http://${phone.host}:${phone.port}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: upload,
      signal: AbortSignal.timeout(5 * 60 * 1000),
    })
  } catch (err) {
    throw unreachable(phone, err)
  }
  return parseVerified<DeployResult>(phone, res, await res.text(), headers[HEADER.nonce] as string)
}

export function readPackageName(folder: string): string | null {
  try {
    return (
      (JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { name?: string }).name ??
      null
    )
  } catch {
    return null
  }
}
