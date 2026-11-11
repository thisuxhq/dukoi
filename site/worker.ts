// Sends www.dukoi.com to dukoi.com and serves everything else from the static build.
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url)
    if (url.hostname === 'www.dukoi.com') {
      url.hostname = 'dukoi.com'
      return Response.redirect(url.toString(), 301)
    }
    return env.ASSETS.fetch(request)
  },
}
