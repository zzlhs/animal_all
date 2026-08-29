import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import type { AppConfig } from '../config/env.js'
import type { DatabaseClient } from '../db/pool.js'

interface DatasetMetaRow extends QueryResultRow {
  version: string
  revision: string
  status: string
  occurrence_count: string
  plottable_count: string
  species_count: string
  media_count: string
  aves_count: string
  insecta_count: string
  audio_occurrence_count: string
  updated_at: Date
}

export async function registerMetaRoutes(app: FastifyInstance, database: DatabaseClient, config: AppConfig) {
  app.get('/api/v1/meta', async (_request, reply) => {
    const result = await database.query<DatasetMetaRow>(`
      SELECT version, revision::text, status, occurrence_count::text, plottable_count::text,
             species_count::text, media_count::text, aves_count::text,
             insecta_count::text, audio_occurrence_count::text, updated_at
      FROM datasets
      WHERE version = $1
      LIMIT 1
    `, [config.activeDatasetVersion])
    const dataset = result.rows[0]
    if (!dataset) return reply.code(404).send({ error: 'Active dataset was not found' })
    if (dataset.status !== 'ready') {
      return reply.code(503).send({ error: 'Active dataset is not ready', status: dataset.status })
    }
    return {
      dataset: {
        version: dataset.version,
        revision: dataset.revision,
        status: dataset.status,
        occurrenceCount: Number(dataset.occurrence_count),
        plottableCount: Number(dataset.plottable_count),
        speciesCount: Number(dataset.species_count),
        mediaCount: Number(dataset.media_count),
        filterCounts: {
          Animalia: Number(dataset.plottable_count),
          Aves: Number(dataset.aves_count),
          Insecta: Number(dataset.insecta_count),
          audio: Number(dataset.audio_occurrence_count),
        },
        updatedAt: dataset.updated_at.toISOString(),
      },
      map: {
        pmtilesUrl: config.pmtilesUrl,
        sourceLayer: config.pmtilesSourceLayer,
      },
      media: {
        imageKitUrlEndpoint: config.imageKitUrlEndpoint,
      },
    }
  })
}
