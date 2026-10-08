import type { FilterType } from './constants.js'

export type MediaKind = 'image' | 'audio' | 'video'

export interface OccurrenceMediaItem {
  id: string
  kind: MediaKind
  url: string
  thumbnailUrl?: string | null
  previewUrl?: string | null
  sourceUrl?: string | null
  referencesUrl?: string | null
  format?: string | null
  license?: string | null
  creator?: string | null
  title?: string | null
}

export interface OccurrenceRecord {
  gbifId: string
  datasetKey?: string
  scientificName: string
  vernacularName?: string | null
  taxonRank?: string | null
  kingdom?: string | null
  phylum?: string | null
  class?: string | null
  order?: string | null
  family?: string | null
  genus?: string | null
  species?: string | null
  speciesKey?: string | null
  decimalLatitude: number
  decimalLongitude: number
  coordinateUncertaintyInMeters?: number | null
  countryCode?: string | null
  country?: string | null
  stateProvince?: string | null
  locality?: string | null
  eventDate?: string | null
  year?: number | null
  basisOfRecord?: string | null
  media: OccurrenceMediaItem[]
}

export interface PageResult<T> {
  datasetRevision: string
  items: T[]
  total: number | null
  totalAccuracy: 'exact' | 'unavailable'
  nextCursor: string | null
}

export interface CellSpeciesItem {
  speciesKey: string
  scientificName: string
  vernacularName?: string | null
  occurrenceCount: number
  hasAudio: boolean
  sampleGbifId: string
  thumbnailUrl?: string | null
}

export interface DatasetMeta {
  version: string
  revision: string
  occurrenceCount: number
  plottableCount: number
  filterCounts: Record<FilterType | string, number>
  mapCamera?: { center: [number, number]; zoom: number }
}

export interface MapReleaseMeta {
  releaseId: string
  featureSchemaVersion: number
  pmtilesUrl: string
  sourceLayer: string
  maxZoom: number
}

export interface MetaResponse {
  dataset: DatasetMeta
  map: MapReleaseMeta
}

export type MapFeatureKind = 'cluster' | 'species' | 'coordinate' | 'unclassified'

export interface MapFeatureProperties {
  feature_schema_version: number
  dataset_version: string
  dataset_revision: string
  kind: MapFeatureKind
  resolution: number
  cell_id: string
  representative_occurrence_id: string
  species_key?: string
  exact_latitude?: string
  exact_longitude?: string
  occurrence_count: number
  species_count: number
  aves_count?: number
  insecta_count?: number
  audio_occurrence_count: number
  image_count: number
  audio_count: number
  video_count: number
}

export interface AmbientTrack {
  id: string
  title: string
  subtitle: string
  scientificName?: string
  vernacularName?: string
  sourceUrl: string
  thumbnailUrl?: string
  license?: string
  creator?: string
  gbifId?: string
}

export interface CursorPayload {
  v: number
  revision: string
  scopeHash: string
  order: string
  lastId: string
}

export type AudioPlaybackStatus = 'idle' | 'preparing' | 'buffering' | 'playing' | 'paused' | 'failed' | 'ended'
export type AudioJobStatus = 'queued' | 'downloading' | 'uploading' | 'ready' | 'failed'
export interface AudioJob {
  id: string
  status: AudioJobStatus
  priority: number
  attempts: number
  receivedBytes: number
  totalBytes: number | null
  storedBytes: number
  playbackUrl: string | null
  errorCode: string | null
  errorMessage: string | null
  nextAttemptAt: string | null
  createdAt: string
  updatedAt: string
}
export interface AudioQueueSnapshot {
  configured: boolean
  workerMode: 'embedded' | 'external'
  workerActive: boolean
  totals: { total: number; ready: number; queued: number; downloading: number; uploading: number; failed: number; storedBytes: number }
  jobs: (AudioJob & { mediaId: string; gbifId: string; scientificName: string; sourceHost: string })[]
}
