import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { ImportConstants, MapDataConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import { createPool } from '../db/pool.js'

const AggregateRebuildConstants = Object.freeze({
  MEDIA_COUNTS_TABLE: 'aggregate_media_counts',
})

async function createMediaCountsTable(client: PoolClient, datasetId: string) {
  await client.query(`
    CREATE TEMP TABLE ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE}
    ON COMMIT DROP AS
    SELECT
      occurrence_gbif_id,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(media_type, '')) LIKE '%stillimage%'
           OR LOWER(COALESCE(format, '')) LIKE 'image/%'
      ) AS image_count,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(media_type, '')) LIKE '%sound%'
           OR LOWER(COALESCE(format, '')) LIKE 'audio/%'
      ) AS audio_count,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(media_type, '')) LIKE '%movingimage%'
           OR LOWER(COALESCE(media_type, '')) LIKE '%video%'
           OR LOWER(COALESCE(format, '')) LIKE 'video/%'
      ) AS video_count
    FROM media
    WHERE dataset_id = $1
    GROUP BY occurrence_gbif_id
  `, [datasetId])
  await client.query(`
    CREATE UNIQUE INDEX ON ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE} (occurrence_gbif_id)
  `)
  await client.query(`ANALYZE ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE}`)
}

async function rebuildMapCells(client: PoolClient, datasetId: string, resolution: number) {
  const column = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[resolution]
  if (!column) throw new Error(`Unsupported H3 resolution ${resolution}`)
  await client.query(`WITH source AS (
      SELECT
        o.gbif_id,
        o.species_key,
        o.geom,
        o.event_year,
        COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) AS class_name,
        o.${column} AS cell_id,
        COALESCE(m.image_count, 0) AS image_count,
        COALESCE(m.audio_count, 0) AS audio_count,
        COALESCE(m.video_count, 0) AS video_count
      FROM occurrences o
      LEFT JOIN species s ON s.species_key = o.species_key
      LEFT JOIN ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE} m ON m.occurrence_gbif_id = o.gbif_id
      WHERE o.dataset_id = $1 AND o.${column} IS NOT NULL
    ),
    representatives AS (
      SELECT DISTINCT ON (cell_id) cell_id, gbif_id, geom
      FROM source
      ORDER BY cell_id, gbif_id
    ),
    aggregates AS (
      SELECT
        cell_id,
        COUNT(*) AS occurrence_count,
        COUNT(DISTINCT species_key) FILTER (WHERE species_key IS NOT NULL) AS species_count,
        SUM(image_count) AS image_count,
        SUM(audio_count) AS audio_count,
        SUM(video_count) AS video_count,
        COUNT(*) FILTER (WHERE class_name = 'Aves') AS aves_count,
        COUNT(*) FILTER (WHERE class_name = 'Insecta') AS insecta_count,
        COUNT(*) FILTER (WHERE audio_count > 0) AS audio_occurrence_count,
        MIN(event_year) AS first_year,
        MAX(event_year) AS last_year
      FROM source
      GROUP BY cell_id
    )
    INSERT INTO map_cells (
      dataset_id, resolution, cell_id, anchor, representative_occurrence_id,
      occurrence_count, species_count, image_count, audio_count, video_count,
      aves_count, insecta_count, audio_occurrence_count, first_year, last_year
    )
    SELECT
      $1, $2, a.cell_id, r.geom, r.gbif_id,
      a.occurrence_count, a.species_count, a.image_count, a.audio_count,
      a.video_count, a.aves_count, a.insecta_count, a.audio_occurrence_count,
      a.first_year, a.last_year
    FROM aggregates a
    JOIN representatives r USING (cell_id)
  `, [datasetId, resolution])
}

async function rebuildSpeciesCells(client: PoolClient, datasetId: string, resolution: number) {
  const column = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[resolution]
  if (!column) throw new Error(`Unsupported H3 resolution ${resolution}`)
  await client.query(`WITH source AS (
      SELECT
        o.gbif_id,
        o.species_key,
        o.geom,
        o.event_year,
        o.${column} AS cell_id,
        COALESCE(m.image_count, 0) AS image_count,
        COALESCE(m.audio_count, 0) AS audio_count,
        COALESCE(m.video_count, 0) AS video_count
      FROM occurrences o
      LEFT JOIN ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE} m ON m.occurrence_gbif_id = o.gbif_id
      WHERE o.dataset_id = $1
        AND o.${column} IS NOT NULL
        AND o.species_key IS NOT NULL
    ),
    representatives AS (
      SELECT DISTINCT ON (cell_id, species_key)
        cell_id, species_key, gbif_id, geom
      FROM source
      ORDER BY cell_id, species_key, gbif_id
    ),
    aggregates AS (
      SELECT
        cell_id,
        species_key,
        COUNT(*) AS occurrence_count,
        SUM(image_count) AS image_count,
        SUM(audio_count) AS audio_count,
        SUM(video_count) AS video_count,
        MIN(event_year) AS first_year,
        MAX(event_year) AS last_year
      FROM source
      GROUP BY cell_id, species_key
    )
    INSERT INTO species_cells (
      dataset_id, resolution, cell_id, species_key, anchor,
      representative_occurrence_id, occurrence_count, image_count,
      audio_count, video_count, first_year, last_year
    )
    SELECT
      $1, $2, a.cell_id, a.species_key, r.geom, r.gbif_id,
      a.occurrence_count, a.image_count, a.audio_count, a.video_count,
      a.first_year, a.last_year
    FROM aggregates a
    JOIN representatives r USING (cell_id, species_key)
  `, [datasetId, resolution])
}

export async function rebuildAggregates(client: PoolClient, datasetId: string, baseResolution: number = ImportConstants.DEFAULT_BASE_H3_RESOLUTION) {
  if (!MapDataConstants.SUPPORTED_H3_RESOLUTIONS.includes(
    baseResolution as typeof MapDataConstants.SUPPORTED_H3_RESOLUTIONS[number],
  )) {
    throw new Error(`H3 base resolution must be one of ${MapDataConstants.SUPPORTED_H3_RESOLUTIONS.join(', ')}`)
  }
  await client.query('BEGIN')
  try {
    await createMediaCountsTable(client, datasetId)
    await client.query('DELETE FROM map_cells WHERE dataset_id = $1', [datasetId])
    await client.query('DELETE FROM species_cells WHERE dataset_id = $1', [datasetId])
    for (const resolution of MapDataConstants.SUPPORTED_H3_RESOLUTIONS) {
      if (resolution < baseResolution) await rebuildMapCells(client, datasetId, resolution)
    }
    await rebuildSpeciesCells(client, datasetId, baseResolution)
    await client.query(`WITH occurrence_counts AS (
      SELECT
        COUNT(*) AS occurrence_count,
        COUNT(*) FILTER (WHERE o.geom IS NOT NULL) AS plottable_count,
        COUNT(DISTINCT o.species_key) FILTER (WHERE o.species_key IS NOT NULL) AS species_count,
        COUNT(*) FILTER (
          WHERE o.geom IS NOT NULL
            AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = 'Aves'
        ) AS aves_count,
        COUNT(*) FILTER (
          WHERE o.geom IS NOT NULL
            AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = 'Insecta'
        ) AS insecta_count,
        COUNT(*) FILTER (
          WHERE o.geom IS NOT NULL AND COALESCE(m.audio_count, 0) > 0
        ) AS audio_occurrence_count
      FROM occurrences o
      LEFT JOIN species s ON s.species_key = o.species_key
      LEFT JOIN ${AggregateRebuildConstants.MEDIA_COUNTS_TABLE} m ON m.occurrence_gbif_id = o.gbif_id
      WHERE o.dataset_id = $1
    ), media_counts AS (
      SELECT COUNT(*) AS media_count
      FROM media
      WHERE dataset_id = $1
    )
      UPDATE datasets d SET
        occurrence_count = occurrence_counts.occurrence_count,
        plottable_count = occurrence_counts.plottable_count,
        species_count = occurrence_counts.species_count,
        media_count = media_counts.media_count,
        aves_count = occurrence_counts.aves_count,
        insecta_count = occurrence_counts.insecta_count,
        audio_occurrence_count = occurrence_counts.audio_occurrence_count,
        status = 'ready',
        updated_at = NOW()
      FROM occurrence_counts, media_counts
      WHERE d.id = $1
    `, [datasetId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function runFromCli() {
  const config = loadConfig()
  const versionArgument = process.argv.find(argument => argument.startsWith('--version='))?.slice('--version='.length)
  const datasetVersion = versionArgument || config.activeDatasetVersion
  const pool = createPool(config)
  const client = await pool.connect()
  try {
    const result = await client.query<{ id: string }>('SELECT id::text FROM datasets WHERE version = $1', [datasetVersion])
    const datasetId = result.rows[0]?.id
    if (!datasetId) throw new Error(`Dataset ${datasetVersion} was not found`)
    await rebuildAggregates(client, datasetId, config.h3BaseResolution)
    console.log(`Rebuilt map aggregates for ${datasetVersion}`)
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFromCli().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
