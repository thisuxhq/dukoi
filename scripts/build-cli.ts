// Builds the standalone CLI that dukoi.com/install downloads: one archive per
// platform, each holding everything that goes in ~/.dukoi:
//
//   bin/dukoi        the CLI as one Bun program (dukoi.exe on Windows)
//   dashboard/       the dashboard's server, run by `dukoi dashboard`
//   starters/        the templates for `dukoi init`
//
// Usage: bun scripts/build-cli.ts
// Output: build/release/dukoi-<os>-<arch>.tar.gz (.zip for Windows) and SHA256SUMS
// scripts/release.sh runs this, adds the APK and publishes them all.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'

const PLATFORMS = [
  { name: 'darwin-arm64', target: 'bun-darwin-arm64' },
  { name: 'darwin-x64', target: 'bun-darwin-x64' },
  { name: 'linux-arm64', target: 'bun-linux-arm64' },
  { name: 'linux-x64', target: 'bun-linux-x64' },
  { name: 'windows-x64', target: 'bun-windows-x64' },
]

const repo = join(import.meta.dir, '..')
const out = join(repo, 'build', 'release')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await $`bun run --filter @dukoi/dashboard build`.cwd(repo).quiet()
console.log('✓ Dashboard built')

const sums: string[] = []
for (const { name, target } of PLATFORMS) {
  const windows = name.startsWith('windows')
  const stage = join(out, 'stage', name)
  const exe = join(stage, 'bin', windows ? 'dukoi.exe' : 'dukoi')

  await $`bun build ${join(repo, 'cli/src/main.ts')} --compile --target=${target} --outfile=${exe}`.quiet()

  cpSync(join(repo, 'dashboard/build'), join(stage, 'dashboard'), { recursive: true })
  // The dashboard's files are ES modules
  writeFileSync(join(stage, 'dashboard/package.json'), '{ "type": "module" }\n')
  cpSync(join(repo, 'starters'), join(stage, 'starters'), {
    recursive: true,
    filter: (src) => !src.includes('node_modules'),
  })

  const archive = `dukoi-${name}.${windows ? 'zip' : 'tar.gz'}`
  if (windows) await $`zip -qr ${join(out, archive)} .`.cwd(stage)
  // No macOS file attributes, which Linux tar warns about
  else
    await $`tar --no-xattrs -czf ${join(out, archive)} -C ${stage} .`.env({
      ...process.env,
      COPYFILE_DISABLE: '1',
    })

  const hash = new Bun.CryptoHasher('sha256').update(readFileSync(join(out, archive))).digest('hex')
  sums.push(`${hash}  ${archive}`)
  console.log(`✓ ${archive}`)
}

writeFileSync(join(out, 'SHA256SUMS'), `${sums.join('\n')}\n`)
rmSync(join(out, 'stage'), { recursive: true, force: true })
if (!existsSync(join(out, 'SHA256SUMS'))) throw new Error('No SHA256SUMS written')
console.log(`✓ build/release/SHA256SUMS`)
