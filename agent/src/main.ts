// Entry point. The Kotlin app starts this with the bundled Node and restarts
// it if it ever exits. With --serve-static <dir> it serves a static site
// instead (used for static apps).
import { Agent } from './agent.ts'
import { loadConfig } from './config.ts'
import { serveStatic } from './static-server.ts'

if (process.argv[2] === '--serve-static') {
  serveStatic(process.argv[3] ?? '.', Number(process.env.PORT ?? 3000))
} else {
  const agent = new Agent(loadConfig())
  await agent.start()

  const shutdown = (signal: string) => {
    console.log(`Got ${signal}, stopping.`)
    agent.stop().finally(() => process.exit(0))
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
