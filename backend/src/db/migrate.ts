import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { loadConfig, type AppConfig } from '../config/env.js'
import { createPool } from './pool.js'

const MIGRATION_SEPARATOR = '-- statement-breakpoint'

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function runMigrations(config: AppConfig = loadConfig()) {
  const pool = createPool(config)
  const client = await pool.connect()
  const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../migrations')

  try {
    await ensureMigrationTable(client)
    const files = (await readdir(migrationDirectory)).filter(file => file.endsWith('.sql')).sort()
    const appliedResult = await client.query<{ name: string }>('SELECT name FROM schema_migrations')
    const applied = new Set(appliedResult.rows.map(row => row.name))

    for (const file of files) {
      if (applied.has(file)) continue
      const source = await readFile(join(migrationDirectory, file), 'utf8')
      const statements = source.split(MIGRATION_SEPARATOR).map(statement => statement.trim()).filter(Boolean)
      await client.query('BEGIN')
      try {
        for (const statement of statements) await client.query(statement)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Applied migration ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
