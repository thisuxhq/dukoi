// Make it yours: the jobs and when they run.
//
// schedule  a cron schedule: minute, hour, day of month, month, day of week.
//           '*/15 * * * *' is every 15 minutes, '0 9 * * 1-5' is 09:00 on weekdays,
//           and '@hourly', '@daily', '@weekly' and '@monthly' work too.
// run()     your code. What it returns shows on the page. If it throws, the run counts as failed.
import { existsSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Dukoi sets DATA_DIR to a folder that survives deploys. Keep anything a job remembers there.
const DATA = process.env.DATA_DIR ?? '.'

export const jobs = [
  {
    name: 'New posts on Hacker News',
    schedule: '*/15 * * * *',
    async run() {
      const res = await fetch('https://news.ycombinator.com/rss')
      if (!res.ok) throw new Error(`Hacker News answered ${res.status}`)
      const xml = await res.text()
      const titles = [...xml.matchAll(/<item>\s*<title>([\s\S]*?)<\/title>/g)].map((m) =>
        decode(m[1]),
      )

      // Remember what we've seen, so each run lists only what's new.
      const file = join(DATA, 'hn-seen.json')
      const seen = new Set(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [])
      const fresh = titles.filter((t) => !seen.has(t))
      writeFileSync(file, JSON.stringify(titles))

      if (fresh.length === 0) return 'Nothing new'
      return `${fresh.length} new on the front page\n${fresh.map((t) => `  ${t}`).join('\n')}`
    },
  },
  {
    name: 'Free space on this phone',
    schedule: '@hourly',
    run() {
      const { bavail, bsize } = statfsSync(DATA)
      return `${((bavail * bsize) / 1e9).toFixed(1)} GB free`
    },
  },
]

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
