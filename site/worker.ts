// Sends www.dukoi.com to dukoi.com, serves the CLI install scripts and
// downloads, and serves everything else from the static build.
interface Env {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.hostname === 'www.dukoi.com') {
      url.hostname = 'dukoi.com'
      return Response.redirect(url.toString(), 301)
    }

    const script = SCRIPTS[url.pathname]
    if (script) {
      const res = await env.ASSETS.fetch(new URL(script, url).toString())
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' },
      })
    }

    // /download/dukoi-darwin-arm64.tar.gz → cli/latest/dukoi-darwin-arm64.tar.gz in R2
    const file = url.pathname.match(/^\/download\/([\w.-]+)$/)?.[1]
    if (file) {
      const object = await env.DOWNLOADS.get(`cli/latest/${file}`)
      if (!object) return new Response('Not found\n', { status: 404 })
      return new Response(object.body, {
        headers: {
          'content-type':
            file === 'SHA256SUMS' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
          'content-length': String(object.size),
          etag: object.httpEtag,
          'cache-control': 'no-cache',
        },
      })
    }

    return env.ASSETS.fetch(request)
  },
}
