import { fileURLToPath } from 'node:url'
import type { QueryResultRow } from 'pg'
import { DatasetMaintenanceConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import type { DatabaseClient } from './pool.js'
import { createPool } from './pool.js'

interface PrunedDatasetRow extends QueryResultRow {
  version: string
}

function positiveCliInteger(name: string, fallback: number, maximum: number) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  const index = process.argv.indexOf(name)
  const rawValue = inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined)
  const value = rawValue == null ? fallback : Number(rawValue)
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

export async function pruneRetiredDatasets(database: DatabaseClient, olderThanDays: number, limit: number) {
  return database.query<PrunedDatasetRow>(`
    WITH candidates AS (
      SELECT id
      FROM datasets
      WHERE status = 'retired'
        AND retired_at < NOW() - make_interval(days => $1)
      ORDER BY retired_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT $2
    )
    DELETE FROM datasets d
    USING candidates
    WHERE d.id = candidates.id
    RETURNING d.version
  `, [olderThanDays, limit])
}

async function runFromCli() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('Refusing to delete retired datasets without --confirm')
  }
  const olderThanDays = positiveCliInteger(
    '--older-than-days',
    DatasetMaintenanceConstants.DEFAULT_RETIRED_RETENTION_DAYS,
    DatasetMaintenanceConstants.MAX_RETIRED_RETENTION_DAYS,
  )
  const limit = positiveCliInteger(
    '--limit',
    DatasetMaintenanceConstants.DEFAULT_PRUNE_LIMIT,
    DatasetMaintenanceConstants.MAX_PRUNE_LIMIT,
  )
  const pool = createPool(loadConfig())
  try {
    const result = await pruneRetiredDatasets(pool, olderThanDays, limit)
    console.log(`Deleted ${result.rowCount ?? 0} retired dataset versions`)
  } finally {
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFromCli().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
