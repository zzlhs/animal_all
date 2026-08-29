import { once } from 'node:events'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Readable } from 'node:stream'
import QueryStream from 'pg-query-stream'
import type { PoolClient, QueryResultRow } from 'pg'
import { cellToLatLng } from 'h3-js'
import { MapDataConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import { createPool } from '../db/pool.js'
import { MapBuildConstants } from './map-build.constants.js'

export interface MapCellRow extends QueryResultRow {
  dataset_version: string
  dataset_revision: string
  resolution: number
  cell_id: string
  representative_occurrence_id: string
  occurrence_count: string
  species_count: string
  image_count: string
  audio_count: string
  video_count: string
  aves_count: string
  insecta_count: string
  audio_occurrence_count: string
  first_year: number | null
  last_year: number | null
}

export interface SpeciesCellRow extends QueryResultRow {
  dataset_version: string
  dataset_revision: string
  resolution: number
  cell_id: string
  species_key: string
  scientific_name: string
  class_name: string | null
  representative_occurrence_id: string
  occurrence_count: string
  image_count: string
  audio_count: string
  video_count: string
  first_year: number | null
  last_year: number | null
}

export interface ExactOccurrenceRow extends QueryResultRow {
  dataset_version: string
  dataset_revision: string
  resolution: number
  cell_id: string
  representative_occurrence_id: string
  species_key: string | null
  scientific_name: string
  class_name: string | null
  longitude: number
  latitude: number
  occurrence_count: string
  species_count: string
  image_count: string
  audio_count: string
  video_count: string
  aves_count: string
  insecta_count: string
  audio_occurrence_count: string
}

function cliValue(name: string, fallback: string) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

async function writeLine(file: Awaited<ReturnType<typeof open>>, value: unknown) {
  const line = `${JSON.stringify(value)}\n`
  await file.write(line)
}

async function streamRows<Row extends QueryResultRow>(client: PoolClient, query: QueryStream, onRow: (row: Row) => Promise<void>) {
  const stream = client.query(query) as unknown as Readable
  stream.on('data', (row: Row) => {
    stream.pause()
    void onRow(row).then(() => stream.resume()).catch(error => stream.destroy(error))
  })
  await once(stream, 'end')
}

export function mapCellFeature(row: MapCellRow, sourceLayer: string) {
  const zoomRange = MapDataConstants.ZOOM_RANGE_BY_RESOLUTION[row.resolution]!
  const [latitude, longitude] = cellToLatLng(row.cell_id)
  return {
    type: 'Feature',
    tippecanoe: { layer: sourceLayer, minzoom: zoomRange.min, maxzoom: zoomRange.max },
    // A canonical H3 center is deterministic. It does not depend on whichever
    // occurrence happened to be selected as the representative for a cell.
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      dataset_version: row.dataset_version,
      dataset_revision: row.dataset_revision,
      kind: 'cluster',
      resolution: row.resolution,
      cell_id: row.cell_id,
      representative_occurrence_id: row.representative_occurrence_id,
      occurrence_count: Number(row.occurrence_count),
      species_count: Number(row.species_count),
      image_count: Number(row.image_count),
      audio_count: Number(row.audio_count),
      video_count: Number(row.video_count),
      aves_count: Number(row.aves_count),
      insecta_count: Number(row.insecta_count),
      audio_occurrence_count: Number(row.audio_occurrence_count),
      first_year: row.first_year,
      last_year: row.last_year,
    },
  }
}

export function speciesCellFeature(row: SpeciesCellRow, sourceLayer: string) {
  const zoomRange = MapDataConstants.ZOOM_RANGE_BY_RESOLUTION[row.resolution]!
  const [latitude, longitude] = cellToLatLng(row.cell_id)
  return {
    type: 'Feature',
    tippecanoe: { layer: sourceLayer, minzoom: zoomRange.min, maxzoom: MapBuildConstants.SPECIES_CELL_MAX_ZOOM },
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      dataset_version: row.dataset_version,
      dataset_revision: row.dataset_revision,
      kind: 'species',
      resolution: row.resolution,
      cell_id: row.cell_id,
      species_key: row.species_key,
      scientific_name: row.scientific_name,
      class_name: row.class_name,
      representative_occurrence_id: row.representative_occurrence_id,
      occurrence_count: Number(row.occurrence_count),
      species_count: 1,
      image_count: Number(row.image_count),
      audio_count: Number(row.audio_count),
      video_count: Number(row.video_count),
      first_year: row.first_year,
      last_year: row.last_year,
    },
  }
}

export function exactOccurrenceFeature(row: ExactOccurrenceRow, sourceLayer: string) {
  return {
    type: 'Feature',
    tippecanoe: {
      layer: sourceLayer,
      minzoom: MapBuildConstants.EXACT_POINT_MIN_ZOOM,
      maxzoom: MapBuildConstants.MAX_ZOOM,
    },
    geometry: { type: 'Point', coordinates: [Number(row.longitude), Number(row.latitude)] },
    properties: {
      dataset_version: row.dataset_version,
      dataset_revision: row.dataset_revision,
      kind: 'coordinate',
      resolution: row.resolution,
      cell_id: row.cell_id,
      exact_latitude: String(row.latitude),
      exact_longitude: String(row.longitude),
      species_key: row.species_key,
      scientific_name: row.scientific_name,
      class_name: row.class_name,
      representative_occurrence_id: row.representative_occurrence_id,
      occurrence_count: Number(row.occurrence_count),
      species_count: Number(row.species_count),
      image_count: Number(row.image_count),
      audio_count: Number(row.audio_count),
      video_count: Number(row.video_count),
      aves_count: Number(row.aves_count),
      insecta_count: Number(row.insecta_count),
      audio_occurrence_count: Number(row.audio_occurrence_count),
    },
  }
}

async function exportMapFeatures() {
  const config = loadConfig()
  const outputPath = resolve(cliValue('--output', MapBuildConstants.DEFAULT_GEOJSON_OUTPUT))
  const datasetVersion = cliValue('--version', config.activeDatasetVersion)
  const baseResolutionColumn = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[config.h3BaseResolution]
  if (!baseResolutionColumn) throw new Error(`Unsupported H3 base resolution ${config.h3BaseResolution}`)
  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryOutputPath = `${outputPath}.building`
  const pool = createPool(config)
  const client = await pool.connect()
  let file: Awaited<ReturnType<typeof open>> | null = null
  let featureCount = 0
  let completed = false
  let transactionStarted = false

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionStarted = true
    const datasetResult = await client.query<{ status: string; plottable_count: string }>(`
      SELECT status, plottable_count::text
      FROM datasets
      WHERE version = $1
      LIMIT 1
    `, [datasetVersion])
    const dataset = datasetResult.rows[0]
    if (!dataset) throw new Error(`Dataset ${datasetVersion} was not found`)
    if (dataset.status !== 'ready') throw new Error(`Dataset ${datasetVersion} is not ready`)
    if (Number(dataset.plottable_count) < 1) throw new Error(`Dataset ${datasetVersion} has no plottable records`)
    file = await open(temporaryOutputPath, 'w')

    const mapQuery = new QueryStream(`
      SELECT
        d.version AS dataset_version,
        d.revision::text AS dataset_revision,
        mc.resolution,
        mc.cell_id,
        mc.representative_occurrence_id::text,
        mc.occurrence_count::text,
        mc.species_count::text,
        mc.image_count::text,
        mc.audio_count::text,
        mc.video_count::text,
        mc.aves_count::text,
        mc.insecta_count::text,
        mc.audio_occurrence_count::text,
        mc.first_year,
        mc.last_year
      FROM map_cells mc
      JOIN datasets d ON d.id = mc.dataset_id
      WHERE d.version = $1 AND d.status = 'ready' AND mc.resolution < $2
      ORDER BY mc.resolution, mc.cell_id
    `, [datasetVersion, config.h3BaseResolution])
    await streamRows<MapCellRow>(client, mapQuery, async row => {
      await writeLine(file!, mapCellFeature(row, config.pmtilesSourceLayer))
      featureCount += 1
    })

    const speciesQuery = new QueryStream(`
      SELECT
        d.version AS dataset_version,
        d.revision::text AS dataset_revision,
        sc.resolution,
        sc.cell_id,
        sc.species_key::text,
        COALESCE(NULLIF(representative.raw_data->>'speciesName', ''), s.scientific_name) AS scientific_name,
        COALESCE(NULLIF(representative.raw_data->>'className', ''), s.class_name) AS class_name,
        sc.representative_occurrence_id::text,
        sc.occurrence_count::text,
        sc.image_count::text,
        sc.audio_count::text,
        sc.video_count::text,
        sc.first_year,
        sc.last_year
      FROM species_cells sc
      JOIN datasets d ON d.id = sc.dataset_id
      JOIN species s ON s.species_key = sc.species_key
      JOIN occurrences representative
        ON representative.dataset_id = sc.dataset_id
       AND representative.gbif_id = sc.representative_occurrence_id
      WHERE d.version = $1 AND d.status = 'ready' AND sc.resolution = $2
      ORDER BY sc.cell_id, sc.species_key
    `, [datasetVersion, config.h3BaseResolution])
    await streamRows<SpeciesCellRow>(client, speciesQuery, async row => {
      await writeLine(file!, speciesCellFeature(row, config.pmtilesSourceLayer))
      featureCount += 1
    })

    const exactOccurrenceQuery = new QueryStream(`
      WITH selected_dataset AS (
        SELECT id, version, revision FROM datasets WHERE version = $1 AND status = 'ready'
      ),
      media_counts AS (
        SELECT
          m.dataset_id,
          m.occurrence_gbif_id,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%stillimage%'
               OR LOWER(COALESCE(m.format, '')) LIKE 'image/%'
          ) AS image_count,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%sound%'
               OR LOWER(COALESCE(m.format, '')) LIKE 'audio/%'
          ) AS audio_count,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%movingimage%'
               OR LOWER(COALESCE(m.media_type, '')) LIKE '%video%'
               OR LOWER(COALESCE(m.format, '')) LIKE 'video/%'
          ) AS video_count
        FROM media m
        JOIN selected_dataset selected ON selected.id = m.dataset_id
        GROUP BY m.dataset_id, m.occurrence_gbif_id
      )
      SELECT
        MIN(d.version) AS dataset_version,
        MIN(d.revision::text) AS dataset_revision,
        $2::smallint AS resolution,
        o.${baseResolutionColumn} AS cell_id,
        MIN(o.gbif_id)::text AS representative_occurrence_id,
        CASE WHEN COUNT(DISTINCT o.species_key) = 1 THEN MIN(o.species_key)::text ELSE NULL END AS species_key,
        CASE WHEN COUNT(DISTINCT o.species_key) = 1 THEN MIN(o.scientific_name) ELSE '' END AS scientific_name,
        CASE WHEN COUNT(DISTINCT COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name)) = 1
          THEN MIN(COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name)) ELSE NULL END AS class_name,
        o.decimal_longitude AS longitude,
        o.decimal_latitude AS latitude,
        COUNT(*)::text AS occurrence_count,
        COUNT(DISTINCT o.species_key) FILTER (WHERE o.species_key IS NOT NULL)::text AS species_count,
        SUM(COALESCE(mc.image_count, 0))::text AS image_count,
        SUM(COALESCE(mc.audio_count, 0))::text AS audio_count,
        SUM(COALESCE(mc.video_count, 0))::text AS video_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = 'Aves')::text AS aves_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = 'Insecta')::text AS insecta_count,
        COUNT(*) FILTER (WHERE COALESCE(mc.audio_count, 0) > 0)::text AS audio_occurrence_count
      FROM occurrences o
      JOIN selected_dataset d ON d.id = o.dataset_id
      LEFT JOIN species s ON s.species_key = o.species_key
      LEFT JOIN media_counts mc
        ON mc.dataset_id = o.dataset_id
       AND mc.occurrence_gbif_id = o.gbif_id
      WHERE o.geom IS NOT NULL AND o.${baseResolutionColumn} IS NOT NULL
      GROUP BY o.${baseResolutionColumn}, o.decimal_longitude, o.decimal_latitude
      ORDER BY o.decimal_longitude, o.decimal_latitude
    `, [datasetVersion, config.h3BaseResolution])
    await streamRows<ExactOccurrenceRow>(client, exactOccurrenceQuery, async row => {
      await writeLine(file!, exactOccurrenceFeature(row, config.pmtilesSourceLayer))
      featureCount += 1
    })
    await client.query('COMMIT')
    transactionStarted = false
    completed = true
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    let fileClosed = file == null
    try {
      if (file) await file.close()
      fileClosed = true
    } finally {
      client.release()
      await pool.end()
      if (completed && fileClosed) await rename(temporaryOutputPath, outputPath)
      else await rm(temporaryOutputPath, { force: true })
    }
  }
  console.log(`Exported ${featureCount.toLocaleString()} map features to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exportMapFeatures().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
