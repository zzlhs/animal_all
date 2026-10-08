import type pg from 'pg'
import {
  DatasetRepository,
  MapReleaseRepository,
  withTransaction,
  getPool,
} from '@gbif-globe/db'
import type { CreateReleaseParams, MapReleaseRecord } from '@gbif-globe/db'

export class ReleaseService {
  constructor(
    private readonly datasetRepo = new DatasetRepository(),
    private readonly releaseRepo = new MapReleaseRepository(),
    private readonly pool: pg.Pool = getPool(),
  ) {}

  async publishRelease(params: CreateReleaseParams): Promise<MapReleaseRecord> {
    if (!/^[a-f0-9]{64}$/.test(params.objectSha256) || !Number.isSafeInteger(params.objectSizeBytes) || params.objectSizeBytes <= 0) throw new Error('Invalid verified release artifact')
    return withTransaction(async client => {
      await client.query('SELECT id FROM datasets WHERE revision = $1::uuid FOR UPDATE', [params.datasetRevision])
      // 1. Validate dataset exists and is ready
      const dataset = await this.datasetRepo.findDatasetByRevision(client, params.datasetRevision)
      if (!dataset) {
        throw new Error(`Cannot publish release: Dataset revision '${params.datasetRevision}' not found`)
      }
      if (dataset.status !== 'ready') {
        throw new Error(`Cannot publish release: Dataset revision '${params.datasetRevision}' is not in 'ready' status (current: ${dataset.status})`)
      }

      // 2. Create release record
      const release = await this.releaseRepo.createRelease(client, params)

      // 3. Atomically switch active release pointer
      await this.releaseRepo.setActiveRelease(client, release.id)

      return release
    }, this.pool)
  }

  async rollbackRelease(releaseId: string): Promise<void> {
    return withTransaction(async client => {
      const target = await client.query(`SELECT d.id FROM map_releases mr JOIN datasets d ON d.revision = mr.dataset_revision
        WHERE mr.id = $1 AND d.status IN ('ready', 'retired') FOR UPDATE OF d`, [releaseId])
      if (!target.rows.length) throw new Error('Rollback release is unavailable')
      await this.releaseRepo.setActiveRelease(client, releaseId)
    }, this.pool)
  }

  async getActiveRelease(): Promise<MapReleaseRecord | null> {
    return this.releaseRepo.getActiveRelease(this.pool)
  }
}
