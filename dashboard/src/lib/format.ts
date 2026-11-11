// Numbers as the phone app and CLI show them.
import type { PhoneStatus } from '@dukoi/shared'

/** 45 → "45s", 3700 → "1h", 90000 → "1d" */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function since(iso: string | null): string {
  return iso ? duration(Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))) : '–'
}

/** Load average over cores, like the phone app's CPU number. */
export function cpu(s: PhoneStatus): string {
  const load = s.load[0] ?? 0
  return `${Math.min(100, Math.round((load / Math.max(1, s.cpuCount)) * 100))}%`
}

export function memory(s: PhoneStatus): string {
  return `${Math.round(((s.memory.totalMb - s.memory.freeMb) / s.memory.totalMb) * 100)}%`
}

export function storageFree(s: PhoneStatus): string {
  return s.storage ? `${(s.storage.freeMb / 1024).toFixed(1)} GB` : '–'
}

/** "Today, 09:12", "Yesterday, 18:40" or "9 Nov, 11:05" */
export function when(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = new Date(d).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  if (day === today) return `Today, ${time}`
  if (day === today - 86_400_000) return `Yesterday, ${time}`
  return `${d.getDate()} ${d.toLocaleString([], { month: 'short' })}, ${time}`
}

/** "https://api.example.com" → "api.example.com" */
export function bare(url: string): string {
  return url.replace(/^https?:\/\//, '')
}
