// How each template and database kind looks: the icon and its tile colours,
// the same as the phone app's Try a template list (ui/Templates.kt).
import type { IconName } from '#lib/components/Icon.svelte'

export interface Look {
  icon: IconName
  /** Tile background */
  tile: string
  /** Icon colour */
  tint: string
}

const looks: Record<string, Look> = {
  'static-site': { icon: 'browser', tile: '#DDF2E5', tint: '#18A957' },
  'notes-api': { icon: 'api', tile: '#EDE7FB', tint: '#7B3FF2' },
  'file-drop': { icon: 'folder-01', tile: '#FCE6D8', tint: '#E0662A' },
  'mcp-server': { icon: 'mcp-server', tile: '#FBE3EA', tint: '#D2416E' },
  'telegram-bot': { icon: 'telegram', tile: '#E0ECFB', tint: '#2F6FD6' },
  'webhook-inbox': { icon: 'webhook', tile: '#DCF1EF', tint: '#0F7F75' },
  'uptime-watch': { icon: 'activity-03', tile: '#FBEFD2', tint: '#A86A0C' },
  'cron-jobs': { icon: 'clock-01', tile: '#E4E6EC', tint: '#3C4458' },
  redis: { icon: 'database-lightning', tile: '#FBE2E4', tint: '#C62A2F' },
  postgres: { icon: 'database', tile: '#E0ECFB', tint: '#2F6FD6' },
}

export const look = (id: string): Look =>
  looks[id] ?? { icon: 'api', tile: '#EDE7FB', tint: '#7B3FF2' }
