import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { ImportConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import { createPool } from '../db/pool.js'
import { describeDwcaArchive, readDwcaRows } from './dwca-reader.js'
import { parseMediaRow, parseOccurrenceRow, type MediaImportRecord, type OccurrenceImportRecord } from './dwca-records.js'
import {
  abortDatasetImport,
  beginDatasetImport,
  finalizeDatasetImport,
  insertMedia,
  type DatasetImportHandle,
  upsertOccurrences,
  upsertSpecies,
} from './import-repository.js'
import { rebuildAggregates } from './rebuild-aggregates.js'

interface CliOptions {
  archivePath: string
  version: string
  replace: boolean
}

function parseCliOptions(activeVersion: string): CliOptions {
  const argumentsByName = new Map<string, string>()
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!
    if (!argument.startsWith('--')) continue
    const [name, inlineValue] = argument.split('=', 2) as [string, string | undefined]
    const value = inlineValue ?? process.argv[index + 1]
    if (value && !value.startsWith('--') && inlineValue == null) index += 1
    argumentsByName.set(name, value?.startsWith('--') ? '' : value ?? '')
  }
  const archivePath = argumentsByName.get('--archive')
  if (!archivePath) throw new Error('Usage: npm run dwca:import -- --archive /path/archive.zip [--version name] [--replace]')
  return {
    archivePath: resolve(archivePath),
    version: argumentsByName.get('--version') || activeVersion,
    replace: argumentsByName.has('--replace'),
  }
}

async function flushOccurrences(client: PoolClient, datasetId: string, batch: OccurrenceImportRecord[]) {
  if (batch.length === 0) return 0
  await client.query('BEGIN')
  try {
    await upsertSpecies(client, batch.flatMap(record => record.species ? [record.species] : []))
    const inserted = await upsertOccurrences(client, datasetId, batch)
    await client.query('COMMIT')
    batch.length = 0
    return inserted
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function flushMedia(client: PoolClient, datasetId: string, batch: MediaImportRecord[]) {
  if (batch.length === 0) return 0
  await client.query('BEGIN')
  try {
    const inserted = await insertMedia(client, datasetId, batch)
    await client.query('COMMIT')
    batch.length = 0
    return inserted
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function importDwca() {
  const config = loadConfig()
  const options = parseCliOptions(config.activeDatasetVersion)
  const pool = createPool(config)
  const client = await pool.connect()
  let datasetImport: DatasetImportHandle | null = null

  try {
    const archive = await describeDwcaArchive(options.archivePath)
    console.log(`DWCA layout: ${archive.usesMetaXml ? 'meta.xml' : 'header fallback'}; occurrence=${archive.occurrence.entryNames.join(',')}; media=${archive.media?.entryNames.join(',') || 'none'}`)
    datasetImport = await beginDatasetImport(client, options.version, basename(options.archivePath), config.importKingdom, options.replace)
    const datasetId = datasetImport.id
    const occurrenceBatch: OccurrenceImportRecord[] = []
    let scannedOccurrences = 0
    let selectedOccurrences = 0
    let importedOccurrences = 0

    for await (const { row, columns } of readDwcaRows(options.archivePath, archive.occurrence)) {
      scannedOccurrences += 1
      const occurrence = parseOccurrenceRow(row, columns, config.importKingdom)
      if (occurrence) {
        occurrenceBatch.push(occurrence)
        selectedOccurrences += 1
      }
      if (occurrenceBatch.length >= config.importBatchSize) {
        importedOccurrences += await flushOccurrences(client, datasetId, occurrenceBatch)
      }
      if (scannedOccurrences % ImportConstants.PROGRESS_INTERVAL === 0) {
        console.log(`Occurrences scanned: ${scannedOccurrences.toLocaleString()}, selected: ${selectedOccurrences.toLocaleString()}, inserted: ${importedOccurrences.toLocaleString()}`)
      }
    }
    importedOccurrences += await flushOccurrences(client, datasetId, occurrenceBatch)

    const mediaBatch: MediaImportRecord[] = []
    let scannedMedia = 0
    let importedMedia = 0
    if (archive.media) {
      for await (const { row, columns } of readDwcaRows(options.archivePath, archive.media)) {
        scannedMedia += 1
        const media = parseMediaRow(row, columns)
        if (media) mediaBatch.push(media)
        if (mediaBatch.length >= config.importBatchSize) importedMedia += await flushMedia(client, datasetId, mediaBatch)
        if (scannedMedia % ImportConstants.PROGRESS_INTERVAL === 0) {
          console.log(`Media scanned: ${scannedMedia.toLocaleString()}, linked: ${importedMedia.toLocaleString()}`)
        }
      }
    }
    importedMedia += await flushMedia(client, datasetId, mediaBatch)

    await client.query('UPDATE datasets SET import_stats = $2::jsonb, updated_at = NOW() WHERE id = $1', [
      datasetId,
      JSON.stringify({ scannedOccurrences, selectedOccurrences, importedOccurrences, scannedMedia, importedMedia }),
    ])
    await rebuildAggregates(client, datasetId, config.h3BaseResolution)
    await finalizeDatasetImport(client, datasetImport)
    datasetImport = null
    console.log(`Imported dataset ${options.version}: ${importedOccurrences.toLocaleString()} occurrences, ${importedMedia.toLocaleString()} media items`)
  } catch (error) {
    if (datasetImport) await abortDatasetImport(client, datasetImport).catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importDwca().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
