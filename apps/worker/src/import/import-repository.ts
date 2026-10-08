import type { PoolClient } from 'pg'
import type { MediaImportRecord, OccurrenceImportRecord, SpeciesImportRecord } from './dwca-records.js'

const DatasetImportConstants = Object.freeze({
  STAGING_VERSION_SUFFIX: '.__staging__',
  RETIRED_VERSION_SEPARATOR: '.__retired__.',
})

export interface DatasetImportHandle {
  id: string
  targetVersion: string
  stagingVersion: string
  replace: boolean
}

function valueGroups(rowCount: number, columnCount: number, startIndex = 1) {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const offset = startIndex + rowIndex * columnCount
    return `(${Array.from({ length: columnCount }, (_unused, columnIndex) => `$${offset + columnIndex}`).join(', ')})`
  }).join(', ')
}

async function releaseDatasetImportLock(client: PoolClient, version: string) {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [version])
}

async function publishDatasetTaxonomy(client: PoolClient, datasetId: string) {
  await client.query(`
    WITH dataset_species AS (
      SELECT DISTINCT ON (o.species_key)
        o.species_key,
        COALESCE(NULLIF(o.raw_data->>'speciesName', ''), o.scientific_name) AS scientific_name,
        NULLIF(o.raw_data->>'acceptedScientificName', '') AS accepted_scientific_name,
        NULLIF(o.raw_data->>'kingdom', '') AS kingdom,
        NULLIF(o.raw_data->>'phylum', '') AS phylum,
        NULLIF(o.raw_data->>'className', '') AS class_name,
        NULLIF(o.raw_data->>'orderName', '') AS order_name,
        NULLIF(o.raw_data->>'family', '') AS family,
        NULLIF(o.raw_data->>'genus', '') AS genus,
        NULLIF(o.raw_data->>'taxonRank', '') AS taxon_rank
      FROM occurrences o
      WHERE o.dataset_id = $1 AND o.species_key IS NOT NULL
      ORDER BY o.species_key, o.gbif_id
    )
    UPDATE species s SET
      scientific_name = source.scientific_name,
      accepted_scientific_name = source.accepted_scientific_name,
      kingdom = source.kingdom,
      phylum = source.phylum,
      class_name = source.class_name,
      order_name = source.order_name,
      family = source.family,
      genus = source.genus,
      taxon_rank = source.taxon_rank,
      updated_at = NOW()
    FROM dataset_species source
    WHERE s.species_key = source.species_key
  `, [datasetId])
}

export async function beginDatasetImport(
  client: PoolClient,
  version: string,
  sourceArchive: string,
  kingdomFilter: string,
  replace: boolean,
) : Promise<DatasetImportHandle> {
  if (version.endsWith(DatasetImportConstants.STAGING_VERSION_SUFFIX)) {
    throw new Error(`Dataset version must not end with ${DatasetImportConstants.STAGING_VERSION_SUFFIX}`)
  }
  const stagingVersion = `${version}${DatasetImportConstants.STAGING_VERSION_SUFFIX}`
  await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [version])
  try {
    await client.query('BEGIN')
    const existing = await client.query<{ id: string }>('SELECT id::text FROM datasets WHERE version = $1 FOR UPDATE', [version])
    if (existing.rows[0] && !replace) throw new Error(`Dataset version ${version} already exists; pass --replace to rebuild it`)
    await client.query('DELETE FROM datasets WHERE version = $1', [stagingVersion])
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO datasets (version, source_archive, kingdom_filter, status)
      VALUES ($1, $2, $3, 'importing')
      RETURNING id::text
    `, [stagingVersion, sourceArchive, kingdomFilter])
    await client.query('COMMIT')
    return {
      id: inserted.rows[0]!.id,
      targetVersion: version,
      stagingVersion,
      replace,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    await releaseDatasetImportLock(client, version).catch(() => {})
    throw error
  }
}

export async function finalizeDatasetImport(client: PoolClient, handle: DatasetImportHandle) {
  let committed = false
  await client.query('BEGIN')
  try {
    const existing = await client.query<{ id: string }>(
      'SELECT id::text FROM datasets WHERE version = $1 FOR UPDATE',
      [handle.targetVersion],
    )
    if (existing.rows[0] && !handle.replace) {
      throw new Error(`Dataset version ${handle.targetVersion} already exists; pass --replace to rebuild it`)
    }
    if (existing.rows[0]) {
      const retiredVersion = `${handle.targetVersion}${DatasetImportConstants.RETIRED_VERSION_SEPARATOR}${existing.rows[0].id}`
      await client.query(`
        UPDATE datasets
        SET version = $2, status = 'retired', retired_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [existing.rows[0].id, retiredVersion])
    }
    await publishDatasetTaxonomy(client, handle.id)
    const promoted = await client.query<{ id: string }>(`
      UPDATE datasets
      SET version = $2, updated_at = NOW()
      WHERE id = $1 AND version = $3 AND status = 'ready' AND plottable_count > 0
      RETURNING id::text
    `, [handle.id, handle.targetVersion, handle.stagingVersion])
    if (!promoted.rows[0]) throw new Error(`Staged dataset ${handle.targetVersion} is not ready or has no plottable records`)
    await client.query('COMMIT')
    committed = true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    if (committed) await releaseDatasetImportLock(client, handle.targetVersion).catch(() => {})
  }
}

export async function abortDatasetImport(client: PoolClient, handle: DatasetImportHandle) {
  try {
    await client.query('DELETE FROM datasets WHERE id = $1 AND version = $2', [handle.id, handle.stagingVersion])
  } finally {
    await releaseDatasetImportLock(client, handle.targetVersion).catch(() => {})
  }
}

export async function upsertSpecies(client: PoolClient, records: readonly SpeciesImportRecord[]) {
  const unique = [...new Map(records.map(record => [record.speciesKey, record])).values()]
  if (unique.length === 0) return
  const columns = 10
  const values = unique.flatMap(record => [
    record.speciesKey,
    record.scientificName,
    record.acceptedScientificName || null,
    record.kingdom || null,
    record.phylum || null,
    record.className || null,
    record.orderName || null,
    record.family || null,
    record.genus || null,
    record.taxonRank || null,
  ])
  await client.query(`
    INSERT INTO species (
      species_key, scientific_name, accepted_scientific_name, kingdom, phylum,
      class_name, order_name, family, genus, taxon_rank
    ) VALUES ${valueGroups(unique.length, columns)}
    ON CONFLICT (species_key) DO NOTHING
  `, values)
}

export async function upsertOccurrences(client: PoolClient, datasetId: string, records: readonly OccurrenceImportRecord[]) {
  if (records.length === 0) return 0
  const columns = 32
  const values = records.flatMap(record => [
    datasetId,
    record.gbifId,
    record.occurrenceId || null,
    record.speciesKey,
    record.scientificName,
    record.datasetKey,
    record.datasetName || null,
    record.countryCode || null,
    record.continent || null,
    record.stateProvince || null,
    record.county || null,
    record.municipality || null,
    record.locality || null,
    record.latitude,
    record.longitude,
    record.coordinateUncertaintyMeters,
    record.coordinatePrecision,
    record.eventDate || null,
    record.eventYear,
    record.basisOfRecord || null,
    record.occurrenceStatus || null,
    record.license || null,
    record.referencesUrl || null,
    record.rightsHolder || null,
    record.h3[2],
    record.h3[3],
    record.h3[4],
    record.h3[5],
    record.h3[6],
    record.h3[7],
    record.h3[8],
    JSON.stringify(record.rawData),
  ])
  const result = await client.query(`
    INSERT INTO occurrences (
      dataset_id, gbif_id, occurrence_id, species_key, scientific_name,
      dataset_key, dataset_name, country_code, continent, state_province,
      county, municipality, locality, decimal_latitude, decimal_longitude,
      coordinate_uncertainty_meters, coordinate_precision, event_date, event_year,
      basis_of_record, occurrence_status, license, references_url, rights_holder,
      h3_r2, h3_r3, h3_r4, h3_r5, h3_r6, h3_r7, h3_r8, raw_data
    )
    SELECT
      incoming.dataset_id::bigint, incoming.gbif_id::bigint, incoming.occurrence_id,
      incoming.species_key::bigint, incoming.scientific_name,
      incoming.dataset_key::uuid, incoming.dataset_name, incoming.country_code,
      incoming.continent, incoming.state_province, incoming.county, incoming.municipality,
      incoming.locality, incoming.decimal_latitude::double precision,
      incoming.decimal_longitude::double precision,
      incoming.coordinate_uncertainty_meters::double precision,
      incoming.coordinate_precision::double precision, incoming.event_date,
      incoming.event_year::integer, incoming.basis_of_record, incoming.occurrence_status,
      incoming.license, incoming.references_url, incoming.rights_holder,
      incoming.h3_r2, incoming.h3_r3, incoming.h3_r4, incoming.h3_r5,
      incoming.h3_r6, incoming.h3_r7, incoming.h3_r8,
      incoming.raw_data::jsonb
    FROM (VALUES ${valueGroups(records.length, columns)}) AS incoming(
      dataset_id, gbif_id, occurrence_id, species_key, scientific_name,
      dataset_key, dataset_name, country_code, continent, state_province,
      county, municipality, locality, decimal_latitude, decimal_longitude,
      coordinate_uncertainty_meters, coordinate_precision, event_date, event_year,
      basis_of_record, occurrence_status, license, references_url, rights_holder,
      h3_r2, h3_r3, h3_r4, h3_r5, h3_r6, h3_r7, h3_r8, raw_data
    )
    ON CONFLICT (dataset_id, gbif_id) DO NOTHING
  `, values)
  return result.rowCount ?? 0
}

export async function insertMedia(client: PoolClient, datasetId: string, records: readonly MediaImportRecord[]) {
  if (records.length === 0) return 0
  const columns = 15
  const values = records.flatMap(record => [
    datasetId,
    record.gbifId,
    record.mediaType || null,
    record.format || null,
    record.identifier,
    record.sourceUrl || null,
    record.referencesUrl || null,
    record.title || null,
    record.description || null,
    record.created || null,
    record.creator || null,
    record.contributor || null,
    record.publisher || null,
    record.license || null,
    record.rightsHolder || null,
  ])
  const result = await client.query(`
    INSERT INTO media (
      dataset_id, occurrence_gbif_id, media_type, format, identifier,
      source_url, references_url, title, description, created, creator,
      contributor, publisher, license, rights_holder
    )
    SELECT
      incoming.dataset_id::bigint, incoming.occurrence_gbif_id::bigint,
      incoming.media_type, incoming.format, incoming.identifier,
      incoming.source_url, incoming.references_url, incoming.title,
      incoming.description, incoming.created, incoming.creator,
      incoming.contributor, incoming.publisher, incoming.license,
      incoming.rights_holder
    FROM (VALUES ${valueGroups(records.length, columns)}) AS incoming(
      dataset_id, occurrence_gbif_id, media_type, format, identifier,
      source_url, references_url, title, description, created, creator,
      contributor, publisher, license, rights_holder
    )
    JOIN occurrences o
      ON o.dataset_id = incoming.dataset_id::bigint
     AND o.gbif_id = incoming.occurrence_gbif_id::bigint
    ON CONFLICT (dataset_id, occurrence_gbif_id, identifier) DO NOTHING
  `, values)
  return result.rowCount ?? 0
}
