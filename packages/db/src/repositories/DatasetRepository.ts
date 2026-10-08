import type pg from 'pg'
import type { DatasetMeta, MapReleaseMeta } from '@gbif-globe/contracts'

export interface DatasetEntity {
  id: string
  version: string
  revision: string
  status: 'importing' | 'ready' | 'failed' | 'retired'
  occurrenceCount: number
  plottableCount: number
  filterCounts: Record<string, number>
}
const fields = `d.id::text, d.version, d.revision::text, d.status, d.occurrence_count,
 d.import_stats, d.plottable_count, d.aves_count, d.insecta_count, d.audio_occurrence_count`
const mapDataset = (r: Record<string, any>): DatasetEntity => ({
  id: r.id, version: r.version, revision: r.revision, status: r.status,
  occurrenceCount: Number(r.occurrence_count), plottableCount: Number(r.plottable_count),
  ...(r.import_stats?.mapCamera ? { mapCamera: r.import_stats.mapCamera } : {}),
  filterCounts: { all: Number(r.plottable_count), Aves: Number(r.aves_count), Insecta: Number(r.insecta_count), audio: Number(r.audio_occurrence_count) },
})

export class DatasetRepository {
  async findActiveRelease(client: pg.PoolClient | pg.Pool, revision?: string): Promise<{ dataset: DatasetMeta; map: MapReleaseMeta } | null> {
    const { rows } = await client.query(`SELECT ${fields}, mr.id::text AS release_id,
        mr.feature_schema_version, mr.pmtiles_url, mr.source_layer
      FROM map_releases mr JOIN datasets d ON d.revision = mr.dataset_revision
      ${revision ? '' : 'JOIN active_map_release active ON active.release_id = mr.id'}
      WHERE d.status IN ('ready', 'retired') ${revision ? 'AND d.revision = $1::uuid' : ''}
      ORDER BY mr.id DESC LIMIT 1`, revision ? [revision] : [])
    if (!rows[0]) return null
    const r = rows[0]
    return { dataset: mapDataset(r), map: { releaseId: r.release_id, featureSchemaVersion: r.feature_schema_version, pmtilesUrl: r.pmtiles_url, sourceLayer: r.source_layer, maxZoom: 18 } }
  }

  // Raw lookup is used only by publication, which validates status and locks the row.
  async findDatasetByRevision(client: pg.PoolClient | pg.Pool, revision: string): Promise<DatasetEntity | null> {
    const { rows } = await client.query(`SELECT ${fields} FROM datasets d WHERE d.revision = $1::uuid LIMIT 1`, [revision])
    return rows[0] ? mapDataset(rows[0]) : null
  }

  async findReadableDataset(client: pg.PoolClient | pg.Pool, revision?: string): Promise<DatasetEntity | null> {
    const { rows } = await client.query(`SELECT ${fields} FROM datasets d
      WHERE d.status IN ('ready', 'retired') AND ${revision
        ? `d.revision = $1::uuid AND EXISTS (SELECT 1 FROM map_releases mr WHERE mr.dataset_revision = d.revision)`
        : `EXISTS (SELECT 1 FROM map_releases mr JOIN active_map_release active ON active.release_id = mr.id WHERE mr.dataset_revision = d.revision)`}
      LIMIT 1`, revision ? [revision] : [])
    return rows[0] ? mapDataset(rows[0]) : null
  }
}
