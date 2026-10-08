import 'dotenv/config'
import { z } from 'zod'
import { ApiConstants, ImportConstants, MapDataConstants, MediaSyncConstants, ObjectStorageConstants } from './api.constants.js'

const booleanValue = z.string().default('false').transform(value => value === 'true')
const urlOrEmpty = z.string().url().or(z.literal('')).default('')

const mapConfigurationShape = {
  PMTILES_URL: urlOrEmpty,
  PMTILES_SOURCE_LAYER: z.string().min(1).default(MapDataConstants.DEFAULT_SOURCE_LAYER),
} as const

const objectStorageConfigurationShape = {
  OBJECT_STORAGE_ENDPOINT: urlOrEmpty,
  OBJECT_STORAGE_REGION: z.string().min(1).default(ObjectStorageConstants.DEFAULT_REGION),
  OBJECT_STORAGE_BUCKET: z.string().default(''),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().default(''),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().default(''),
  OBJECT_STORAGE_PUBLIC_BASE_URL: urlOrEmpty,
  OBJECT_STORAGE_VERIFY_ORIGIN: urlOrEmpty,
  OBJECT_STORAGE_FORCE_PATH_STYLE: booleanValue,
} as const

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default(ApiConstants.DEFAULT_HOST),
  PORT: z.coerce.number().int().positive().default(ApiConstants.DEFAULT_PORT),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanValue,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(ApiConstants.DEFAULT_RATE_LIMIT_MAX),
  RATE_LIMIT_WINDOW: z.string().default(ApiConstants.DEFAULT_RATE_LIMIT_WINDOW),
  AUDIO_PROXY_ALLOWED_HOSTS: z.string().default(ApiConstants.DEFAULT_AUDIO_PROXY_HOSTS),
  ACTIVE_DATASET_VERSION: z.string().min(1),
  ...mapConfigurationShape,
  IMAGEKIT_URL_ENDPOINT: urlOrEmpty,
  IMAGEKIT_PRIVATE_KEY: z.string().default(''),
  IMAGEKIT_FOLDER: z.string().min(1).default(MediaSyncConstants.DEFAULT_FOLDER),
  IMAGEKIT_SYNC_MEDIA_TYPES: z.string().default(MediaSyncConstants.DEFAULT_MEDIA_TYPES),
  IMAGEKIT_SYNC_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(MediaSyncConstants.DEFAULT_CONCURRENCY),
  IMAGEKIT_SYNC_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(MediaSyncConstants.DEFAULT_MAX_ATTEMPTS),
  IMAGEKIT_SYNC_RETRY_DELAY_SECONDS: z.coerce.number().int().min(1).max(86_400).default(MediaSyncConstants.DEFAULT_RETRY_DELAY_SECONDS),
  ...objectStorageConfigurationShape,
  IMPORT_KINGDOM: z.string().min(1).default(ImportConstants.DEFAULT_KINGDOM),
  IMPORT_BATCH_SIZE: z.coerce.number().int().min(50).max(2000).default(ImportConstants.DEFAULT_BATCH_SIZE),
  H3_BASE_RESOLUTION: z.coerce.number().int().refine(
    value => MapDataConstants.SUPPORTED_H3_RESOLUTIONS.includes(value as typeof MapDataConstants.SUPPORTED_H3_RESOLUTIONS[number]),
    `H3_BASE_RESOLUTION must be one of ${MapDataConstants.SUPPORTED_H3_RESOLUTIONS.join(', ')}`,
  ).default(ImportConstants.DEFAULT_BASE_H3_RESOLUTION),
})

export type AppConfig = ReturnType<typeof loadConfig>

export function loadMapBuildConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = z.object({ PMTILES_SOURCE_LAYER: mapConfigurationShape.PMTILES_SOURCE_LAYER }).parse(environment)
  return { pmtilesSourceLayer: parsed.PMTILES_SOURCE_LAYER }
}

export function loadPmtilesVerificationConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = z.object({
    PMTILES_URL: mapConfigurationShape.PMTILES_URL,
    OBJECT_STORAGE_VERIFY_ORIGIN: objectStorageConfigurationShape.OBJECT_STORAGE_VERIFY_ORIGIN,
  }).parse(environment)
  return {
    pmtilesUrl: parsed.PMTILES_URL,
    objectStorageVerifyOrigin: parsed.OBJECT_STORAGE_VERIFY_ORIGIN,
  }
}

export function loadObjectStorageConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = z.object(objectStorageConfigurationShape).parse(environment)
  return {
    objectStorageEndpoint: parsed.OBJECT_STORAGE_ENDPOINT,
    objectStorageRegion: parsed.OBJECT_STORAGE_REGION,
    objectStorageBucket: parsed.OBJECT_STORAGE_BUCKET,
    objectStorageAccessKeyId: parsed.OBJECT_STORAGE_ACCESS_KEY_ID,
    objectStorageSecretAccessKey: parsed.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    objectStoragePublicBaseUrl: parsed.OBJECT_STORAGE_PUBLIC_BASE_URL,
    objectStorageVerifyOrigin: parsed.OBJECT_STORAGE_VERIFY_ORIGIN,
    objectStorageForcePathStyle: parsed.OBJECT_STORAGE_FORCE_PATH_STYLE,
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = environmentSchema.parse(environment)
  const imageKitHostname = parsed.IMAGEKIT_URL_ENDPOINT ? new URL(parsed.IMAGEKIT_URL_ENDPOINT).hostname.toLowerCase() : ''
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    databaseSsl: parsed.DATABASE_SSL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitWindow: parsed.RATE_LIMIT_WINDOW,
    audioProxyAllowedHosts: [...new Set([
      ...parsed.AUDIO_PROXY_ALLOWED_HOSTS.split(',').map(host => host.trim().toLowerCase()).filter(Boolean),
      imageKitHostname,
    ].filter(Boolean))],
    activeDatasetVersion: parsed.ACTIVE_DATASET_VERSION,
    pmtilesUrl: parsed.PMTILES_URL,
    pmtilesSourceLayer: parsed.PMTILES_SOURCE_LAYER,
    imageKitUrlEndpoint: parsed.IMAGEKIT_URL_ENDPOINT,
    imageKitPrivateKey: parsed.IMAGEKIT_PRIVATE_KEY,
    imageKitFolder: parsed.IMAGEKIT_FOLDER,
    imageKitSyncMediaTypes: parsed.IMAGEKIT_SYNC_MEDIA_TYPES.split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
    imageKitSyncConcurrency: parsed.IMAGEKIT_SYNC_CONCURRENCY,
    imageKitSyncMaxAttempts: parsed.IMAGEKIT_SYNC_MAX_ATTEMPTS,
    imageKitSyncRetryDelaySeconds: parsed.IMAGEKIT_SYNC_RETRY_DELAY_SECONDS,
    objectStorageEndpoint: parsed.OBJECT_STORAGE_ENDPOINT,
    objectStorageRegion: parsed.OBJECT_STORAGE_REGION,
    objectStorageBucket: parsed.OBJECT_STORAGE_BUCKET,
    objectStorageAccessKeyId: parsed.OBJECT_STORAGE_ACCESS_KEY_ID,
    objectStorageSecretAccessKey: parsed.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    objectStoragePublicBaseUrl: parsed.OBJECT_STORAGE_PUBLIC_BASE_URL,
    objectStorageVerifyOrigin: parsed.OBJECT_STORAGE_VERIFY_ORIGIN,
    objectStorageForcePathStyle: parsed.OBJECT_STORAGE_FORCE_PATH_STYLE,
    importKingdom: parsed.IMPORT_KINGDOM,
    importBatchSize: parsed.IMPORT_BATCH_SIZE,
    h3BaseResolution: parsed.H3_BASE_RESOLUTION,
  }
}
