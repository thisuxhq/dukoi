// An MCP server over HTTP. You don't need to touch this file: the tools are in tools.js.
// It speaks the initialize-based protocol (2025-11-25 and earlier), which
// Claude, ChatGPT, Cursor and other assistants use today.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { tools } from './tools.js'

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']

const result = (id, value) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

async function answer({ id, method, params = {} }) {
  if (method === 'initialize') {
    return result(id, {
      protocolVersion: VERSIONS.includes(params.protocolVersion)
        ? params.protocolVersion
        : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'droidhost-mcp', version: '1.0.0' },
    })
  }
  if (method === 'ping') return result(id, {})
  if (method === 'tools/list') {
    return result(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    })
  }
  if (method === 'tools/call') {
    const tool = tools.find((t) => t.name === params.name)
    if (!tool) return failure(id, -32602, `There's no tool called ${params.name}.`)
    try {
      const text = await tool.run(params.arguments ?? {})
      return result(id, { content: [{ type: 'text', text: String(text) }] })
    } catch (err) {
      return result(id, { content: [{ type: 'text', text: err.message }], isError: true })
    }
  }
  return failure(id, -32601, `Unknown method: ${method}`)
}

const app = new Hono()

// The home page says how to connect.
app.get('/', (c) => {
  const url = new URL('/mcp', c.req.url).href
  return c.json({
    name: 'mcp-server',
    mcp: url,
    connect: `claude mcp add --transport http droidhost ${url}`,
    tools: tools.map((t) => t.name),
  })
})

app.post('/mcp', async (c) => {
  const message = await c.req.json().catch(() => null)
  if (!message?.method) return c.json(failure(null, -32700, 'Send one JSON-RPC message.'), 400)
  // Notifications have no id and need no answer.
  if (message.id === undefined) return c.body(null, 202)
  return c.json(await answer(message))
})

// No server-to-client stream: every answer comes back on its POST.
app.get('/mcp', (c) => c.body(null, 405))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(`mcp-server listening on ${port}`)
})
