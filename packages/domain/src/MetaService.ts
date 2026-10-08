import type pg from 'pg'
import { DatasetRepository, MapReleaseRepository, withReadSnapshot, getPool } from '@gbif-globe/db'
import type { MetaResponse } from '@gbif-globe/contracts'
import { DomainError } from './errors.js'

export class MetaService {
  constructor(private readonly datasetRepo = new DatasetRepository(), private readonly releaseRepo = new MapReleaseRepository(), private readonly pool: pg.Pool = getPool()) {}
  async getMeta(revision?: string): Promise<MetaResponse> {
    return withReadSnapshot(async client => {
      const release = await this.datasetRepo.findActiveRelease(client, revision)
      if (!release) throw new DomainError(revision ? 410 : 503, revision ? 'REVISION_UNAVAILABLE' : 'NO_ACTIVE_RELEASE', 'No readable map release is available')
      return release
    }, this.pool)
  }
}
