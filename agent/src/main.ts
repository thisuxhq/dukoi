// Entry point. The Kotlin app starts this with the bundled Node and restarts
// it if it ever exits.
import { Agent } from './agent.ts'
import { loadConfig } from './config.ts'

const agent = new Agent(loadConfig())
agent.start()

const shutdown = (signal: string) => {
  console.log(`Got ${signal}, stopping.`)
  agent.stop().finally(() => process.exit(0))
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
