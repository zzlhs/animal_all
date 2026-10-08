import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createPool } from '@gbif-globe/db'
import { root, run } from './run.mjs'
import { buildMap } from './build-map.mjs'
const args = process.argv.slice(2)
const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1) || (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const sample = args.includes('--sample')
const archive = value('--archive')
if (sample === Boolean(archive)) throw new Error('Choose --sample OR --archive /absolute/file.zip --version unique-name')
const version = value('--version') || (sample ? 'sample-120-restored' : undefined)
if (!version || !/^[a-zA-Z0-9_.-]+$/.test(version)) throw new Error('Provide a unique --version using letters, numbers, dots, underscores or hyphens')
const webOrigin = (process.env.PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
if (archive && !(await stat(resolve(root, archive))).isFile()) throw new Error('Archive must be a local ZIP file')
const health = await fetch(`${webOrigin}/api/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
if (!health?.ok) throw new Error(`Start the Web service at ${webOrigin} before running data:setup`)
const pool = createPool()
const invoke = (file, params = []) => run(process.execPath, ['--import', 'tsx', resolve(root, file), ...params])
try {
  await run(process.execPath, [process.env.npm_execpath, 'run', 'db:migrate'])
  const current = (await pool.query('SELECT id,revision::text,status FROM datasets WHERE version=$1', [version])).rows[0]
  if (current && !sample) throw new Error('This version already exists; use a new --version to preserve published snapshots')
  if (!current) await invoke(sample ? 'apps/worker/src/seed/import-sample.ts' : 'apps/worker/src/import/import-dwca.ts', sample ? ['--version', version] : ['--archive', resolve(root, archive), '--version', version])
  const dataset = (await pool.query('SELECT revision::text,status,occurrence_count,plottable_count,audio_occurrence_count FROM datasets WHERE version=$1', [version])).rows[0]
  if (dataset.status !== 'ready') throw new Error('Dataset is not ready')
  const folder = resolve(root, 'artifacts', dataset.revision)
  const output = resolve(process.env.MAP_STORAGE_DIR || resolve(root, 'data/maps'), `${dataset.revision}.pmtiles`)
  await mkdir(folder, { recursive: true })
  if (!(await stat(output).catch(() => null))) {
    const features = resolve(folder, 'features.geojsonseq')
    await invoke('apps/worker/src/map/export-map-features.ts', ['--version', version, '--output', features])
    await buildMap(features, output)
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(output)) hash.update(chunk)
  const manifest = { datasetRevision: dataset.revision, pmtilesUrl: `${webOrigin}/api/maps/${dataset.revision}.pmtiles`, localPath: output,
    sourceLayer: process.env.PMTILES_SOURCE_LAYER || 'gbif_occurrences', featureSchemaVersion: 2,
    sha256: hash.digest('hex'), size: (await stat(output)).size, verifyOrigin: webOrigin, sampleTiles: [{ z: 0, x: 0, y: 0 }] }
  const manifestPath = resolve(folder, 'release.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await invoke('apps/worker/src/release-publish.ts', ['--manifest', manifestPath])
  console.info('Dataset imported, map built and published:', { version, ...dataset })
} finally { await pool.end() }
