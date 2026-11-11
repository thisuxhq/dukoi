// Templates on the phone: Try a template deploys one without a computer.
// The phone app copies each template's archive out of the APK; the CLI packs
// them the same way a deploy does (scripts/pack-templates.ts).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type DeployResult, TEMPLATES, type TemplateInfo } from '@dukoi/shared'
import type { Agent } from './agent.ts'
import { HttpError } from './http.ts'

export class Templates {
  constructor(private agent: Agent) {}

  private archive(id: string): string {
    return join(this.agent.config.templatesDir, `${id}.tgz`)
  }

  /** The templates this phone has archives for. */
  list(): TemplateInfo[] {
    return TEMPLATES.filter((t) => existsSync(this.archive(t.id)))
  }

  /** Deploys a template as an app named after it, with any settings it needs. */
  async deploy(id: string, env: Record<string, string> = {}): Promise<DeployResult> {
    const template = this.list().find((t) => t.id === id)
    if (!template)
      throw new HttpError(
        404,
        'NO_SUCH_TEMPLATE',
        `There's no template called "${id}" on this phone.`,
      )
    if (template.secret && !env[template.secret]?.trim())
      throw new HttpError(
        400,
        'NEEDS_SETTING',
        `${template.name} needs ${template.secret}.`,
        'Paste it, then tap Deploy again.',
      )

    const apps = this.agent.apps
    const isNew = !this.agent.store.app(id)
    // Settings go in first, so the app has them on its first start.
    if (Object.keys(env).length) await apps.setEnv(id, { set: env }, true)
    try {
      const result = await apps.deployArchive(id, readFileSync(this.archive(id)))
      await apps.setTemplate(id, id)
      return { ...result, app: { ...result.app, template: id } }
    } catch (err) {
      // The app's own last words usually say what's wrong, like a token Telegram refused.
      const said = template.secret
        ? (await apps.logFile(id).catch(() => null))
            ?.tail(10)
            .map((line) => line.match(/^\S+ (\S+)\s+(.*)$/))
            .findLast((m) => m && m[1] !== 'agent')?.[2]
        : undefined
      // Don't leave an empty app behind when a first deploy fails.
      if (isNew && !this.agent.store.app(id)?.release) await apps.remove(id).catch(() => {})
      if (said && err instanceof HttpError && err.code === 'CRASHED_ON_START')
        throw new HttpError(400, 'BAD_SETTING', said, `Check ${template.secret} and try again.`)
      throw err
    }
  }
}
