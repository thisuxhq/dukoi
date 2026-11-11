import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pack, unpack } from './archive.ts'

const dirs: string[] = []
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'droidhost-archive-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

test('files and folders survive a round trip', async () => {
  const src = temp()
  mkdirSync(join(src, 'src/routes'), { recursive: true })
  writeFileSync(join(src, 'package.json'), '{"name":"x"}')
  writeFileSync(join(src, 'src/routes/index.js'), 'export default 1\n')
  writeFileSync(join(src, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 })
  const long = `node_modules/${'a'.repeat(60)}/${'b'.repeat(60)}/index.js`
  mkdirSync(join(src, long, '..'), { recursive: true })
  writeFileSync(join(src, long), 'long path')

  const packed = pack(src)
  expect(packed.files).toBe(4)

  const dest = temp()
  const out = await unpack(packed.data, dest)
  expect(out.files).toBe(4)
  expect(readFileSync(join(dest, 'src/routes/index.js'), 'utf8')).toBe('export default 1\n')
  expect(readFileSync(join(dest, long), 'utf8')).toBe('long path')
  expect(statSync(join(dest, 'run.sh')).mode & 0o777).toBe(0o755)
})

test('include() leaves paths out', () => {
  const src = temp()
  mkdirSync(join(src, '.git'))
  writeFileSync(join(src, '.git/HEAD'), 'ref')
  writeFileSync(join(src, 'index.js'), '1')
  const packed = pack(src, { include: (p) => !p.startsWith('.git') })
  expect(packed.files).toBe(1)
})

test('refuses a path that escapes the folder', async () => {
  // Hand-made archive containing ../evil
  const h = Buffer.alloc(512)
  h.write('../evil', 0)
  h.write('0000644\u0000', 100)
  h.write('00000000001\u0000', 124)
  h.write('0', 156)
  h.write('ustar\u000000', 257)
  const body = Buffer.alloc(512)
  body.write('x')
  const gz = gzipSync(Buffer.concat([h, body, Buffer.alloc(1024)]))
  await expect(unpack(gz, temp())).rejects.toThrow('Refusing to unpack outside')
})
