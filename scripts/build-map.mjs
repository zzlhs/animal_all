import { mkdir, rm, rename } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, run } from './run.mjs'
import { verifyLocalPmtiles } from '../apps/worker/src/map/verify-pmtiles.ts'
export async function buildMap(input, output) {
  await mkdir(dirname(output), { recursive: true })
  const image = 'gbif-globe-tiles:local'
  await run('docker', ['build', '-f', resolve(root, 'infra/Dockerfile.tiles'), '-t', image, root])
  // Mount only required input/output directories; filenames are passed as arguments.
  const common = ['run', '--rm', '-v', `${dirname(input)}:/input:ro`, '-v', `${dirname(output)}:/output`, image]
  const temporary = `${output}.building.mbtiles`
  try {
    await run('docker', [...common, 'tippecanoe', '--force', '--read-parallel', '--no-feature-limit', '--no-tile-size-limit', '--minimum-zoom=0', '--maximum-zoom=18', `--layer=${process.env.PMTILES_SOURCE_LAYER || 'gbif_occurrences'}`, `--output=/output/${basename(temporary)}`, `/input/${basename(input)}`])
    await run('docker', [...common, 'pmtiles', 'convert', `/output/${basename(temporary)}`, `/output/${basename(output)}.building`])
    await verifyLocalPmtiles(`${output}.building`)
    await rename(`${output}.building`, output)
  } finally { await rm(temporary, { force: true }); await rm(`${output}.building`, { force: true }) }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = name => args[args.indexOf(name) + 1]
  if (!args.includes('--input') || !args.includes('--output')) throw new Error('--input and --output are required')
  await buildMap(resolve(root, value('--input')), resolve(root, value('--output')))
}
