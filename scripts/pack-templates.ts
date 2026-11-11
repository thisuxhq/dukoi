// Packs every template the way `dukoi deploy` would, so the phone can
// deploy one with no computer (Try a template). Writes build/templates/<id>.tgz.
// Usage: bun scripts/pack-templates.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readAppFolder } from '../cli/src/app-folder.ts'
import { packApp } from '../cli/src/pack-app.ts'
import { TEMPLATES } from '../shared/src/index.ts'

const repo = join(import.meta.dirname, '..')
const out = join(repo, 'build', 'templates')
mkdirSync(out, { recursive: true })

for (const t of TEMPLATES) {
  const archive = packApp(readAppFolder(join(repo, 'starters', t.id)), () => {}, true)
  writeFileSync(join(out, `${t.id}.tgz`), archive)
  console.log(`✓ ${t.id} → build/templates/${t.id}.tgz (${Math.round(archive.length / 1024)} KB)`)
}
