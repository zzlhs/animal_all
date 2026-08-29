import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'
import type { AppConfig } from '../config/env.js'

export interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>
}

export interface DatabaseTransactionClient extends DatabaseClient {
  release(): void
}

interface ConnectableDatabase {
  connect(): Promise<DatabaseTransactionClient>
}

function isConnectableDatabase(database: DatabaseClient): database is DatabaseClient & ConnectableDatabase {
  return typeof (database as DatabaseClient & Partial<ConnectableDatabase>).connect === 'function'
}

export async function withReadSnapshot<Result>(
  database: DatabaseClient,
  operation: (client: DatabaseClient) => Promise<Result>,
) {
  if (!isConnectableDatabase(database)) return operation(database)
  const client = await database.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionStarted = true
    const result = await operation(client)
    await client.query('COMMIT')
    transactionStarted = false
    return result
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function createPool(config: AppConfig) {
  const poolConfig: PoolConfig = {
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
  }
  if (config.databaseSsl) poolConfig.ssl = { rejectUnauthorized: false }
  return new Pool(poolConfig)
}
