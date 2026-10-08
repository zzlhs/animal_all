import pg from 'pg'

const { Pool } = pg

export interface DatabaseConfig {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string }
  max?: number
  idleTimeoutMillis?: number
  connectionTimeoutMillis?: number
  statementTimeoutMs?: number
}

let globalPool: pg.Pool | null = null

export function getDatabaseConfig(): DatabaseConfig {
  const connectionString = process.env.DATABASE_URL
  const poolMax = Number(process.env.DATABASE_POOL_MAX || 10)
  const statementTimeout = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 8000)
  const sslEnabled = process.env.DATABASE_SSL === 'true'

  return {
    connectionString,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statementTimeoutMs: statementTimeout,
    ssl: sslEnabled
      ? {
          rejectUnauthorized: process.env.DATABASE_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.DATABASE_CA_CERT,
        }
      : false,
  }
}

export function createPool(customConfig?: Partial<DatabaseConfig>): pg.Pool {
  const config = { ...getDatabaseConfig(), ...customConfig }
  const pool = new Pool({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl,
    statement_timeout: config.statementTimeoutMs,
  })

  pool.on('error', (err: Error) => {
    console.error('Unexpected idle client error in PostgreSQL pool', err)
  })

  return pool
}

export function getPool(): pg.Pool {
  if (!globalPool) {
    globalPool = createPool()
  }
  return globalPool
}

export async function closePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end()
    globalPool = null
  }
}

export async function withReadSnapshot<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  pool: pg.Pool = getPool(),
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
    const result = await fn(client)
    await client.query('COMMIT;')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK;')
    } catch {
      // ignore rollback errors
    }
    throw error
  } finally {
    client.release()
  }
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  pool: pg.Pool = getPool(),
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN;')
    const result = await fn(client)
    await client.query('COMMIT;')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK;')
    } catch {
      // ignore rollback errors
    }
    throw error
  } finally {
    client.release()
  }
}
