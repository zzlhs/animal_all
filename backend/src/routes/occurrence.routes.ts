import type { FastifyInstance } from 'fastify'
import { getResolution, isValidCell } from 'h3-js'
import { ApiConstants, MapDataConstants } from '../config/api.constants.js'
import type { AppConfig } from '../config/env.js'
import { withReadSnapshot, type DatabaseClient } from '../db/pool.js'
import { normalizePageSize } from '../lib/page.js'
import { getOccurrence, listCellOccurrences, listCellSpecies, listCoordinateOccurrences } from '../services/occurrence.service.js'

interface OccurrenceParams {
  gbifId: string
}

interface CellParams {
  resolution: string
  cellId: string
}

interface CoordinateParams {
  latitude: string
  longitude: string
}

interface PageQuery {
  limit?: string
  cursor?: string
  speciesKey?: string
  filter?: string
}

const supportedRecordFilters = new Set(['Aves', 'Insecta', 'audio'])

function parseResolution(value: string) {
  const resolution = Number(value)
  return MapDataConstants.SUPPORTED_H3_RESOLUTIONS.includes(
    resolution as typeof MapDataConstants.SUPPORTED_H3_RESOLUTIONS[number],
  ) ? resolution : null
}

function validCellId(cellId: string, resolution: number) {
  return isValidCell(cellId) && getResolution(cellId) === resolution
}

export async function registerOccurrenceRoutes(app: FastifyInstance, database: DatabaseClient, config: AppConfig) {
  app.get<{ Params: OccurrenceParams }>(`${ApiConstants.ROUTE_PREFIX}/occurrences/:gbifId`, async (request, reply) => {
    if (!/^\d+$/.test(request.params.gbifId)) return reply.code(400).send({ error: 'Invalid GBIF ID' })
    const occurrence = await withReadSnapshot(database, snapshot => (
      getOccurrence(snapshot, config.activeDatasetVersion, request.params.gbifId)
    ))
    if (!occurrence) return reply.code(404).send({ error: 'Occurrence was not found' })
    return { occurrence }
  })

  app.get<{ Params: CellParams; Querystring: PageQuery }>(`${ApiConstants.ROUTE_PREFIX}/cells/:resolution/:cellId/occurrences`, async (request, reply) => {
    const resolution = parseResolution(request.params.resolution)
    if (resolution == null) return reply.code(400).send({ error: 'Unsupported H3 resolution' })
    if (!validCellId(request.params.cellId, resolution)) return reply.code(400).send({ error: 'Invalid H3 cell ID' })
    if (request.query.filter && !supportedRecordFilters.has(request.query.filter)) return reply.code(400).send({ error: 'Unsupported record filter' })
    if (request.query.speciesKey && !/^\d+$/.test(request.query.speciesKey)) return reply.code(400).send({ error: 'Invalid species key' })
    const result = await withReadSnapshot(database, snapshot => listCellOccurrences(
      snapshot, config.activeDatasetVersion, resolution, request.params.cellId,
      normalizePageSize(request.query.limit), request.query.cursor, request.query.speciesKey,
      request.query.filter as 'Aves' | 'Insecta' | 'audio' | undefined,
    ))
    return result
  })

  app.get<{ Params: CellParams; Querystring: PageQuery }>(`${ApiConstants.ROUTE_PREFIX}/cells/:resolution/:cellId/species`, async (request, reply) => {
    const resolution = parseResolution(request.params.resolution)
    if (resolution == null) return reply.code(400).send({ error: 'Unsupported H3 resolution' })
    if (!validCellId(request.params.cellId, resolution)) return reply.code(400).send({ error: 'Invalid H3 cell ID' })
    return withReadSnapshot(database, snapshot => listCellSpecies(
      snapshot, config.activeDatasetVersion, resolution, request.params.cellId,
      normalizePageSize(request.query.limit), request.query.cursor,
    ))
  })

  app.get<{ Params: CoordinateParams; Querystring: PageQuery }>(`${ApiConstants.ROUTE_PREFIX}/coordinates/:latitude/:longitude/occurrences`, async (request, reply) => {
    const latitude = Number(request.params.latitude)
    const longitude = Number(request.params.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return reply.code(400).send({ error: 'Invalid coordinates' })
    }
    if (request.query.filter && !supportedRecordFilters.has(request.query.filter)) return reply.code(400).send({ error: 'Unsupported record filter' })
    if (request.query.speciesKey && !/^\d+$/.test(request.query.speciesKey)) return reply.code(400).send({ error: 'Invalid species key' })
    return withReadSnapshot(database, snapshot => listCoordinateOccurrences(
      snapshot, config.activeDatasetVersion, latitude, longitude,
      normalizePageSize(request.query.limit), request.query.cursor, request.query.speciesKey,
      request.query.filter as 'Aves' | 'Insecta' | 'audio' | undefined,
    ))
  })
}
