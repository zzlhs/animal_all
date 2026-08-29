import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { ObjectStorageConstants } from '../config/api.constants.js'
import { loadObjectStorageConfig } from '../config/env.js'
import { MapBuildConstants } from './map-build.constants.js'
import { verifyLocalPmtiles, verifyRemotePmtiles } from './verify-pmtiles.js'

function cliValue(name: string, fallback: string) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function publicUrl(baseUrl: string, objectKey: string) {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}` : ''
}

export function validateObjectKey(rawKey: string) {
  const objectKey = rawKey.replace(/^\/+/, '')
  if (!objectKey) throw new Error('--key is required; use an immutable versioned object name')
  if (!objectKey.toLowerCase().endsWith('.pmtiles')) throw new Error('--key must end with .pmtiles')
  return objectKey
}

async function uploadPmtiles() {
  const config = loadObjectStorageConfig()
  if (!config.objectStorageBucket) throw new Error('OBJECT_STORAGE_BUCKET is required')
  if (!config.objectStorageAccessKeyId || !config.objectStorageSecretAccessKey) {
    throw new Error('OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY are required')
  }
  const inputPath = resolve(cliValue('--input', MapBuildConstants.DEFAULT_PMTILES_OUTPUT))
  const objectKey = validateObjectKey(cliValue('--key', ''))
  const inputStat = await stat(inputPath)
  if (!inputStat.isFile()) throw new Error(`${inputPath} is not a file`)
  await verifyLocalPmtiles(inputPath)

  const client = new S3Client({
    region: config.objectStorageRegion,
    ...(config.objectStorageEndpoint ? { endpoint: config.objectStorageEndpoint } : {}),
    forcePathStyle: config.objectStorageForcePathStyle,
    credentials: {
      accessKeyId: config.objectStorageAccessKeyId,
      secretAccessKey: config.objectStorageSecretAccessKey,
    },
  })
  const upload = new Upload({
    client,
    queueSize: ObjectStorageConstants.MULTIPART_QUEUE_SIZE,
    partSize: ObjectStorageConstants.MULTIPART_PART_SIZE_BYTES,
    leavePartsOnError: false,
    params: {
      Bucket: config.objectStorageBucket,
      Key: objectKey,
      Body: createReadStream(inputPath),
      ContentLength: inputStat.size,
      ContentType: ObjectStorageConstants.PMTILES_CONTENT_TYPE,
      CacheControl: ObjectStorageConstants.IMMUTABLE_CACHE_CONTROL,
      Metadata: { source: basename(inputPath) },
    },
  })
  let lastPercent = -1
  upload.on('httpUploadProgress', progress => {
    const percent = progress.total ? Math.floor(((progress.loaded || 0) / progress.total) * 100) : 0
    if (percent >= lastPercent + 10 || percent === 100) {
      lastPercent = percent
      console.log(`PMTiles upload: ${percent}%`)
    }
  })
  await upload.done()

  const head = await client.send(new HeadObjectCommand({ Bucket: config.objectStorageBucket, Key: objectKey }))
  if (Number(head.ContentLength) !== inputStat.size) {
    throw new Error(`Uploaded object size mismatch: expected ${inputStat.size}, received ${head.ContentLength ?? 'unknown'}`)
  }
  const url = publicUrl(config.objectStoragePublicBaseUrl, objectKey)
  console.log(`Uploaded ${inputPath} to s3://${config.objectStorageBucket}/${objectKey}`)
  if (url) {
    console.log(`Public PMTiles URL: ${url}`)
    const verification = await verifyRemotePmtiles(url, config.objectStorageVerifyOrigin)
    console.log(`Verified public Range response: ${verification.contentRange}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  uploadPmtiles().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
