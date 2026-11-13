// Settings the Kotlin app passes in when it starts the agent.
import { join } from 'node:path'
import { ADMIN_PORT, DUKOI_VERSION } from '@dukoi/shared'

export const AGENT_VERSION = DUKOI_VERSION

export interface Config {
  /** Root of everything the agent stores: state, apps, logs */
  home: string
  adminPort: number
  /** Node binary used to start apps (the same one running the agent) */
  nodePath: string
  /** cloudflared binary for public URLs, if bundled */
  cloudflaredPath: string | null
  /** Cloudflare's API, for DNS records of custom domains (overridden in tests) */
  cloudflareApi: string
  /** Template archives (<id>.tgz) the phone app copies out of the APK */
  templatesDir: string
  phone: { name: string; model: string; android: string; maker?: string; chip?: string }
}

export function loadConfig(env = process.env): Config {
  const home = env.DUKOI_HOME ?? join(process.cwd(), '.dukoi-home')
  return {
    home,
    adminPort: Number(env.DUKOI_ADMIN_PORT ?? ADMIN_PORT),
    nodePath: process.execPath,
    cloudflaredPath: env.DUKOI_CLOUDFLARED ?? null,
    cloudflareApi: env.DUKOI_CLOUDFLARE_API ?? 'https://api.cloudflare.com/client/v4',
    templatesDir: env.DUKOI_TEMPLATES ?? join(home, 'templates'),
    phone: {
      name: env.DUKOI_PHONE_NAME ?? 'phone',
      model: env.DUKOI_PHONE_MODEL ?? 'unknown',
      android: env.DUKOI_ANDROID ?? 'unknown',
      maker: env.DUKOI_PHONE_MAKER,
      chip: env.DUKOI_PHONE_CHIP,
    },
  }
}

export const paths = (home: string) => ({
  state: join(home, 'state.json'),
  apps: join(home, 'apps'),
  app: (name: string) => join(home, 'apps', name),
  logs: (name: string) => join(home, 'apps', name, 'logs'),
  pid: (name: string) => join(home, 'apps', name, 'app.pid'),
  /** Written by the phone app whenever Android reports a battery change */
  battery: join(home, 'battery.json'),
})
