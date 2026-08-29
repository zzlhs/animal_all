import { spawn } from 'node:child_process'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOL_IMAGE = 'gbif-map-tools:2.79.0-1.30.0'
const SOURCE_LAYER = process.env.PMTILES_SOURCE_LAYER || 'gbif_occurrences'
const BACKEND_DIRECTORY = fileURLToPath(new URL('..', import.meta.url))
const PMTILES_HEADER_PREFIX_LENGTH = 8
const PMTILES_MAGIC = 'PMTiles'
const PMTILES_SPEC_VERSION = 3

function cliValue(name, fallback) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function containerPath(localPath) {
  const value = relative(BACKEND_DIRECTORY, resolve(localPath))
  if (!value || value === '..' || value.startsWith(`..${sep}`)) {
    throw new Error('Docker tile input and output must be inside the backend directory')
  }
  return `/work/${value.split(sep).join('/')}`
}

function run(argumentsList) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', argumentsList, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`docker exited with status ${code}`)))
  })
}

async function verifyPmtiles(path) {
  const file = await open(path, 'r')
  try {
    const header = Buffer.alloc(PMTILES_HEADER_PREFIX_LENGTH)
    const result = await file.read(header, 0, header.byteLength, 0)
    if (result.bytesRead !== header.byteLength
      || header.subarray(0, PMTILES_MAGIC.length).toString() !== PMTILES_MAGIC
      || header[7] !== PMTILES_SPEC_VERSION) {
      throw new Error('Docker map build did not produce a PMTiles v3 archive')
    }
  } finally {
    await file.close()
  }
}

const localInput = resolve(cliValue('--input', 'artifacts/gbif-map.ndjson'))
const localOutput = resolve(cliValue('--output', 'artifacts/gbif-map.pmtiles'))
await mkdir(dirname(localOutput), { recursive: true })
const input = containerPath(localInput)
const output = containerPath(localOutput)
const temporary = `${output}.building.mbtiles`
const temporaryOutput = `${output}.building`
const mount = `${BACKEND_DIRECTORY}:/work`
const userArguments = typeof process.getuid === 'function' && typeof process.getgid === 'function'
  ? ['--user', `${process.getuid()}:${process.getgid()}`]
  : []

try {
  await run([
    'run', '--rm', ...userArguments, '--volume', mount, '--workdir', '/work', TOOL_IMAGE,
    'tippecanoe', '--force', '--read-parallel', '--no-feature-limit', '--no-tile-size-limit',
    '--minimum-zoom=0', '--maximum-zoom=18', `--layer=${SOURCE_LAYER}`, `--output=${temporary}`, input,
  ])
  await run(['run', '--rm', ...userArguments, '--volume', mount, '--workdir', '/work', TOOL_IMAGE, 'pmtiles', 'convert', temporary, temporaryOutput])
  const localTemporaryOutput = temporaryOutput.replace('/work/', `${BACKEND_DIRECTORY}/`)
  await verifyPmtiles(localTemporaryOutput)
  await rename(localTemporaryOutput, localOutput)
} finally {
  await rm(temporary.replace('/work/', `${BACKEND_DIRECTORY}/`), { force: true })
  await rm(temporaryOutput.replace('/work/', `${BACKEND_DIRECTORY}/`), { force: true })
}
