// Custom domains: a public URL on your own Cloudflare domain that never changes.
//
// One Cloudflare named tunnel per phone serves every app that has a domain.
// cloudflared logs in, makes the tunnel and runs it. DNS records are managed
// through Cloudflare's API with the token from the login certificate, and
// Dukoi only ever replaces or deletes records it made itself (they carry
// the comment "Dukoi"). Like quick tunnels, the tunnel only ever points at
// app ports, never at the admin API.
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DomainStatus, ExposeResult } from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { AppProcess } from './app-process.ts'
import { HttpError } from './http.ts'
import { LogFile } from './log-file.ts'

const LOGIN_URL = /https:\/\/dash\.cloudflare\.com\/argotunnel\S+/
const CREATED = /Created tunnel \S+ with id ([0-9a-f-]{36})/
const REGISTERED = 'Registered tunnel connection'
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const COMMENT = 'Dukoi'
export const DOMAIN_WAIT_MS = 30_000

interface Cert {
  zoneID: string
  accountID: string
  apiToken: string
}

interface DnsRecord {
  id: string
  type: string
  content: string
  comment?: string | null
}

export class Domains {
  private login: ChildProcess | null = null
  private loginUrl: string | null = null
  private runner: AppProcess | null = null
  private runnerLog: LogFile
  private zoneName: string | null = null
  readonly dir: string

  constructor(private agent: Agent) {
    this.dir = join(agent.config.home, 'tunnels')
    this.runnerLog = new LogFile(join(this.dir, 'logs', 'tunnel.log'))
  }

  // ── Status and login ────────────────────────────────────────────────────

  async status(): Promise<DomainStatus> {
    const cert = this.cert()
    return {
      loggedIn: cert !== null,
      zone: cert ? await this.zone(cert).catch(() => null) : null,
      loginUrl: cert ? null : this.loginUrl,
      domains: this.agent.store.state.apps
        .filter((a) => a.domain)
        .map((a) => ({ app: a.name, hostname: a.domain as string })),
    }
  }

  /**
   * Starts `cloudflared tunnel login` and returns the page to open. The person
   * picks a domain there; cloudflared then saves the certificate on the phone.
   */
  async startLogin(): Promise<DomainStatus> {
    if (this.cert()) return this.status()
    if (!this.login) {
      mkdirSync(this.dir, { recursive: true })
      const child = spawn(this.binary(), ['tunnel', '--no-autoupdate', 'login'], {
        cwd: this.dir,
        env: this.env(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const read = (chunk: Buffer) => {
        const match = chunk.toString().match(LOGIN_URL)
        if (match) this.loginUrl = match[0]
      }
      child.stdout?.on('data', read)
      child.stderr?.on('data', read)
      child.on('exit', () => {
        this.login = null
        this.loginUrl = null
        this.zoneName = null
      })
      this.login = child
    }
    const deadline = Date.now() + 15_000
    while (!this.loginUrl && this.login && Date.now() < deadline) await sleep(200)
    if (!this.loginUrl) {
      throw new HttpError(
        504,
        'LOGIN_TIMEOUT',
        'Cloudflare didn’t answer within 15 seconds.',
        'Check the phone has internet, then try again.',
      )
    }
    return this.status()
  }

  // ── Adding and removing domains ─────────────────────────────────────────

  async add(name: string, rawHostname: string): Promise<ExposeResult> {
    const saved = this.agent.store.app(name)
    if (!saved) {
      throw new HttpError(404, 'NO_SUCH_APP', `There's no app called "${name}" on this phone.`)
    }
    if (saved.port === this.agent.config.adminPort) {
      throw new HttpError(400, 'ADMIN_PORT', 'The admin port can never be exposed.')
    }
    const hostname = normalize(rawHostname)
    if (!HOSTNAME.test(hostname)) {
      throw new HttpError(
        400,
        'BAD_HOSTNAME',
        `"${rawHostname}" isn’t a domain name.`,
        'Use something like api.example.com.',
      )
    }
    const cert = this.cert()
    if (!cert) {
      throw new HttpError(
        409,
        'NEEDS_LOGIN',
        'This phone isn’t connected to Cloudflare yet.',
        'Run `dukoi expose --domain` from your computer, or add a domain in the Dukoi app.',
      )
    }
    const zone = await this.zone(cert)
    if (hostname !== zone && !hostname.endsWith(`.${zone}`)) {
      throw new HttpError(
        400,
        'WRONG_ZONE',
        `This phone is connected to ${zone}, so it can’t use ${hostname}.`,
        `Use a name under ${zone}, like ${name}.${zone}.`,
      )
    }
    const owner = this.agent.store.state.apps.find((a) => a.domain === hostname && a.name !== name)
    if (owner) {
      throw new HttpError(409, 'DOMAIN_IN_USE', `${hostname} already belongs to ${owner.name}.`)
    }

    const tunnel = await this.ensureTunnel()
    const previous = saved.domain
    await this.pointDns(cert, hostname, tunnel)

    // A domain replaces a quick tunnel.
    await this.agent.tunnels.unexpose(name)
    saved.domain = hostname
    this.agent.store.save()
    if (previous && previous !== hostname)
      await this.deleteDns(cert, previous, tunnel).catch(() => {})

    await this.apply(true)
    const url = `https://${hostname}`
    await this.agent.apps.setPublicUrl(name, url)
    ;(await this.agent.apps.logFile(name)).note(`Public URL: ${url}`)
    return { app: name, publicUrl: url }
  }

  async remove(name: string): Promise<void> {
    const saved = this.agent.store.app(name)
    if (!saved?.domain) return
    const hostname = saved.domain
    delete saved.domain
    this.agent.store.save()
    const cert = this.cert()
    const tunnel = this.agent.store.state.tunnel
    if (cert && tunnel) await this.deleteDns(cert, hostname, tunnel.id).catch(() => {})
    await this.apply(false)
    await this.agent.apps.setPublicUrl(name, null)
  }

  /**
   * Disconnects the phone from Cloudflare. Every domain loses its public URL
   * and the DNS record Dukoi made, then the phone's tunnel and the login
   * certificate are deleted. The login's API token stays in the Cloudflare
   * account, because a token can't delete itself.
   */
  async logout(): Promise<DomainStatus> {
    this.login?.kill()
    const cert = this.cert()
    const tunnel = this.agent.store.state.tunnel
    for (const app of this.agent.store.state.apps.filter((a) => a.domain)) {
      if (cert && tunnel)
        await this.deleteDns(cert, app.domain as string, tunnel.id).catch(() => {})
      delete app.domain
      await this.agent.apps.setPublicUrl(app.name, null)
      ;(await this.agent.apps.logFile(app.name)).note(
        'Public URL removed: disconnected from Cloudflare',
      )
    }
    await this.runner?.stop()
    this.runner = null
    if (cert && tunnel) await this.run(['delete', '-f', tunnel.id]).catch(() => {})
    delete this.agent.store.state.tunnel
    this.agent.store.save()
    rmSync(join(this.dir, '.cloudflared'), { recursive: true, force: true })
    rmSync(join(this.dir, 'config.yml'), { force: true })
    this.zoneName = null
    return this.status()
  }

  /** Brings the tunnel back after the agent restarts. */
  async restore(): Promise<void> {
    const apps = this.agent.store.state.apps.filter((a) => a.domain)
    if (apps.length === 0 || !this.cert() || !this.agent.store.state.tunnel) return
    for (const a of apps) await this.agent.apps.setPublicUrl(a.name, `https://${a.domain}`)
    await this.apply(false).catch(() => {})
  }

  async stopAll(): Promise<void> {
    this.login?.kill()
    await this.runner?.stop(2000)
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Writes the tunnel's routes and restarts it. With [wait], waits until Cloudflare has it. */
  private async apply(wait: boolean): Promise<void> {
    const tunnel = this.agent.store.state.tunnel
    const apps = this.agent.store.state.apps.filter(
      (a) => a.domain && a.port !== this.agent.config.adminPort,
    )
    if (!tunnel || apps.length === 0) {
      await this.runner?.stop()
      this.runner = null
      return
    }
    const config = join(this.dir, 'config.yml')
    const lines = [
      `tunnel: ${tunnel.id}`,
      `credentials-file: ${this.credentials(tunnel.id)}`,
      'ingress:',
      ...apps.flatMap((a) => [
        `  - hostname: ${a.domain}`,
        `    service: http://127.0.0.1:${a.port}`,
      ]),
      '  - service: http_status:404',
      '',
    ]
    writeFileSync(config, lines.join('\n'), { mode: 0o600 })

    await this.runner?.stop()
    this.runner = new AppProcess(
      'domains-tunnel',
      {
        command: this.binary(),
        args: ['tunnel', '--no-autoupdate', '--config', config, 'run'],
        cwd: this.dir,
        env: this.env(),
      },
      this.runnerLog,
      join(this.dir, 'tunnel.pid'),
    )
    let registered = false
    const stop = this.runnerLog.subscribe((line) => {
      if (line.text.includes(REGISTERED)) registered = true
    })
    this.runner.start()
    if (wait) {
      const deadline = Date.now() + DOMAIN_WAIT_MS
      while (!registered && Date.now() < deadline) await sleep(250)
    }
    stop()
    if (wait && !registered) {
      throw new HttpError(
        504,
        'TUNNEL_TIMEOUT',
        'The tunnel didn’t connect to Cloudflare within 30 seconds.',
        'Check the phone has internet. Dukoi keeps trying in the background.',
      )
    }
  }

  /** The phone's one named tunnel, made the first time a domain is added. */
  private async ensureTunnel(): Promise<string> {
    const saved = this.agent.store.state.tunnel
    if (saved && existsSync(this.credentials(saved.id))) return saved.id
    const phone = this.agent.config.phone.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    const name = `dukoi-${phone}-${randomBytes(2).toString('hex')}`
    const out = await this.run(['create', name])
    const id = out.match(CREATED)?.[1]
    if (!id) {
      throw new HttpError(
        502,
        'TUNNEL_CREATE',
        'Cloudflare didn’t create the tunnel.',
        out.trim().split('\n').pop(),
      )
    }
    this.agent.store.state.tunnel = { id, name }
    this.agent.store.save()
    return id
  }

  /** Points [hostname] at the tunnel. Only replaces records Dukoi made. */
  private async pointDns(cert: Cert, hostname: string, tunnelId: string): Promise<void> {
    const target = `${tunnelId}.cfargotunnel.com`
    const existing = await this.records(cert, hostname)
    const body = { type: 'CNAME', name: hostname, content: target, proxied: true, comment: COMMENT }
    const record = existing[0]
    if (!record) {
      await this.api(cert, 'POST', `/zones/${cert.zoneID}/dns_records`, body)
    } else if (record.type === 'CNAME' && record.content === target) {
      // Already ours.
    } else if (record.comment === COMMENT) {
      await this.api(cert, 'PUT', `/zones/${cert.zoneID}/dns_records/${record.id}`, body)
    } else {
      throw new HttpError(
        409,
        'DNS_TAKEN',
        `${hostname} already points somewhere else.`,
        'Pick another name, or delete that DNS record in Cloudflare first.',
      )
    }
  }

  private async deleteDns(cert: Cert, hostname: string, tunnelId: string): Promise<void> {
    const target = `${tunnelId}.cfargotunnel.com`
    for (const r of await this.records(cert, hostname)) {
      if (r.content === target)
        await this.api(cert, 'DELETE', `/zones/${cert.zoneID}/dns_records/${r.id}`)
    }
  }

  private records(cert: Cert, hostname: string): Promise<DnsRecord[]> {
    return this.api<DnsRecord[]>(
      cert,
      'GET',
      `/zones/${cert.zoneID}/dns_records?name=${encodeURIComponent(hostname)}`,
    )
  }

  private async zone(cert: Cert): Promise<string> {
    this.zoneName ??= (await this.api<{ name: string }>(cert, 'GET', `/zones/${cert.zoneID}`)).name
    return this.zoneName
  }

  private async api<T>(cert: Cert, method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.agent.config.cloudflareApi}${path}`, {
        method,
        headers: { authorization: `Bearer ${cert.apiToken}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new HttpError(
        502,
        'CLOUDFLARE_UNREACHABLE',
        'The phone couldn’t reach Cloudflare.',
        'Check the phone has internet.',
      )
    }
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      result?: T
      errors?: { message: string }[]
    }
    if (!json.success) {
      throw new HttpError(
        502,
        'CLOUDFLARE',
        `Cloudflare said: ${json.errors?.[0]?.message ?? `HTTP ${res.status}`}`,
      )
    }
    return json.result as T
  }

  /** Runs a one-off `cloudflared tunnel …` command and returns its output. */
  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.binary(),
        ['tunnel', '--no-autoupdate', ...args],
        { cwd: this.dir, env: this.env(), timeout: 60_000 },
        (err, stdout, stderr) => {
          const out = `${stdout}${stderr}`
          if (err)
            reject(
              new HttpError(
                502,
                'CLOUDFLARED',
                'cloudflared failed.',
                out.trim().split('\n').pop(),
              ),
            )
          else resolve(out)
        },
      )
    })
  }

  /** The login certificate cloudflared saved, or null before login. */
  private cert(): Cert | null {
    try {
      const pem = readFileSync(join(this.dir, '.cloudflared', 'cert.pem'), 'utf8')
      const body = pem
        .split('\n')
        .filter((l) => l && !l.startsWith('-----'))
        .join('')
      const cert = JSON.parse(Buffer.from(body, 'base64').toString()) as Cert
      return cert.apiToken && cert.zoneID ? cert : null
    } catch {
      return null
    }
  }

  private credentials(id: string): string {
    return join(this.dir, '.cloudflared', `${id}.json`)
  }

  /** cloudflared keeps its files under $HOME/.cloudflared, so HOME is the tunnels folder. */
  private env(): Record<string, string> {
    return {
      HOME: this.dir,
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      PATH: process.env.PATH ?? '/system/bin',
    }
  }

  private binary(): string {
    const binary = this.agent.config.cloudflaredPath
    if (!binary) {
      throw new HttpError(
        501,
        'NO_CLOUDFLARED',
        'This build of Dukoi has no cloudflared.',
        'Update the Dukoi app.',
      )
    }
    return binary
  }
}

/** "https://API.example.com/" → "api.example.com" */
export function normalize(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
