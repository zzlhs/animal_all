export const DataApiConstants = Object.freeze({
  DEFAULT_LIST_LIMIT: 20,
  MAX_LIST_LIMIT: 100,
  DEFAULT_CURSOR_NAME: 'cursor',
})

export const FilterConstants = Object.freeze({
  ALL: 'all',
  AVES: 'Aves',
  INSECTA: 'Insecta',
  AUDIO: 'audio',
  FILTERS: Object.freeze(['all', 'Aves', 'Insecta', 'audio'] as const),
})

export type FilterType = (typeof FilterConstants.FILTERS)[number]

export const MapViewConstants = Object.freeze({
  MIN_ZOOM: 0,
  MAX_ZOOM: 18,
  SAMPLE_ZOOM: 4.6,
  RESET_DURATION_MILLISECONDS: 800,
  FLY_DURATION_MILLISECONDS: 1000,
})

export const FeatureSchemaConstants = Object.freeze({
  CURRENT_FEATURE_SCHEMA_VERSION: 2,
  SOURCE_LAYER: 'gbif_occurrences',
})

export const AudioProxyConstants = Object.freeze({
  ROUTE: '/api/audio-proxy',
  MAX_REDIRECTS: 3,
  FIRST_RESPONSE_TIMEOUT_MS: 20_000,
  IDLE_TIMEOUT_MS: 30_000,
  TOTAL_TIMEOUT_MS: 10 * 60_000,
  MAX_AUDIO_BYTES: 100 * 1024 * 1024, // 100 MiB
})

export const AudioQueueConstants = Object.freeze({
  ROUTE: '/api/audio/jobs',
  PLAYBACK_PRIORITY: 100,
  DETAIL_PRIORITY: 50,
  CONCURRENCY: 2,
  DETAIL_CONCURRENCY: 1,
  MAX_ENQUEUE: 20,
  SNAPSHOT_LIMIT: 100,
  SNAPSHOT_POLL_MS: 2_000,
  MAX_REQUEST_LENGTH: 4096,
  MAX_SOURCE_URL_LENGTH: 2048,
  MAX_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5_000,
  LEASE_MS: 60_000,
  HEARTBEAT_MS: 10_000,
  POLL_MS: 1_000,
  CLIENT_WAIT_MS: 20 * 60_000,
  API_TIMEOUT_MS: 20_000,
  UPLOAD_TIMEOUT_MS: 120_000,
  DEFAULT_MAX_BYTES: 20 * 1024 * 1024,
  DEFAULT_FOLDER: '/gbif-photo-globe/audios',
  ID_PATTERN: /^\d{1,18}$/,
  CLAIM_LOCK: 74292,
})

export const AudioCacheConstants = Object.freeze({
  DB_NAME: 'gbif-globe-audio-cache',
  STORE_NAME: 'cached-tracks',
  DB_VERSION: 1,
  MAX_TRACKS: 50,
  MAX_TOTAL_BYTES: 100 * 1024 * 1024, // 100 MiB
  MAX_SINGLE_TRACK_BYTES: 10 * 1024 * 1024, // 10 MiB
  TTL_MS: 3 * 24 * 60 * 60 * 1000, // 3 days
})

export const MapInteractionConstants = Object.freeze({
  HOVER_DELAY_MS: 180,
  HOVER_CLOSE_DELAY_MS: 220,
  MAX_RICH_MARKERS: 160,
  MAX_CACHED_TARGETS: 250,
  MAX_LIST_PAGES: 5,
  SOURCE_ID: 'gbif-occurrences',
  LAYER_ID: 'gbif-occurrence-points',
  LABEL_LAYER_ID: 'gbif-occurrence-counts',
})
