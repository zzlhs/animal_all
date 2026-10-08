import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ReleaseService } from '@gbif-globe/domain'
import { FeatureSchemaConstants } from '@gbif-globe/contracts'
import { verifyLocalPmtiles, verifyRemotePmtiles } from './map/verify-pmtiles.js'

const manifestSchema = z.object({
  datasetRevision: z.string().uuid(),
  pmtilesUrl: z.string().url().refine(url => new URL(url).protocol === 'https:' || new URL(url).hostname === '127.0.0.1', 'HTTPS is required outside local verification'),
  localPath: z.string().min(1),
  sourceLayer: z.string().min(1),
  featureSchemaVersion: z.literal(FeatureSchemaConstants.CURRENT_FEATURE_SCHEMA_VERSION),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive(),
  verifyOrigin: z.string().url(),
  sampleTiles: z.array(z.object({ z: z.number().int().min(0).max(18), x: z.number().int().nonnegative(), y: z.number().int().nonnegative() })).min(1),
})
export interface PublishCliOptions { manifestPath: string; dryRun?: boolean }

export async function validateRelease(manifestPath: string) {
  const data = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const localPath = resolve(dirname(manifestPath), data.localPath)
  await verifyLocalPmtiles(localPath)
  const info = await stat(localPath)
  if (info.size !== data.size) throw new Error('Local PMTiles size does not match manifest')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(localPath)) hash.update(chunk)
  if (hash.digest('hex') !== data.sha256) throw new Error('Local PMTiles SHA-256 does not match manifest')
  const head = await fetch(data.pmtilesUrl, { method: 'HEAD', signal: AbortSignal.timeout(12000) })
  if (!head.ok || Number(head.headers.get('content-length')) !== data.size) throw new Error('Remote PMTiles HEAD size mismatch')
  const ranged = await verifyRemotePmtiles(data.pmtilesUrl, data.verifyOrigin)
  if (!ranged.contentRange.endsWith(`/${data.size}`)) throw new Error('Remote PMTiles Range size mismatch')
  // Stream the remote object once at publication time to prove it is the verified local artifact.
  const remote = await fetch(data.pmtilesUrl, { signal: AbortSignal.timeout(300000), headers: { 'Accept-Encoding': 'identity' } })
  if (!remote.ok || !remote.body) throw new Error('Remote PMTiles download failed')
  let bytes = 0
  const remoteHash = createHash('sha256')
  for await (const chunk of remote.body) {
    bytes += chunk.byteLength
    if (bytes > data.size) throw new Error('Remote object exceeds declared size')
    remoteHash.update(chunk)
  }
  if (bytes !== data.size || remoteHash.digest('hex') !== data.sha256) throw new Error('Remote PMTiles content does not match verified artifact')
  const { PMTiles } = await import('pmtiles')
  const { VectorTile } = await import('@mapbox/vector-tile')
  const { default: Pbf } = await import('pbf')
  const archive = new PMTiles(data.pmtilesUrl)
  for (const tile of data.sampleTiles) {
    if (tile.x >= 2 ** tile.z || tile.y >= 2 ** tile.z) throw new Error('Invalid sample tile coordinates')
    const result = await archive.getZxy(tile.z, tile.x, tile.y)
    if (!result) throw new Error('Sample tile missing')
    const layer = new VectorTile(new Pbf(new Uint8Array(result.data))).layers[data.sourceLayer]
    if (!layer?.length) throw new Error('Sample tile source layer is missing or empty')
    for (let i = 0; i < layer.length; i++) {
      const properties = layer.feature(i).properties
      if (properties.dataset_revision !== data.datasetRevision || Number(properties.feature_schema_version) !== data.featureSchemaVersion) throw new Error('Tile revision/schema does not match release')
    }
  }
  return data
}
export async function runPublish(options: PublishCliOptions) {
  const manifest = await validateRelease(resolve(options.manifestPath))
  if (options.dryRun) { console.info('Verified release. Dry run: active release unchanged.'); return }
  const release = await new ReleaseService().publishRelease({
    datasetRevision: manifest.datasetRevision, pmtilesUrl: manifest.pmtilesUrl, sourceLayer: manifest.sourceLayer,
    featureSchemaVersion: manifest.featureSchemaVersion, objectSha256: manifest.sha256, objectSizeBytes: manifest.size,
    manifest, validatedAt: new Date(),
  })
  console.info(`Published release ${release.id}. Retain this ID for rollback.`)
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const manifestIndex = args.indexOf('--manifest')
  const manifestPath = args.find(arg => arg.startsWith('--manifest='))?.slice('--manifest='.length) || (manifestIndex >= 0 ? args[manifestIndex + 1] : undefined)
  if (!manifestPath || manifestPath.startsWith('--')) { console.error('A --manifest path is required'); process.exitCode = 1 }
  else runPublish({ manifestPath, dryRun: args.includes('--dry-run') }).then(() => process.exit(0)).catch(error => { console.error('Publication failed', error); process.exit(1) })
}
