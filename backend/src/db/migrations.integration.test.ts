import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../config/env.js'
import { abortDatasetImport, beginDatasetImport, finalizeDatasetImport, type DatasetImportHandle } from '../import/import-repository.js'
import { runMigrations } from './migrate.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

describe.skipIf(!databaseUrl)('PostGIS migrations', () => {
  afterAll(async () => pool?.end())

  it('applies every migration and exposes precision, sync queue and coordinate lookup support', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl!,
      ACTIVE_DATASET_VERSION: 'integration-test',
    })
    await runMigrations(config)
    const result = await pool!.query<{
      postgis_version: string
      columns: string[]
      coordinate_index: string | null
      retired_column: string | null
      revision_column: string | null
      status_constraint: string | null
    }>(`
      SELECT
        PostGIS_Version() AS postgis_version,
        ARRAY(
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name IN ('occurrences', 'media')
            AND column_name IN ('h3_r6', 'h3_r7', 'h3_r8', 'sync_status', 'sync_attempts')
          ORDER BY column_name
        ) AS columns,
        to_regclass('public.occurrences_dataset_coordinates_gbif_idx')::text AS coordinate_index,
        (SELECT column_name FROM information_schema.columns
          WHERE table_name = 'datasets' AND column_name = 'retired_at') AS retired_column,
        (SELECT column_name FROM information_schema.columns
          WHERE table_name = 'datasets' AND column_name = 'revision') AS revision_column,
        (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'datasets'::regclass AND conname = 'datasets_status_check') AS status_constraint
    `)
    expect(result.rows[0]!.postgis_version).toBeTruthy()
    expect(result.rows[0]!.columns).toEqual(['h3_r6', 'h3_r7', 'h3_r8', 'sync_attempts', 'sync_status'])
    expect(result.rows[0]!.coordinate_index).toBe('occurrences_dataset_coordinates_gbif_idx')
    expect(result.rows[0]!.retired_column).toBe('retired_at')
    expect(result.rows[0]!.revision_column).toBe('revision')
    expect(result.rows[0]!.status_constraint).toContain("'retired'::text")
  })

  it('promotes a replacement atomically and retires the previous dataset', async () => {
    const version = 'integration-promotion'
    await pool!.query("DELETE FROM datasets WHERE version = $1 OR version LIKE $1 || '.__retired__.%' OR version = $1 || '.__staging__'", [version])
    const old = await pool!.query<{ id: string; revision: string }>(`
      INSERT INTO datasets (
        version, source_archive, kingdom_filter, status, occurrence_count, plottable_count
      ) VALUES ($1, 'old.zip', 'Animalia', 'ready', 1, 1)
      RETURNING id::text, revision::text
    `, [version])
    const client = await pool!.connect()
    let staged: DatasetImportHandle | null = null
    let finalized = false
    try {
      staged = await beginDatasetImport(client, version, 'new.zip', 'Animalia', true)
      const beforePromotion = await client.query<{ id: string }>(
        "SELECT id::text FROM datasets WHERE version = $1 AND status = 'ready'",
        [version],
      )
      expect(beforePromotion.rows[0]!.id).toBe(old.rows[0]!.id)
      await client.query(
        "UPDATE datasets SET status = 'ready', occurrence_count = 1, plottable_count = 1 WHERE id = $1",
        [staged.id],
      )
      await finalizeDatasetImport(client, staged)
      finalized = true
      const afterPromotion = await client.query<{ id: string; revision: string; status: string }>(`
        SELECT id::text, revision::text, status
        FROM datasets
        WHERE version = $1
      `, [version])
      expect(afterPromotion.rows[0]).toMatchObject({ id: staged.id, status: 'ready' })
      expect(afterPromotion.rows[0]!.revision).not.toBe(old.rows[0]!.revision)
      const retired = await client.query<{ status: string }>(`
        SELECT status FROM datasets WHERE version LIKE $1 || '.__retired__.%'
      `, [version])
      expect(retired.rows[0]!.status).toBe('retired')
    } finally {
      if (staged && !finalized) await abortDatasetImport(client, staged).catch(() => {})
      client.release()
      await pool!.query("DELETE FROM datasets WHERE version = $1 OR version LIKE $1 || '.__retired__.%' OR version = $1 || '.__staging__'", [version])
    }
  })
})
