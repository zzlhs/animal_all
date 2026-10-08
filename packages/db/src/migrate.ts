import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import { getPool, withTransaction } from './pool.js'

const ADVISORY_LOCK_ID = 74291

export async function runMigrations(
  migrationsDir?: string,
  pool: pg.Pool = getPool(),
): Promise<string[]> {
  const dir = migrationsDir || fileURLToPath(new URL('../migrations/', import.meta.url))
  const executedFiles: string[] = []

  const client = await pool.connect()
  try {
    // Acquire session-level advisory lock
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID])

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')
    const existing = new Set(rows.map(r => r.name))

    const files = (await readdir(dir))
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b))

    for (const file of files) {
      if (existing.has(file)) continue

      console.info(`Applying database migration: ${file}`)
      const sql = await readFile(join(dir, file), 'utf8')

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        executedFiles.push(file)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Failed applying migration ${file}: ${(err as Error).message}`)
      }
    }

    return executedFiles
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID])
    } catch {
      // ignore unlock error on connection drop
    }
    client.release()
  }
}

// Allow direct CLI execution: tsx src/migrate.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(executed => {
      console.log(`Migrations complete. Executed ${executed.length} new migration(s).`)
      process.exit(0)
    })
    .catch(err => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
