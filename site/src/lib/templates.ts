// The templates, as the site shows them. Same ids, names and descriptions
// as TEMPLATES in shared/src/api.ts (kept here so the static site stays browser-only).
export interface SiteTemplate {
  id: string
  name: string
  description: string
  icon: string
  /** Pastel background for cards and the icon chip */
  tint: string
  /** The icon's colour on that tint */
  ink: string
}

export const templates: SiteTemplate[] = [
  {
    id: 'static-site',
    name: 'Static site',
    description: 'A one-page site with your name on it',
    icon: 'browser',
    tint: 'bg-mint',
    ink: 'text-running',
  },
  {
    id: 'notes-api',
    name: 'Notes API',
    description: 'A small JSON API with a database',
    icon: 'api',
    tint: 'bg-lavender',
    ink: 'text-violet',
  },
  {
    id: 'file-drop',
    name: 'File drop',
    description: 'Upload a file, get a link to share',
    icon: 'folder-01',
    tint: 'bg-peach',
    ink: 'text-orange',
  },
  {
    id: 'mcp-server',
    name: 'MCP server',
    description: 'A tool your AI assistant can call',
    icon: 'mcp-server',
    tint: 'bg-rose',
    ink: 'text-pink',
  },
  {
    id: 'telegram-bot',
    name: 'Telegram bot',
    description: 'A bot that replies, always on',
    icon: 'telegram',
    tint: 'bg-sky',
    ink: 'text-blue',
  },
  {
    id: 'webhook-inbox',
    name: 'Webhook inbox',
    description: 'See every webhook as it arrives',
    icon: 'webhook',
    tint: 'bg-teal',
    ink: 'text-teal-ink',
  },
  {
    id: 'uptime-watch',
    name: 'Uptime watch',
    description: 'Get a ping when a site goes down',
    icon: 'activity-03',
    tint: 'bg-butter',
    ink: 'text-amber',
  },
  {
    id: 'cron-jobs',
    name: 'Cron jobs',
    description: 'Run code on a schedule',
    icon: 'clock-01',
    tint: 'bg-slate',
    ink: 'text-slate-ink',
  },
]

export const template = (id: string) => templates.find((t) => t.id === id) as SiteTemplate
