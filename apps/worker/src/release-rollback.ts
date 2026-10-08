import { ReleaseService } from '@gbif-globe/domain'
import { bigintIdSchema } from '@gbif-globe/contracts'
import { closePool } from '@gbif-globe/db'
const id = process.argv.find(arg => arg.startsWith('--release-id='))?.slice('--release-id='.length)
try {
  const releaseId = bigintIdSchema.parse(id)
  await new ReleaseService().rollbackRelease(releaseId)
  console.info(`Active release restored to ${releaseId}`)
} catch (error) {
  console.error('Rollback failed', error)
  process.exitCode = 1
} finally { await closePool() }
