import './run.mjs'
import pg from 'pg'
import { spawn } from 'node:child_process'

// Use a separate temporary database; this never runs migrations on the active dataset.
const name = `gbif_audio_${Date.now()}_test`
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let created = false
try {
  await admin.query(`CREATE DATABASE ${name}`); created = true
  const url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`
  const setup = new pg.Pool({ connectionString: url.href })
  try { await setup.query('CREATE EXTENSION IF NOT EXISTS postgis') } finally { await setup.end() }
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'packages/db/src/audioQueue.integration.test.ts', 'packages/db/src/database.integration.test.ts'],
      { env: { ...process.env, TEST_DATABASE_URL: url.href }, stdio: 'inherit' })
    child.once('error', reject); child.once('exit', resolve)
  })
  if (status !== 0) process.exitCode = 1
} finally {
  if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  await admin.end()
}
