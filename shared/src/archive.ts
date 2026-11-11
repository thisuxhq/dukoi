// A small tar.gz writer and reader (ustar), so neither the CLI nor the phone
// needs a tar package. Handles regular files and folders, which is all an app
// upload contains. Symlinks are followed when packing.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzipSync } from 'node:zlib'

const gunzipAsync = promisify(gunzip)

const BLOCK = 512

export interface PackOptions {
  /** Return false to leave a path out (relative, with / separators) */
  include?: (path: string, isDir: boolean) => boolean
}

export interface PackResult {
  data: Buffer
  files: number
  bytes: number
}

export function pack(root: string, opts: PackOptions = {}): PackResult {
  const chunks: Buffer[] = []
  let files = 0
  let bytes = 0

  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const rel = relative(root, full).split(sep).join('/')
      const st = statSync(full)
      const isDir = st.isDirectory()
      if (opts.include && !opts.include(rel, isDir)) continue
      if (isDir) {
        chunks.push(header(`${rel}/`, 0, st.mode & 0o777, '5'))
        walk(full)
      } else if (st.isFile()) {
        const content = readFileSync(full)
        chunks.push(
          header(rel, content.length, st.mode & 0o777, '0'),
          content,
          padding(content.length),
        )
        files++
        bytes += content.length
      }
    }
  }
  walk(root)
  chunks.push(Buffer.alloc(BLOCK * 2))
  return { data: gzipSync(Buffer.concat(chunks), { level: 6 }), files, bytes }
}

function padding(size: number): Buffer {
  const rest = size % BLOCK
  return Buffer.alloc(rest === 0 ? 0 : BLOCK - rest)
}

function header(path: string, size: number, mode: number, type: '0' | '5'): Buffer {
  const h = Buffer.alloc(BLOCK)
  let name = path
  let prefix = ''
  if (Buffer.byteLength(name) > 100) {
    // ustar splits long paths at a / into prefix (155) and name (100).
    const cut = path.lastIndexOf('/', path.length - 2)
    prefix = path.slice(0, cut)
    name = path.slice(cut + 1)
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`Path too long to pack: ${path}`)
    }
  }
  h.write(name, 0, 100, 'utf8')
  h.write(octal(mode, 8), 100)
  h.write(octal(0, 8), 108)
  h.write(octal(0, 8), 116)
  h.write(octal(size, 12), 124)
  h.write(octal(0, 12), 136)
  h.write('        ', 148)
  h.write(type, 156)
  h.write('ustar\u000000', 257)
  h.write(prefix, 345, 155, 'utf8')
  let sum = 0
  for (const byte of h) sum += byte
  h.write(octal(sum, 7), 148)
  return h
}

const octal = (n: number, width: number) => `${n.toString(8).padStart(width - 1, '0')}\u0000`

export interface UnpackResult {
  files: number
  bytes: number
}

/**
 * Unpacks into `dest`. Refuses paths that would escape it. Async all the way,
 * so the phone agent keeps serving traffic while a deploy unpacks.
 */
export async function unpack(gz: Buffer, dest: string): Promise<UnpackResult> {
  const tar = await gunzipAsync(gz)
  let offset = 0
  let files = 0
  let bytes = 0
  const root = normalize(dest)
  await mkdir(root, { recursive: true })

  while (offset + BLOCK <= tar.length) {
    const h = tar.subarray(offset, offset + BLOCK)
    if (h.every((b) => b === 0)) break
    const name = field(h, 0, 100)
    const prefix = field(h, 345, 155)
    const path = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(field(h, 124, 12) || '0', 8)
    const mode = Number.parseInt(field(h, 100, 8) || '644', 8)
    const type = String.fromCharCode(h[156] ?? 48)
    offset += BLOCK

    const target = normalize(join(root, path))
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`Refusing to unpack outside the app folder: ${path}`)
    }
    if (type === '5') {
      await mkdir(target, { recursive: true })
    } else if (type === '0' || type === '\u0000') {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, tar.subarray(offset, offset + size), { mode: mode & 0o777 })
      files++
      bytes += size
    }
    offset += Math.ceil(size / BLOCK) * BLOCK
  }
  return { files, bytes }
}

function field(h: Buffer, start: number, length: number): string {
  const raw = h.subarray(start, start + length)
  const end = raw.indexOf(0)
  return raw
    .subarray(0, end === -1 ? length : end)
    .toString('utf8')
    .trim()
}
