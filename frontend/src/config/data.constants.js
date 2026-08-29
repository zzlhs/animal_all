export const DataModeConstants = Object.freeze({
  SAMPLE: 'sample',
  API: 'api',
})

export const DataApiConstants = Object.freeze({
  DEFAULT_BASE_URL: 'http://localhost:3100',
  META_ROUTE: '/api/v1/meta',
  OCCURRENCES_ROUTE: '/api/v1/occurrences',
  CELLS_ROUTE: '/api/v1/cells',
  COORDINATES_ROUTE: '/api/v1/coordinates',
  DEFAULT_LIST_LIMIT: 20,
  HOVER_FETCH_DELAY_MILLISECONDS: 180,
  MAX_HOVER_CACHE_ENTRIES: 250,
})

export const MapViewConstants = Object.freeze({
  SAMPLE_ZOOM: 1.9,
  SCALABLE_ZOOM: 1.65,
  SCALABLE_CENTER: Object.freeze([0, 18]),
  RESET_DURATION_MILLISECONDS: 850,
})

export const MapLayerConstants = Object.freeze({
  SOURCE_ID: 'gbif-scalable-source',
  CLUSTER_LAYER_ID: 'gbif-scalable-clusters',
  CLUSTER_COUNT_LAYER_ID: 'gbif-scalable-cluster-count',
  SPECIES_LAYER_ID: 'gbif-scalable-species',
  PROTOCOL: 'pmtiles',
})

export const MediaUrlConstants = Object.freeze({
  ALLOWED_PROTOCOLS: Object.freeze(['http:', 'https:']),
})
