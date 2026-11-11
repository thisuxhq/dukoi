// Only this computer may use the dashboard. The server listens on 127.0.0.1,
// and this check stops a web page on another site from reaching it through a
// domain name it points at 127.0.0.1 (DNS rebinding).
import type { Handle } from '@sveltejs/kit/hooks'

const port = process.env.PORT ?? '5173'
const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

export const handle: Handle = async ({ event, resolve }) => {
  if (!allowed.has(event.request.headers.get('host') ?? '')) {
    return new Response('Forbidden', { status: 403 })
  }
  return resolve(event)
}
