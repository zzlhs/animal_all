export const ApiConstants = Object.freeze({
  ROUTE_PREFIX: '/api/v1',
  DEFAULT_HOST: '0.0.0.0',
  DEFAULT_PORT: 3100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_RATE_LIMIT_MAX: 300,
  DEFAULT_RATE_LIMIT_WINDOW: '1 minute',
  JSON_CONTENT_TYPE: 'application/json; charset=utf-8',
  AUDIO_PROXY_ROUTE: '/api/audio-proxy',
  DEFAULT_AUDIO_PROXY_HOSTS: 'observation.org,www.observation.org,xeno-canto.org,www.xeno-canto.org',
  AUDIO_CONTENT_TYPE_PATTERN: /^(audio\/|application\/(?:ogg|octet-stream)(?:;|$))/i,
  AUDIO_RESPONSE_HEADERS: ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified'] as const,
  MAX_AUDIO_REDIRECTS: 3,
  AUDIO_REQUEST_TIMEOUT_MILLISECONDS: 12_000,
  MAX_AUDIO_CONTENT_LENGTH_BYTES: 100 * 1024 * 1024,
})

export const MapDataConstants = Object.freeze({
  DEFAULT_SOURCE_LAYER: 'gbif_occurrences',
  SUPPORTED_H3_RESOLUTIONS: [2, 3, 4, 5, 6, 7, 8] as const,
  RESOLUTION_COLUMN_BY_VALUE: Object.freeze({
    2: 'h3_r2',
    3: 'h3_r3',
    4: 'h3_r4',
    5: 'h3_r5',
    6: 'h3_r6',
    7: 'h3_r7',
    8: 'h3_r8',
  }) as Readonly<Record<number, string>>,
  CELL_COUNT_COLUMN_BY_FILTER: Object.freeze({
    all: 'occurrence_count',
    Aves: 'aves_count',
    Insecta: 'insecta_count',
    audio: 'audio_occurrence_count',
  }) as Readonly<Record<string, string>>,
  ZOOM_RANGE_BY_RESOLUTION: Object.freeze({
    2: { min: 0, max: 2 },
    3: { min: 3, max: 4 },
    4: { min: 5, max: 6 },
    5: { min: 7, max: 8 },
    6: { min: 9, max: 10 },
    7: { min: 11, max: 12 },
    8: { min: 13, max: 14 },
  }) as Readonly<Record<number, Readonly<{ min: number; max: number }>>>,
})

export const ImportConstants = Object.freeze({
  OCCURRENCE_ENTRY: 'occurrence.txt',
  MULTIMEDIA_ENTRY: 'multimedia.txt',
  DEFAULT_KINGDOM: 'Animalia',
  DEFAULT_BATCH_SIZE: 500,
  DEFAULT_BASE_H3_RESOLUTION: 8,
  PROGRESS_INTERVAL: 25_000,
  MEDIA_URL_FIELDS: ['identifier', 'references', 'source'] as const,
  MEDIA_URL_PROTOCOLS: ['http:', 'https:'] as const,
})

export const DatasetMaintenanceConstants = Object.freeze({
  DEFAULT_RETIRED_RETENTION_DAYS: 30,
  MAX_RETIRED_RETENTION_DAYS: 3650,
  DEFAULT_PRUNE_LIMIT: 5,
  MAX_PRUNE_LIMIT: 100,
})

export const MediaSyncConstants = Object.freeze({
  DEFAULT_FOLDER: '/gbif-photo-globe',
  DEFAULT_MEDIA_TYPES: 'image,video',
  DEFAULT_CONCURRENCY: 3,
  DEFAULT_BATCH_SIZE: 100,
  DEFAULT_LIMIT: 500,
  DEFAULT_MAX_ATTEMPTS: 5,
  DEFAULT_RETRY_DELAY_SECONDS: 60,
  SUPPORTED_MEDIA_KINDS: ['image', 'audio', 'video'] as const,
  EXTENSION_BY_FORMAT: Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  }) as Readonly<Record<string, string>>,
})

export const ObjectStorageConstants = Object.freeze({
  DEFAULT_REGION: 'auto',
  PMTILES_CONTENT_TYPE: 'application/vnd.pmtiles',
  IMMUTABLE_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  MULTIPART_QUEUE_SIZE: 4,
  MULTIPART_PART_SIZE_BYTES: 8 * 1024 * 1024,
  PMTILES_HEADER_LENGTH_BYTES: 127,
  PMTILES_MAGIC: 'PMTiles',
  PMTILES_SPEC_VERSION: 3,
  VERIFY_TIMEOUT_MILLISECONDS: 15_000,
})
