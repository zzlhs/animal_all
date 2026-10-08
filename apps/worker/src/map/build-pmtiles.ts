import { spawn } from 'node:child_process'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMapBuildConfig } from '../config/env.js'
import { MapBuildConstants } from './map-build.constants.js'
import { verifyLocalPmtiles } from './verify-pmtiles.js'

function cliValue(name: string, fallback: string) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function run(binary: string, argumentsList: readonly string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(binary, argumentsList, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(new Error(`${binary} exited with status ${code ?? 'unknown'}`)))
  })
}

async function buildPmtiles() {
  const config = loadMapBuildConfig()
  const inputPath = resolve(cliValue('--input', MapBuildConstants.DEFAULT_GEOJSON_OUTPUT))
  const outputPath = resolve(cliValue('--output', MapBuildConstants.DEFAULT_PMTILES_OUTPUT))
  const mbtilesPath = `${outputPath}${MapBuildConstants.TEMP_MBTILES_SUFFIX}`
  const temporaryOutputPath = `${outputPath}.building`
  await mkdir(dirname(outputPath), { recursive: true })

  try {
    await rm(temporaryOutputPath, { force: true })
    await run(MapBuildConstants.TIPPECANOE_BINARY, [
      '--force',
      '--read-parallel',
      '--no-feature-limit',
      '--no-tile-size-limit',
      `--minimum-zoom=${MapBuildConstants.MIN_ZOOM}`,
      `--maximum-zoom=${MapBuildConstants.MAX_ZOOM}`,
      `--layer=${config.pmtilesSourceLayer}`,
      `--output=${mbtilesPath}`,
      inputPath,
    ])
    await run(MapBuildConstants.PMTILES_BINARY, ['convert', mbtilesPath, temporaryOutputPath])
    await verifyLocalPmtiles(temporaryOutputPath)
    await rename(temporaryOutputPath, outputPath)
    console.log(`Built ${outputPath}`)
  } finally {
    await rm(mbtilesPath, { force: true })
    await rm(temporaryOutputPath, { force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildPmtiles().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
