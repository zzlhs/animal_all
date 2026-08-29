import type { QueryResultRow } from 'pg'
import { MapDataConstants } from '../config/api.constants.js'
import type { OccurrenceRecord, MediaItem, PageResult } from '../domain/occurrence.js'
import type { DatabaseClient } from '../db/pool.js'
import { decodeCursor, encodeCursor } from '../lib/cursor.js'

interface OccurrenceRow extends QueryResultRow {
  dataset_id: string
  gbif_id: string
  occurrence_id: string | null
  species_key: string | null
  dataset_key: string | null
  dataset_name: string | null
  scientific_name: string
  vernacular_name: string | null
  data_language: string | null
  kingdom: string | null
  phylum: string | null
  class_name: string | null
  order_name: string | null
  family: string | null
  genus: string | null
  species_name: string | null
  taxon_rank: string | null
  country_code: string | null
  country_name: string | null
  continent: string | null
  state_province: string | null
  county: string | null
  municipality: string | null
  locality: string | null
  latitude: number
  longitude: number
  coordinate_uncertainty_meters: number | null
  coordinate_precision: number | null
  event_date: string | null
  event_year: number | null
  basis_of_record: string | null
  occurrence_status: string | null
  occurrence_license: string | null
  references_url: string | null
  rights_holder: string | null
  aggregate_count?: string | number
  total_count?: string
}

interface MediaRow extends QueryResultRow {
  id: string
  occurrence_gbif_id: string
  media_type: string | null
  format: string | null
  identifier: string
  source_url: string | null
  references_url: string | null
  title: string | null
  description: string | null
  created: string | null
  creator: string | null
  contributor: string | null
  publisher: string | null
  license: string | null
  rights_holder: string | null
  imagekit_url: string | null
}

const OCCURRENCE_FIELDS = `
    o.dataset_id::text,
    o.gbif_id::text,
    o.occurrence_id,
    o.species_key::text,
    o.dataset_key::text,
    o.dataset_name,
    o.scientific_name,
    NULLIF(o.raw_data->>'vernacularName', '') AS vernacular_name,
    NULLIF(o.raw_data->>'language', '') AS data_language,
    COALESCE(NULLIF(o.raw_data->>'kingdom', ''), s.kingdom) AS kingdom,
    COALESCE(NULLIF(o.raw_data->>'phylum', ''), s.phylum) AS phylum,
    COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) AS class_name,
    COALESCE(NULLIF(o.raw_data->>'orderName', ''), s.order_name) AS order_name,
    COALESCE(NULLIF(o.raw_data->>'family', ''), s.family) AS family,
    COALESCE(NULLIF(o.raw_data->>'genus', ''), s.genus) AS genus,
    COALESCE(NULLIF(o.raw_data->>'speciesName', ''), s.scientific_name) AS species_name,
    COALESCE(NULLIF(o.raw_data->>'taxonRank', ''), s.taxon_rank) AS taxon_rank,
    o.country_code,
    NULLIF(o.raw_data->>'country', '') AS country_name,
    o.continent,
    o.state_province,
    o.county,
    o.municipality,
    o.locality,
    o.decimal_latitude AS latitude,
    o.decimal_longitude AS longitude,
    o.coordinate_uncertainty_meters,
    o.coordinate_precision,
    o.event_date,
    o.event_year,
    o.basis_of_record,
    o.occurrence_status,
    o.license AS occurrence_license,
    o.references_url,
    o.rights_holder
`

const OCCURRENCE_FROM = `
  FROM occurrences o
  JOIN datasets d ON d.id = o.dataset_id AND d.status = 'ready'
  LEFT JOIN species s ON s.species_key = o.species_key
`

const OCCURRENCE_SELECT = `SELECT ${OCCURRENCE_FIELDS} ${OCCURRENCE_FROM}`

function mediaByOccurrence(rows: readonly MediaRow[]) {
  const result = new Map<string, MediaItem[]>()
  for (const row of rows) {
    const items = result.get(row.occurrence_gbif_id) ?? []
    items.push({
      id: row.id,
      type: row.media_type ?? '',
      format: row.format ?? '',
      identifier: row.imagekit_url || row.identifier,
      source: row.source_url || row.identifier,
      references: row.references_url ?? '',
      title: row.title ?? '',
      description: row.description ?? '',
      created: row.created ?? '',
      creator: row.creator ?? '',
      contributor: row.contributor ?? '',
      publisher: row.publisher ?? '',
      license: row.license ?? '',
      rightsHolder: row.rights_holder ?? '',
    })
    result.set(row.occurrence_gbif_id, items)
  }
  return result
}

function toOccurrence(row: OccurrenceRow, media: readonly MediaItem[]): OccurrenceRecord {
  return {
    gbifID: row.gbif_id,
    occurrenceID: row.occurrence_id ?? '',
    speciesKey: row.species_key,
    datasetKey: row.dataset_key ?? '',
    datasetName: row.dataset_name ?? '',
    scientificName: row.scientific_name,
    vernacularName: row.vernacular_name ?? '',
    dataLanguage: row.data_language ?? '',
    kingdom: row.kingdom ?? '',
    phylum: row.phylum ?? '',
    class: row.class_name ?? '',
    order: row.order_name ?? '',
    family: row.family ?? '',
    genus: row.genus ?? '',
    species: row.species_name,
    taxonRank: row.taxon_rank ?? '',
    countryCode: row.country_code ?? '',
    country: row.country_name ?? '',
    continent: row.continent ?? '',
    stateProvince: row.state_province ?? '',
    county: row.county ?? '',
    municipality: row.municipality ?? '',
    locality: row.locality ?? '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    hasCoordinates: Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)),
    coordinateUncertaintyInMeters: row.coordinate_uncertainty_meters == null ? null : Number(row.coordinate_uncertainty_meters),
    coordinatePrecision: row.coordinate_precision == null ? null : Number(row.coordinate_precision),
    eventDate: row.event_date ?? '',
    year: row.event_year,
    basisOfRecord: row.basis_of_record ?? '',
    occurrenceStatus: row.occurrence_status ?? '',
    license: row.occurrence_license ?? '',
    references: row.references_url ?? '',
    rightsHolder: row.rights_holder ?? '',
    ...(row.aggregate_count == null ? {} : { aggregateCount: Number(row.aggregate_count) }),
    media: [...media],
  }
}

async function loadMedia(database: DatabaseClient, datasetId: string, occurrenceIds: readonly string[]) {
  if (occurrenceIds.length === 0) return new Map<string, MediaItem[]>()
  const result = await database.query<MediaRow>(`
    SELECT
      m.id::text,
      m.occurrence_gbif_id::text,
      m.media_type,
      m.format,
      m.identifier,
      m.source_url,
      m.references_url,
      m.title,
      m.description,
      m.created,
      m.creator,
      m.contributor,
      m.publisher,
      m.license,
      m.rights_holder,
      m.imagekit_url
    FROM media m
    WHERE m.dataset_id = $1::bigint AND m.occurrence_gbif_id = ANY($2::bigint[])
    ORDER BY m.occurrence_gbif_id, m.id
  `, [datasetId, occurrenceIds])
  return mediaByOccurrence(result.rows)
}

async function countCellOccurrences(
  database: DatabaseClient,
  datasetVersion: string,
  resolution: number,
  cellId: string,
  speciesKey?: string,
  recordFilter?: 'Aves' | 'Insecta' | 'audio',
) {
  if (!speciesKey) {
    const countColumn = MapDataConstants.CELL_COUNT_COLUMN_BY_FILTER[recordFilter ?? 'all']
    const aggregate = await database.query<{ total_count: string }>(`
      SELECT mc.${countColumn}::text AS total_count
      FROM map_cells mc
      JOIN datasets d ON d.id = mc.dataset_id AND d.status = 'ready'
      WHERE d.version = $1 AND mc.resolution = $2 AND mc.cell_id = $3
      LIMIT 1
    `, [datasetVersion, resolution, cellId])
    if (aggregate.rows[0]) return Number(aggregate.rows[0].total_count)
  } else if (!recordFilter) {
    const aggregate = await database.query<{ total_count: string }>(`
      SELECT sc.occurrence_count::text AS total_count
      FROM species_cells sc
      JOIN datasets d ON d.id = sc.dataset_id AND d.status = 'ready'
      WHERE d.version = $1 AND sc.resolution = $2 AND sc.cell_id = $3
        AND sc.species_key = $4::bigint
      LIMIT 1
    `, [datasetVersion, resolution, cellId, speciesKey])
    if (aggregate.rows[0]) return Number(aggregate.rows[0].total_count)
  }

  const column = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[resolution]
  if (!column) throw new Error('Unsupported H3 resolution')
  const values: unknown[] = [datasetVersion, cellId]
  const speciesClause = speciesKey ? `AND o.species_key = $${values.push(speciesKey)}::bigint` : ''
  const classClause = recordFilter === 'Aves' || recordFilter === 'Insecta'
    ? `AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = $${values.push(recordFilter)}`
    : ''
  const audioClause = recordFilter === 'audio' ? `AND EXISTS (
    SELECT 1 FROM media filtered_media
    WHERE filtered_media.dataset_id = o.dataset_id
      AND filtered_media.occurrence_gbif_id = o.gbif_id
      AND (
        LOWER(COALESCE(filtered_media.media_type, '')) LIKE '%sound%'
        OR LOWER(COALESCE(filtered_media.format, '')) LIKE 'audio/%'
      )
  )` : ''
  const result = await database.query<{ total_count: string }>(`
    SELECT COUNT(*)::text AS total_count
    FROM occurrences o
    JOIN datasets d ON d.id = o.dataset_id AND d.status = 'ready'
    LEFT JOIN species s ON s.species_key = o.species_key
    WHERE d.version = $1 AND o.${column} = $2
      ${speciesClause}
      ${classClause}
      ${audioClause}
  `, values)
  return Number(result.rows[0]?.total_count ?? 0)
}

export async function getOccurrence(database: DatabaseClient, datasetVersion: string, gbifId: string) {
  const result = await database.query<OccurrenceRow>(`${OCCURRENCE_SELECT}
    WHERE d.version = $1 AND o.gbif_id = $2::bigint
    LIMIT 1
  `, [datasetVersion, gbifId])
  const row = result.rows[0]
  if (!row) return null
  const media = await loadMedia(database, row.dataset_id, [row.gbif_id])
  return toOccurrence(row, media.get(row.gbif_id) ?? [])
}

export async function listCellOccurrences(
  database: DatabaseClient,
  datasetVersion: string,
  resolution: number,
  cellId: string,
  limit: number,
  cursorValue?: string,
  speciesKey?: string,
  recordFilter?: 'Aves' | 'Insecta' | 'audio',
): Promise<PageResult<OccurrenceRecord>> {
  const column = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[resolution]
  if (!column) throw new Error('Unsupported H3 resolution')
  const cursor = decodeCursor(cursorValue)
  const values: unknown[] = [datasetVersion, cellId, cursor?.id ?? '0', limit + 1]
  const speciesClause = speciesKey ? `AND o.species_key = $${values.push(speciesKey)}::bigint` : ''
  const classClause = recordFilter === 'Aves' || recordFilter === 'Insecta'
    ? `AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = $${values.push(recordFilter)}`
    : ''
  const audioClause = recordFilter === 'audio' ? `AND EXISTS (
    SELECT 1 FROM media filtered_media
    WHERE filtered_media.dataset_id = o.dataset_id
      AND filtered_media.occurrence_gbif_id = o.gbif_id
      AND (
        LOWER(COALESCE(filtered_media.media_type, '')) LIKE '%sound%'
        OR LOWER(COALESCE(filtered_media.format, '')) LIKE 'audio/%'
      )
  )` : ''
  const total = await countCellOccurrences(
    database, datasetVersion, resolution, cellId, speciesKey, recordFilter,
  )
  const result = await database.query<OccurrenceRow>(`SELECT ${OCCURRENCE_FIELDS}
    ${OCCURRENCE_FROM}
    WHERE d.version = $1
      AND o.${column} = $2
      AND o.gbif_id > $3::bigint
      ${speciesClause}
      ${classClause}
      ${audioClause}
    ORDER BY o.gbif_id
    LIMIT $4
  `, values)

  const hasNextPage = result.rows.length > limit
  const pageRows = hasNextPage ? result.rows.slice(0, limit) : result.rows
  const media = pageRows[0]
    ? await loadMedia(database, pageRows[0].dataset_id, pageRows.map(row => row.gbif_id))
    : new Map<string, MediaItem[]>()
  return {
    items: pageRows.map(row => toOccurrence(row, media.get(row.gbif_id) ?? [])),
    total,
    nextCursor: hasNextPage && pageRows.length > 0 ? encodeCursor({ id: pageRows[pageRows.length - 1]!.gbif_id }) : null,
  }
}

export async function listCoordinateOccurrences(
  database: DatabaseClient,
  datasetVersion: string,
  latitude: number,
  longitude: number,
  limit: number,
  cursorValue?: string,
  speciesKey?: string,
  recordFilter?: 'Aves' | 'Insecta' | 'audio',
): Promise<PageResult<OccurrenceRecord>> {
  const cursor = decodeCursor(cursorValue)
  const values: unknown[] = [datasetVersion, latitude, longitude, cursor?.id ?? '0', limit + 1]
  const speciesClause = speciesKey ? `AND o.species_key = $${values.push(speciesKey)}::bigint` : ''
  const classClause = recordFilter === 'Aves' || recordFilter === 'Insecta'
    ? `AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = $${values.push(recordFilter)}`
    : ''
  const audioClause = recordFilter === 'audio' ? `AND EXISTS (
    SELECT 1 FROM media filtered_media
    WHERE filtered_media.dataset_id = o.dataset_id
      AND filtered_media.occurrence_gbif_id = o.gbif_id
      AND (
        LOWER(COALESCE(filtered_media.media_type, '')) LIKE '%sound%'
        OR LOWER(COALESCE(filtered_media.format, '')) LIKE 'audio/%'
      )
  )` : ''
  const countValues: unknown[] = [datasetVersion, latitude, longitude]
  const countSpeciesClause = speciesKey ? `AND o.species_key = $${countValues.push(speciesKey)}::bigint` : ''
  const countClassClause = recordFilter === 'Aves' || recordFilter === 'Insecta'
    ? `AND COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name) = $${countValues.push(recordFilter)}`
    : ''
  const countAudioClause = recordFilter === 'audio' ? audioClause : ''

  const countResult = await database.query<{ total_count: string }>(`
    SELECT COUNT(*)::text AS total_count
    FROM occurrences o
    JOIN datasets d ON d.id = o.dataset_id AND d.status = 'ready'
    LEFT JOIN species s ON s.species_key = o.species_key
    WHERE d.version = $1
      AND o.decimal_latitude = $2::double precision
      AND o.decimal_longitude = $3::double precision
      ${countSpeciesClause}
      ${countClassClause}
      ${countAudioClause}
  `, countValues)
  const result = await database.query<OccurrenceRow>(`SELECT ${OCCURRENCE_FIELDS}
    ${OCCURRENCE_FROM}
    WHERE d.version = $1
      AND o.decimal_latitude = $2::double precision
      AND o.decimal_longitude = $3::double precision
      AND o.gbif_id > $4::bigint
      ${speciesClause}
      ${classClause}
      ${audioClause}
    ORDER BY o.gbif_id
    LIMIT $5
  `, values)
  const hasNextPage = result.rows.length > limit
  const pageRows = hasNextPage ? result.rows.slice(0, limit) : result.rows
  const media = pageRows[0]
    ? await loadMedia(database, pageRows[0].dataset_id, pageRows.map(row => row.gbif_id))
    : new Map<string, MediaItem[]>()
  return {
    items: pageRows.map(row => toOccurrence(row, media.get(row.gbif_id) ?? [])),
    total: Number(countResult.rows[0]?.total_count ?? 0),
    nextCursor: hasNextPage && pageRows.length > 0 ? encodeCursor({ id: pageRows[pageRows.length - 1]!.gbif_id }) : null,
  }
}

export async function listCellSpecies(
  database: DatabaseClient,
  datasetVersion: string,
  resolution: number,
  cellId: string,
  limit: number,
  cursorValue?: string,
): Promise<PageResult<OccurrenceRecord>> {
  const column = MapDataConstants.RESOLUTION_COLUMN_BY_VALUE[resolution]
  if (!column) throw new Error('Unsupported H3 resolution')
  const cursor = decodeCursor(cursorValue)
  const grouped = await database.query<{ species_key: string; representative_id: string; aggregate_count: string; total_count: string }>(`
    WITH grouped AS (
      SELECT
        o.species_key,
        MIN(o.gbif_id) AS representative_id,
        COUNT(*) AS aggregate_count
      FROM occurrences o
      JOIN datasets d ON d.id = o.dataset_id AND d.status = 'ready'
      WHERE d.version = $1
        AND o.${column} = $2
        AND o.species_key IS NOT NULL
        AND o.species_key > $3::bigint
      GROUP BY o.species_key
      ORDER BY o.species_key
      LIMIT $4
    )
    SELECT
      species_key::text,
      representative_id::text,
      aggregate_count::text,
      (SELECT COUNT(DISTINCT o2.species_key)
       FROM occurrences o2
       JOIN datasets d2 ON d2.id = o2.dataset_id AND d2.status = 'ready'
       WHERE d2.version = $1 AND o2.${column} = $2 AND o2.species_key IS NOT NULL)::text AS total_count
    FROM grouped
  `, [datasetVersion, cellId, cursor?.id ?? '0', limit + 1])

  const hasNextPage = grouped.rows.length > limit
  const pageRows = hasNextPage ? grouped.rows.slice(0, limit) : grouped.rows
  if (pageRows.length === 0) return { items: [], total: 0, nextCursor: null }
  const representativeIds = pageRows.map(row => row.representative_id)
  const occurrenceResult = await database.query<OccurrenceRow>(`${OCCURRENCE_SELECT}
    WHERE d.version = $1 AND o.gbif_id = ANY($2::bigint[])
  `, [datasetVersion, representativeIds])
  const occurrenceById = new Map(occurrenceResult.rows.map(row => [row.gbif_id, row]))
  const media = occurrenceResult.rows[0]
    ? await loadMedia(database, occurrenceResult.rows[0].dataset_id, representativeIds)
    : new Map<string, MediaItem[]>()
  const items = pageRows.flatMap(group => {
    const occurrence = occurrenceById.get(group.representative_id)
    if (!occurrence) return []
    occurrence.aggregate_count = group.aggregate_count
    return [toOccurrence(occurrence, media.get(group.representative_id) ?? [])]
  })
  return {
    items,
    total: Number(grouped.rows[0]?.total_count ?? 0),
    nextCursor: hasNextPage ? encodeCursor({ id: pageRows[pageRows.length - 1]!.species_key }) : null,
  }
}
