import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '../db/pool.js'

export async function registerHealthRoutes(app: FastifyInstance, database: DatabaseClient) {
  app.get('/api/health', async (_request, reply) => {
    try {
      await database.query('SELECT 1')
      return { ok: true, node: process.version, database: 'available' }
    } catch {
      return reply.code(503).send({ ok: false, node: process.version, database: 'unavailable' })
    }
  })
}
