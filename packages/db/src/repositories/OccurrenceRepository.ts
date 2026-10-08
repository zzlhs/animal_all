import type pg from 'pg'
import type { OccurrenceRecord, OccurrenceMediaItem, CellSpeciesItem } from '@gbif-globe/contracts'
import { detectMediaKind, imageVariantPath } from '@gbif-globe/media'

export interface ListCellOccurrencesOptions {
  datasetId: string
  resolution: number
  cellId: string
  speciesKey?: string
  unknownSpecies?: boolean
  filter?: 'all' | 'Aves' | 'Insecta' | 'audio'
  lastId?: string
  limit?: number
}

export interface ListCoordinateOccurrencesOptions {
  datasetId: string
  latitude: number
  longitude: number
  speciesKey?: string
  filter?: 'all' | 'Aves' | 'Insecta' | 'audio'
  lastId?: string
  limit?: number
}

export interface ListCellSpeciesOptions {
  datasetId: string
  resolution: number
  cellId: string
  filter?: 'all' | 'Aves' | 'Insecta' | 'audio'
  lastSpeciesKey?: string
  limit?: number
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
  COALESCE(o.class_name_snapshot, NULLIF(o.raw_data->>'className', ''), s.class_name) AS class_name,
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

export class OccurrenceRepository {
  async listSmallMap(client: pg.PoolClient | pg.Pool, datasetId: string, limit: number): Promise<OccurrenceRecord[]> {
    const { rows } = await client.query(`SELECT ${OCCURRENCE_FIELDS} FROM occurrences o
      LEFT JOIN species s ON s.species_key = o.species_key
      WHERE o.dataset_id = $1::bigint AND o.geom IS NOT NULL
      ORDER BY (o.raw_data->>'sampleOrder')::integer NULLS LAST, o.gbif_id LIMIT $2`, [datasetId, limit])
    const media = await this.batchLoadMedia(client, datasetId, rows.map(r => r.gbif_id))
    return rows.map(r => this.mapRowToRecord(r, media.get(r.gbif_id) || []))
  }
  async findByGbifId(
    client: pg.PoolClient | pg.Pool,
    datasetId: string,
    gbifId: string,
  ): Promise<OccurrenceRecord | null> {
    const query = `
      SELECT ${OCCURRENCE_FIELDS}
      FROM occurrences o
      LEFT JOIN species s ON s.species_key = o.species_key
      WHERE o.dataset_id = $1::bigint AND o.gbif_id = $2::bigint
      LIMIT 1
    `
    const { rows } = await client.query(query, [datasetId, gbifId])
    if (rows.length === 0) return null

    const mediaMap = await this.batchLoadMedia(client, datasetId, [gbifId])
    return this.mapRowToRecord(rows[0], mediaMap.get(gbifId) || [])
  }

  async findByIds(client: pg.PoolClient | pg.Pool, datasetId: string, ids: string[]): Promise<OccurrenceRecord[]> {
    if (!ids.length) return []
    const { rows } = await client.query(`SELECT ${OCCURRENCE_FIELDS} FROM occurrences o
      LEFT JOIN species s ON s.species_key=o.species_key WHERE o.dataset_id=$1 AND o.gbif_id=ANY($2::bigint[])`, [datasetId, ids])
    const media = await this.batchLoadMedia(client, datasetId, ids)
    return rows.map(row => this.mapRowToRecord(row, media.get(row.gbif_id) || []))
  }

  private cellColumn(resolution: number) {
    const columns: Record<number, string> = { 2: 'h3_r2', 3: 'h3_r3', 4: 'h3_r4', 5: 'h3_r5', 6: 'h3_r6', 7: 'h3_r7', 8: 'h3_r8' }
    if (!columns[resolution]) throw new Error('Invalid resolution')
    return columns[resolution]
  }

  private filters(conditions: string[], values: unknown[], filter?: string, speciesKey?: string, unknownSpecies = false) {
    if (speciesKey) { values.push(speciesKey); conditions.push(`o.species_key = $${values.length}::bigint`) }
    if (unknownSpecies) conditions.push('o.species_key IS NULL')
    if (filter === 'Aves' || filter === 'Insecta') {
      values.push(filter)
      conditions.push(`COALESCE(NULLIF(o.class_name_snapshot, ''), NULLIF(o.raw_data->>'className', ''), s.class_name) = $${values.length}`)
    } else if (filter === 'audio') conditions.push('o.has_audio')
  }

  private async page(client: pg.PoolClient | pg.Pool, datasetId: string, conditions: string[], values: unknown[], limit: number, lastId?: string, aggregateTotal?: number) {
    const where = conditions.join(' AND ')
    const total = aggregateTotal ?? Number((await client.query(`SELECT COUNT(*) AS count FROM occurrences o LEFT JOIN species s ON s.species_key = o.species_key WHERE ${where}`, values)).rows[0].count)
    const pageValues = [...values]
    const after = lastId ? `AND o.gbif_id > $${pageValues.push(lastId)}::bigint` : ''
    const { rows } = await client.query(`SELECT ${OCCURRENCE_FIELDS} FROM occurrences o
      LEFT JOIN species s ON s.species_key = o.species_key WHERE ${where} ${after}
      ORDER BY o.gbif_id LIMIT $${pageValues.push(limit + 1)}`, pageValues)
    const hasMore = rows.length > limit
    const pageRows = rows.slice(0, limit)
    const media = await this.batchLoadMedia(client, datasetId, pageRows.map(r => r.gbif_id))
    return { items: pageRows.map(r => this.mapRowToRecord(r, media.get(r.gbif_id) || [])), hasMore, total }
  }

  async listCellOccurrences(client: pg.PoolClient | pg.Pool, options: ListCellOccurrencesOptions) {
    const { datasetId, resolution, cellId, speciesKey, unknownSpecies, filter, lastId, limit = 20 } = options
    const conditions = ['o.dataset_id = $1::bigint', `o.${this.cellColumn(resolution)} = $2`]
    const values: unknown[] = [datasetId, cellId]
    this.filters(conditions, values, filter, speciesKey, unknownSpecies)
    let total: number | undefined
    if (!speciesKey && !unknownSpecies) {
      const countColumns: Record<string, string> = { all: 'occurrence_count', Aves: 'aves_count', Insecta: 'insecta_count', audio: 'audio_occurrence_count' }
      const column = countColumns[filter ?? 'all']
      if (!column) throw new Error('Invalid filter')
      const result = await client.query(`SELECT ${column} AS count FROM map_cells WHERE dataset_id = $1 AND resolution = $2 AND cell_id = $3`, [datasetId, resolution, cellId])
      if (result.rows[0]) total = Number(result.rows[0].count)
    } else if (speciesKey && (!filter || filter === 'all')) {
      const result = await client.query('SELECT occurrence_count AS count FROM species_cells WHERE dataset_id = $1 AND resolution = $2 AND cell_id = $3 AND species_key = $4', [datasetId, resolution, cellId, speciesKey])
      if (result.rows[0]) total = Number(result.rows[0].count)
    }
    return this.page(client, datasetId, conditions, values, limit, lastId, total)
  }

  async listCoordinateOccurrences(client: pg.PoolClient | pg.Pool, options: ListCoordinateOccurrencesOptions) {
    const { datasetId, latitude, longitude, filter, speciesKey, limit = 20, lastId } = options
    const conditions = ['o.dataset_id = $1::bigint', 'o.decimal_latitude = $2', 'o.decimal_longitude = $3']
    const values: unknown[] = [datasetId, latitude, longitude]
    this.filters(conditions, values, filter, speciesKey)
    return this.page(client, datasetId, conditions, values, limit, lastId)
  }

  async listCellSpecies(client: pg.PoolClient | pg.Pool, options: ListCellSpeciesOptions) {
    const { datasetId, resolution, cellId, filter, lastSpeciesKey, limit = 20 } = options
    const values: unknown[] = [datasetId, cellId]
    let source: string
    if (resolution === 8 && (!filter || filter === 'all')) {
      source = `SELECT sc.species_key, o.scientific_name, o.raw_data->>'vernacularName' AS vernacular_name,
        sc.occurrence_count, sc.audio_occurrence_count > 0 AS has_audio, sc.representative_occurrence_id AS sample_gbif_id
        FROM species_cells sc JOIN occurrences o ON o.dataset_id = sc.dataset_id AND o.gbif_id = sc.representative_occurrence_id
        WHERE sc.dataset_id = $1 AND sc.cell_id = $2 AND sc.resolution = 8`
    } else {
      const conditions = ['o.dataset_id = $1', `o.${this.cellColumn(resolution)} = $2`, 'o.species_key IS NOT NULL']
      this.filters(conditions, values, filter)
      source = `SELECT o.species_key, MAX(o.scientific_name) AS scientific_name,
        MAX(o.raw_data->>'vernacularName') AS vernacular_name, COUNT(*) AS occurrence_count,
        BOOL_OR(o.has_audio) AS has_audio, MIN(o.gbif_id) AS sample_gbif_id
        FROM occurrences o LEFT JOIN species s ON s.species_key = o.species_key
        WHERE ${conditions.join(' AND ')} GROUP BY o.species_key`
    }
    const total = Number((await client.query(`SELECT COUNT(*) AS count FROM (${source}) grouped`, values)).rows[0].count)
    const after = lastSpeciesKey ? `WHERE grouped.species_key > $${values.push(lastSpeciesKey)}::bigint` : ''
    const { rows } = await client.query(`SELECT grouped.*, species_key::text AS species_key, sample_gbif_id::text AS sample_gbif_id
      FROM (${source}) grouped ${after} ORDER BY grouped.species_key LIMIT $${values.push(limit + 1)}`, values)
    return { items: rows.slice(0, limit).map(r => ({ speciesKey: r.species_key, scientificName: r.scientific_name,
      vernacularName: r.vernacular_name, occurrenceCount: Number(r.occurrence_count), hasAudio: r.has_audio,
      sampleGbifId: r.sample_gbif_id })), hasMore: rows.length > limit, total }
  }

  async batchLoadMedia(
    client: pg.PoolClient | pg.Pool,
    datasetId: string,
    gbifIds: string[],
  ): Promise<Map<string, OccurrenceMediaItem[]>> {
    const map = new Map<string, OccurrenceMediaItem[]>()
    if (gbifIds.length === 0) return map

    for (const id of gbifIds) map.set(id, [])

    const sql = `
      SELECT
        id::text,
        occurrence_gbif_id::text,
        media_type,
        format,
        identifier,
        source_url,
        references_url,
        title,
        license,
        creator,
        imagekit_url
      FROM media
      WHERE dataset_id = $1::bigint
        AND occurrence_gbif_id = ANY($2::bigint[])
      ORDER BY id ASC
    `

    const { rows } = await client.query(sql, [datasetId, gbifIds])
    for (const r of rows) {
      const items = map.get(r.occurrence_gbif_id)
      if (items) {
        const kind = detectMediaKind(r.format, r.identifier)
        items.push({
          id: r.id,
          kind,
          url: r.imagekit_url || r.identifier,
          thumbnailUrl: kind === 'image' ? imageVariantPath(r.id, 'pin') : null,
          previewUrl: kind === 'image' ? imageVariantPath(r.id, 'preview') : null,
          sourceUrl: r.source_url,
          referencesUrl: r.references_url,
          format: r.format,
          license: r.license,
          creator: r.creator,
          title: r.title,
        })
      }
    }

    return map
  }

  private mapRowToRecord(row: Record<string, any>, media: OccurrenceMediaItem[]): OccurrenceRecord {
    return {
      gbifId: row.gbif_id,
      datasetKey: row.dataset_key,
      scientificName: row.scientific_name,
      vernacularName: row.vernacular_name,
      taxonRank: row.taxon_rank,
      kingdom: row.kingdom,
      phylum: row.phylum,
      class: row.class_name,
      order: row.order_name,
      family: row.family,
      genus: row.genus,
      species: row.species_name,
      speciesKey: row.species_key,
      decimalLatitude: Number(row.latitude),
      decimalLongitude: Number(row.longitude),
      coordinateUncertaintyInMeters: row.coordinate_uncertainty_meters == null ? null : Number(row.coordinate_uncertainty_meters),
      countryCode: row.country_code,
      country: row.country_name,
      stateProvince: row.state_province,
      locality: row.locality,
      eventDate: row.event_date,
      year: row.event_year,
      basisOfRecord: row.basis_of_record,
      media,
    }
  }
}
