// Sends www.dukoi.com to dukoi.com, serves the CLI install scripts and
// downloads and the benchmark API, and serves everything else from the static build.
import { type BenchEnv, handleBench } from './bench-api.ts'

interface Env extends BenchEnv {
  ASSETS: { fetch(request: Request | string): Promise<Response> }
  DOWNLOADS: {
    get(key: string): Promise<{ body: ReadableStream; size: number; httpEtag: string } | null>
  }
}

// curl -fsSL https://dukoi.com/install | sh, and the PowerShell one for Windows
const SCRIPTS: Record<string, string> = {
  '/install': '/install.sh',
  '/install.sh': '/install.sh',
  '/install.ps1': '/install.ps1',
}

const CONTENT_TYPES: Record<string, string> = {
  apk: 'application/vnd.android.package-archive',
  SHA256SUMS: 'text/plain; charset=utf-8',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.hostname === 'www.dukoi.com') {
      url.hostname = 'dukoi.com'
      return Response.redirect(url.toString(), 301)
    }

    // dukoi bench --share, and the numbers dukoi.com/bench shows
    if (url.pathname === '/api/bench' || url.pathname.startsWith('/api/bench/'))
      return handleBench(request, env, url)

    const script = SCRIPTS[url.pathname]
    if (script) {
      const res = await env.ASSETS.fetch(new URL(script, url).toString())
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' },
      })
    }

    // /download/dukoi.apk → latest/dukoi.apk in R2 (scripts/publish-release.sh)
    const file = url.pathname.match(/^\/download\/([\w.-]+)$/)?.[1]
    if (file) {
      const object =
        (await env.DOWNLOADS.get(`latest/${file}`)) ??
        // Where the CLI lived before the first full release. Remove after it.
        (await env.DOWNLOADS.get(`cli/latest/${file}`))
      if (!object) return new Response('Not found\n', { status: 404 })
      const headers: Record<string, string> = {
        'content-type': CONTENT_TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream',
        'content-length': String(object.size),
        etag: object.httpEtag,
        'cache-control': 'no-cache',
      }
      if (file.endsWith('.apk')) headers['content-disposition'] = `attachment; filename="${file}"`
      return new Response(object.body, { headers })
    }

    return env.ASSETS.fetch(request)
  },
}
