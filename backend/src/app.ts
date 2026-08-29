import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { AppConfig } from './config/env.js'
import type { DatabaseClient } from './db/pool.js'
import { registerHealthRoutes } from './routes/health.routes.js'
import { registerAudioProxyRoutes } from './routes/audio-proxy.routes.js'
import { registerMetaRoutes } from './routes/meta.routes.js'
import { registerOccurrenceRoutes } from './routes/occurrence.routes.js'

interface AppDependencies {
  config: AppConfig
  database: DatabaseClient
}

export async function buildApp({ config, database }: AppDependencies) {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
    trustProxy: true,
  })

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  })
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } })
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  })

  await registerHealthRoutes(app, database)
  await registerAudioProxyRoutes(app, config)
  await registerMetaRoutes(app, database, config)
  await registerOccurrenceRoutes(app, database, config)

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ error }, 'Request failed')
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
    reply.code(statusCode).send({ error: statusCode === 500 ? 'Internal server error' : error.message })
  })

  return app
}
