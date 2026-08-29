import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { latLngToCell } from 'h3-js'
import { MapDataConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import { createPool } from '../db/pool.js'
import type { MediaImportRecord, OccurrenceImportRecord } from '../import/dwca-records.js'
import {
  abortDatasetImport,
  beginDatasetImport,
  finalizeDatasetImport,
  insertMedia,
  type DatasetImportHandle,
  upsertOccurrences,
  upsertSpecies,
} from '../import/import-repository.js'
import { rebuildAggregates } from '../import/rebuild-aggregates.js'

interface SampleMedia {
  type?: string
  format?: string
  identifier?: string
  source?: string
  references?: string
  title?: string
  description?: string
  created?: string
  creator?: string
  contributor?: string
  publisher?: string
  license?: string
  rightsHolder?: string
}

interface SampleRecord {
  gbifID: string
  occurrenceID?: string
  datasetKey?: string
  datasetName?: string
  scientificName: string
  vernacularName?: string
  kingdom?: string
  phylum?: string
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
  taxonRank?: string
  countryCode?: string
  country?: string
  continent?: string
  stateProvince?: string
  county?: string
  municipality?: string
  locality?: string
  latitude?: number | null
  longitude?: number | null
  coordinateUncertaintyInMeters?: number | null
  coordinatePrecision?: number | null
  eventDate?: string
  year?: number | null
  basisOfRecord?: string
  occurrenceStatus?: string
  license?: string
  references?: string
  rightsHolder?: string
  media?: SampleMedia[]
}

interface SampleFile {
  records: SampleRecord[]
}

function cliValue(name: string, fallback: string) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function speciesKeyFor(record: SampleRecord) {
  const value = record.species || record.scientificName
  return BigInt(`0x${createHash('sha256').update(value).digest('hex').slice(0, 15)}`).toString()
}

function validCoordinates(record: SampleRecord): record is SampleRecord & { latitude: number; longitude: number } {
  return Number.isFinite(record.latitude) && Number.isFinite(record.longitude)
    && record.latitude! >= -90 && record.latitude! <= 90
    && record.longitude! >= -180 && record.longitude! <= 180
}

function occurrenceFromSample(record: SampleRecord): OccurrenceImportRecord {
  const hasCoordinates = validCoordinates(record)
  const speciesKey = speciesKeyFor(record)
  const h3 = Object.fromEntries(MapDataConstants.SUPPORTED_H3_RESOLUTIONS.map(resolution => [
    resolution,
    hasCoordinates ? latLngToCell(record.latitude, record.longitude, resolution) : null,
  ]))
  const speciesName = record.species || record.scientificName
  return {
    gbifId: record.gbifID,
    occurrenceId: record.occurrenceID || '',
    speciesKey,
    scientificName: record.scientificName,
    datasetKey: record.datasetKey || null,
    datasetName: record.datasetName || '',
    countryCode: record.countryCode || '',
    continent: record.continent || '',
    stateProvince: record.stateProvince || '',
    county: record.county || '',
    municipality: record.municipality || '',
    locality: record.locality || '',
    latitude: hasCoordinates ? record.latitude : null,
    longitude: hasCoordinates ? record.longitude : null,
    coordinateUncertaintyMeters: record.coordinateUncertaintyInMeters ?? null,
    coordinatePrecision: record.coordinatePrecision ?? null,
    eventDate: record.eventDate || '',
    eventYear: record.year ?? null,
    basisOfRecord: record.basisOfRecord || '',
    occurrenceStatus: record.occurrenceStatus || '',
    license: record.license || '',
    referencesUrl: record.references || '',
    rightsHolder: record.rightsHolder || '',
    h3,
    rawData: {
      vernacularName: record.vernacularName || '',
      country: record.country || '',
      kingdom: record.kingdom || '',
      phylum: record.phylum || '',
      className: record.class || '',
      orderName: record.order || '',
      family: record.family || '',
      genus: record.genus || '',
      speciesName,
      taxonRank: record.taxonRank || '',
    },
    species: {
      speciesKey,
      scientificName: speciesName,
      acceptedScientificName: '',
      kingdom: record.kingdom || '',
      phylum: record.phylum || '',
      className: record.class || '',
      orderName: record.order || '',
      family: record.family || '',
      genus: record.genus || '',
      taxonRank: record.taxonRank || '',
    },
  }
}

function mediaFromSample(record: SampleRecord): MediaImportRecord[] {
  return (record.media || []).flatMap(item => {
    const identifier = item.identifier || item.references || item.source
    if (!identifier) return []
    return [{
      gbifId: record.gbifID,
      mediaType: item.type || '',
      format: item.format || '',
      identifier,
      sourceUrl: item.source || '',
      referencesUrl: item.references || '',
      title: item.title || '',
      description: item.description || '',
      created: item.created || '',
      creator: item.creator || '',
      contributor: item.contributor || '',
      publisher: item.publisher || '',
      license: item.license || '',
      rightsHolder: item.rightsHolder || '',
    }]
  })
}

async function importSample() {
  const config = loadConfig()
  const defaultInput = fileURLToPath(new URL('../../../frontend/public/data/occurrences.json', import.meta.url))
  const inputPath = resolve(cliValue('--input', defaultInput))
  const version = cliValue('--version', 'sample-115')
  const replace = process.argv.includes('--replace')
  const payload = JSON.parse(await readFile(inputPath, 'utf8')) as SampleFile
  const sampleRecords = payload.records
  const pool = createPool(config)
  const client = await pool.connect()
  let datasetImport: DatasetImportHandle | null = null
  try {
    datasetImport = await beginDatasetImport(client, version, basename(inputPath), config.importKingdom, replace)
    const datasetId = datasetImport.id
    for (let offset = 0; offset < sampleRecords.length; offset += config.importBatchSize) {
      const sourceBatch = sampleRecords.slice(offset, offset + config.importBatchSize)
      const occurrenceBatch = sourceBatch.map(occurrenceFromSample)
      await client.query('BEGIN')
      try {
        await upsertSpecies(client, occurrenceBatch.map(record => record.species!))
        await upsertOccurrences(client, datasetId, occurrenceBatch)
        await insertMedia(client, datasetId, sourceBatch.flatMap(mediaFromSample))
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    await client.query(
      'UPDATE datasets SET import_stats = $2::jsonb, updated_at = NOW() WHERE id = $1',
      [datasetId, JSON.stringify({ sampleRecords: sampleRecords.length })],
    )
    await rebuildAggregates(client, datasetId, config.h3BaseResolution)
    await finalizeDatasetImport(client, datasetImport)
    datasetImport = null
    console.log(`Seeded ${sampleRecords.length} sample records as dataset ${version}`)
  } catch (error) {
    if (datasetImport) await abortDatasetImport(client, datasetImport).catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importSample().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
