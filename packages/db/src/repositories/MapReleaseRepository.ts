import type pg from 'pg'

export interface CreateReleaseParams {
  datasetRevision: string
  pmtilesUrl: string
  sourceLayer: string
  featureSchemaVersion: number
  objectSha256: string
  objectSizeBytes: number
  manifest: Record<string, any>
  validatedAt: Date
}

export interface MapReleaseRecord {
  id: string
  datasetRevision: string
  pmtilesUrl: string
  sourceLayer: string
  featureSchemaVersion: number
  objectSha256: string
  objectSizeBytes: number
  manifest: Record<string, any>
  validatedAt: Date
  createdAt: Date
}

export class MapReleaseRepository {
  async createRelease(client: pg.PoolClient | pg.Pool, params: CreateReleaseParams): Promise<MapReleaseRecord> {
    const sql = `
      INSERT INTO map_releases (
        dataset_revision,
        pmtiles_url,
        source_layer,
        feature_schema_version,
        object_sha256,
        object_size_bytes,
        manifest,
        validated_at
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id::text,
        dataset_revision::text,
        pmtiles_url,
        source_layer,
        feature_schema_version,
        object_sha256,
        object_size_bytes::bigint,
        manifest,
        validated_at,
        created_at;
    `
    const values = [
      params.datasetRevision,
      params.pmtilesUrl,
      params.sourceLayer,
      params.featureSchemaVersion,
      params.objectSha256,
      params.objectSizeBytes,
      JSON.stringify(params.manifest),
      params.validatedAt,
    ]

    const { rows } = await client.query(sql, values)
    const r = rows[0]
    return {
      id: r.id,
      datasetRevision: r.dataset_revision,
      pmtilesUrl: r.pmtiles_url,
      sourceLayer: r.source_layer,
      featureSchemaVersion: r.feature_schema_version,
      objectSha256: r.object_sha256,
      objectSizeBytes: Number(r.object_size_bytes),
      manifest: r.manifest,
      validatedAt: new Date(r.validated_at),
      createdAt: new Date(r.created_at),
    }
  }

  async setActiveRelease(client: pg.PoolClient | pg.Pool, releaseId: string): Promise<void> {
    const sql = `
      INSERT INTO active_map_release (singleton, release_id, updated_at)
      VALUES (true, $1::bigint, now())
      ON CONFLICT (singleton)
      DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
    `
    await client.query(sql, [releaseId])
  }

  async getActiveRelease(client: pg.PoolClient | pg.Pool): Promise<MapReleaseRecord | null> {
    const sql = `
      SELECT
        mr.id::text,
        mr.dataset_revision::text,
        mr.pmtiles_url,
        mr.source_layer,
        mr.feature_schema_version,
        mr.object_sha256,
        mr.object_size_bytes::bigint,
        mr.manifest,
        mr.validated_at,
        mr.created_at
      FROM active_map_release amr
      JOIN map_releases mr ON mr.id = amr.release_id
      LIMIT 1;
    `
    const { rows } = await client.query(sql)
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: r.id,
      datasetRevision: r.dataset_revision,
      pmtilesUrl: r.pmtiles_url,
      sourceLayer: r.source_layer,
      featureSchemaVersion: r.feature_schema_version,
      objectSha256: r.object_sha256,
      objectSizeBytes: Number(r.object_size_bytes),
      manifest: r.manifest,
      validatedAt: new Date(r.validated_at),
      createdAt: new Date(r.created_at),
    }
  }
}
