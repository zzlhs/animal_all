import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createPool } from './db/pool.js'

const config = loadConfig()
const pool = createPool(config)
const app = await buildApp({ config, database: pool })

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  await pool.end()
  process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  await pool.end()
  process.exitCode = 1
}
