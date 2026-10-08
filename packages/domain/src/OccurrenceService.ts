import type pg from 'pg'
import {
  OccurrenceRepository,
  DatasetRepository,
  withReadSnapshot,
  getPool,
} from '@gbif-globe/db'
import type {
  OccurrenceRecord,
  PageResult,
  CellSpeciesItem,
  FilterType,
} from '@gbif-globe/contracts'
import { DomainError } from './errors.js'
import { computeScopeHash, decodeCursor, encodeCursor } from './cursor.js'

export class OccurrenceService {
  constructor(
    private readonly occurrenceRepo = new OccurrenceRepository(),
    private readonly datasetRepo = new DatasetRepository(),
    private readonly pool: pg.Pool = getPool(),
  ) {}

  async getOccurrence(gbifId: string, revision?: string): Promise<{ record: OccurrenceRecord; datasetRevision: string }> {
    return withReadSnapshot(async client => {
      const dataset = await this.datasetRepo.findReadableDataset(client, revision)

      if (!dataset) {
        throw new DomainError(revision ? 410 : 503, 'REVISION_UNAVAILABLE', 'No readable dataset is available')
      }

      const record = await this.occurrenceRepo.findByGbifId(client, dataset.id, gbifId)
      if (!record) {
        throw new DomainError(404, 'NOT_FOUND', 'Occurrence was not found')
      }

      return { record, datasetRevision: dataset.revision }
    }, this.pool)
  }

  async getCellOccurrences(
    resolution: number,
    cellId: string,
    options: {
      speciesKey?: string
      unknownSpecies?: boolean
      filter?: FilterType
      limit?: number
      cursor?: string
      revision?: string
    } = {},
  ): Promise<PageResult<OccurrenceRecord>> {
    return withReadSnapshot(async client => {
      const dataset = await this.datasetRepo.findReadableDataset(client, options.revision)

      if (!dataset) {
        throw new DomainError(options.revision ? 410 : 503, 'REVISION_UNAVAILABLE', 'No readable dataset is available')
      }

      const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100)
      const scopeHash = computeScopeHash([dataset.revision, resolution, cellId, options.speciesKey, options.unknownSpecies ?? false, options.filter ?? 'all', 'gbifId:asc'])

      let lastId: string | undefined
      if (options.cursor) {
        const decoded = decodeCursor(options.cursor, scopeHash)
        if (decoded.revision !== dataset.revision || decoded.order !== 'gbifId:asc') throw new DomainError(400, 'BAD_CURSOR', 'Invalid cursor scope')
        lastId = decoded.lastId
      }

      const { items, hasMore, total } = await this.occurrenceRepo.listCellOccurrences(client, {
        datasetId: dataset.id,
        resolution,
        cellId,
        speciesKey: options.speciesKey,
        unknownSpecies: options.unknownSpecies,
        filter: options.filter,
        lastId,
        limit,
      })

      let nextCursor: string | null = null
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1]
        nextCursor = encodeCursor({
          v: 2,
          revision: dataset.revision,
          scopeHash,
          order: 'gbifId:asc',
          lastId: lastItem.gbifId,
        })
      }

      return {
        datasetRevision: dataset.revision,
        items,
        total,
        totalAccuracy: total !== null ? 'exact' : 'unavailable',
        nextCursor,
      }
    }, this.pool)
  }

  async getCoordinateOccurrences(
    latitude: number,
    longitude: number,
    options: {
      filter?: FilterType
      speciesKey?: string
      limit?: number
      cursor?: string
      revision?: string
    } = {},
  ): Promise<PageResult<OccurrenceRecord>> {
    return withReadSnapshot(async client => {
      const dataset = await this.datasetRepo.findReadableDataset(client, options.revision)

      if (!dataset) {
        throw new DomainError(options.revision ? 410 : 503, 'REVISION_UNAVAILABLE', 'No readable dataset is available')
      }

      const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100)
      const scopeHash = computeScopeHash([dataset.revision, latitude, longitude, options.speciesKey, options.filter ?? 'all', 'gbifId:asc'])

      let lastId: string | undefined
      if (options.cursor) {
        const decoded = decodeCursor(options.cursor, scopeHash)
        if (decoded.revision !== dataset.revision || decoded.order !== 'gbifId:asc') throw new DomainError(400, 'BAD_CURSOR', 'Invalid cursor scope')
        lastId = decoded.lastId
      }

      const { items, hasMore, total } = await this.occurrenceRepo.listCoordinateOccurrences(client, {
        datasetId: dataset.id,
        latitude,
        longitude,
        filter: options.filter,
        speciesKey: options.speciesKey,
        lastId,
        limit,
      })

      let nextCursor: string | null = null
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1]
        nextCursor = encodeCursor({
          v: 2,
          revision: dataset.revision,
          scopeHash,
          order: 'gbifId:asc',
          lastId: lastItem.gbifId,
        })
      }

      return {
        datasetRevision: dataset.revision,
        items,
        total,
        totalAccuracy: total !== null ? 'exact' : 'unavailable',
        nextCursor,
      }
    }, this.pool)
  }

  async getCellSpecies(
    resolution: number,
    cellId: string,
    options: {
      filter?: FilterType
      limit?: number
      cursor?: string
      revision?: string
    } = {},
  ): Promise<PageResult<CellSpeciesItem>> {
    return withReadSnapshot(async client => {
      const dataset = await this.datasetRepo.findReadableDataset(client, options.revision)

      if (!dataset) {
        throw new DomainError(options.revision ? 410 : 503, 'REVISION_UNAVAILABLE', 'No readable dataset is available')
      }

      const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100)
      const scopeHash = computeScopeHash([dataset.revision, resolution, cellId, options.filter ?? 'all', 'speciesKey:asc'])

      let lastSpeciesKey: string | undefined
      if (options.cursor) {
        const decoded = decodeCursor(options.cursor, scopeHash)
        if (decoded.revision !== dataset.revision || decoded.order !== 'speciesKey:asc') throw new DomainError(400, 'BAD_CURSOR', 'Invalid cursor scope')
        lastSpeciesKey = decoded.lastId
      }

      const { items, hasMore, total } = await this.occurrenceRepo.listCellSpecies(client, {
        datasetId: dataset.id,
        resolution,
        cellId,
        filter: options.filter,
        lastSpeciesKey,
        limit,
      })

      let nextCursor: string | null = null
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1]
        nextCursor = encodeCursor({
          v: 2,
          revision: dataset.revision,
          scopeHash,
          order: 'speciesKey:asc',
          lastId: lastItem.speciesKey,
        })
      }

      return {
        datasetRevision: dataset.revision,
        items,
        total,
        totalAccuracy: total !== null ? 'exact' : 'unavailable',
        nextCursor,
      }
    }, this.pool)
  }
}
