<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import occurrences from '../public/data/occurrences.json'
import { boundsFor, clusterOccurrences } from './map/clustering.js'
import ClusterPin from './components/ClusterPin.vue'
import FilterPanel from './components/FilterPanel.vue'
import MapControls from './components/MapControls.vue'
import MapProvider from './components/MapProvider.vue'
import OccurrenceCard from './components/OccurrenceCard.vue'
import OccurrenceList from './components/OccurrenceList.vue'
import PhotoPin from './components/PhotoPin.vue'
import ScalableOccurrenceLayer from './components/ScalableOccurrenceLayer.vue'
import { recordMedia } from './composables/useOccurrenceMedia.js'
import { DataApiConstants, MapViewConstants } from './config/data.constants.js'
import { runtimeConfig, usesScalableData } from './config/runtime.js'
import { normalizeLanguage, translate } from './i18n.js'
import { occurrenceApi } from './services/occurrenceApi.js'

const allRecords = occurrences.records.filter(record => record.hasCoordinates)
const dataBounds = boundsFor(allRecords)
const sampleInitialCenter = [
  (dataBounds[0][0] + dataBounds[1][0]) / 2,
  (dataBounds[0][1] + dataBounds[1][1]) / 2,
]
const initialCenter = usesScalableData ? MapViewConstants.SCALABLE_CENTER : sampleInitialCenter
const initialZoom = usesScalableData ? MapViewConstants.SCALABLE_ZOOM : MapViewConstants.SAMPLE_ZOOM

const map = ref(null)
const zoom = ref(initialZoom)
const theme = ref(localStorage.getItem('photo-globe-theme') || 'dark')
const language = ref(normalizeLanguage(localStorage.getItem('photo-globe-language')))
const filterOpen = ref(false)
const activeFilter = ref('all')
const selectedRecord = ref(null)
const selectedCluster = ref(null)
const cardPosition = ref({ left: 16, top: 16 })
const listPosition = ref({ left: 16, top: 16 })
const dataMeta = ref(null)
const pmtilesUrl = ref(runtimeConfig.pmtilesUrl)
const pmtilesSourceLayer = ref(runtimeConfig.pmtilesSourceLayer)
const loadingMore = ref(false)
const scalableLayerVersion = ref(0)
const scalableLayerReady = ref(false)
const dataState = ref(usesScalableData ? 'loading' : 'ready')
const requestState = ref('idle')
const dataErrorKey = ref('')
let retryDataAction = null
const HOVER_CLOSE_DELAY = 220
let hoverCloseTimer = null
let scalableHoverTimer = null
let scalableRequestController = null
let scalableRequestSequence = 0
const featureCache = new Map()

const scalableLayerCanMount = computed(() => (
  usesScalableData && Boolean(dataMeta.value && pmtilesUrl.value)
))

const visibleRecords = computed(() => {
  if (activeFilter.value === 'all') return allRecords
  if (activeFilter.value === 'Animalia') return allRecords.filter(record => record.kingdom === 'Animalia')
  if (activeFilter.value === 'audio') return allRecords.filter(record => recordMedia(record).some(item => item.kind === 'audio'))
  return allRecords.filter(record => record.class === activeFilter.value)
})

const clusters = computed(() => usesScalableData ? [] : clusterOccurrences(visibleRecords.value, zoom.value))
const displayCount = computed(() => {
  if (!usesScalableData) return visibleRecords.value.length
  if (activeFilter.value === 'all') return Number(dataMeta.value?.dataset?.plottableCount || 0)
  return Number(dataMeta.value?.dataset?.filterCounts?.[activeFilter.value]
    ?? dataMeta.value?.dataset?.plottableCount
    ?? 0)
})

function fitRecords(records, options = {}) {
  if (!map.value || !records.length) return
  const bounds = boundsFor(records)
  if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
    map.value.easeTo({ center: bounds[0], zoom: Math.min(map.value.getZoom() + 2, 14), duration: 850 })
    return
  }
  map.value.fitBounds(bounds, { padding: 72, duration: 900, maxZoom: 11, ...options })
}

function onMapLoad(instance) {
  map.value = instance
  if (!usesScalableData) fitRecords(allRecords, { duration: 0, maxZoom: MapViewConstants.SAMPLE_ZOOM })
}

function updateCardPosition() {
  if (!map.value || !selectedRecord.value) return
  const point = map.value.project([selectedRecord.value.longitude, selectedRecord.value.latitude])
  const cardWidth = 320
  const richMedia = recordMedia(selectedRecord.value).some(item => item.kind === 'audio' || item.kind === 'video')
  const cardHeight = recordMedia(selectedRecord.value).some(item => item.kind === 'video')
    ? 456
    : richMedia ? 366 : 274
  cardPosition.value = {
    left: Math.max(12, Math.min(window.innerWidth - cardWidth - 12, point.x - cardWidth / 2)),
    top: Math.max(12, Math.min(window.innerHeight - cardHeight - 12, point.y - cardHeight - 30)),
  }
}

function updateListPosition() {
  if (!map.value || !selectedCluster.value) return
  const point = map.value.project(selectedCluster.value.coordinates)
  const listWidth = 336
  const listHeight = Math.min(486, window.innerHeight - 32)
  const gap = 24
  let left = point.x + gap
  let top = point.y - listHeight / 2

  if (left + listWidth > window.innerWidth - 16) left = point.x - listWidth - gap
  listPosition.value = {
    left: Math.max(12, Math.min(window.innerWidth - listWidth - 12, left)),
    top: Math.max(12, Math.min(window.innerHeight - listHeight - 12, top)),
  }
}

function updateOverlayPositions() {
  updateCardPosition()
  updateListPosition()
}

function keepHoverContentOpen() {
  if (hoverCloseTimer === null) return
  window.clearTimeout(hoverCloseTimer)
  hoverCloseTimer = null
}

function scheduleHoverContentClose() {
  keepHoverContentOpen()
  hoverCloseTimer = window.setTimeout(() => {
    hoverCloseTimer = null
    selectedRecord.value = null
    selectedCluster.value = null
  }, HOVER_CLOSE_DELAY)
}

function clearScalableHoverTimer() {
  if (scalableHoverTimer === null) return
  window.clearTimeout(scalableHoverTimer)
  scalableHoverTimer = null
}

function openRecordOnHover(record) {
  keepHoverContentOpen()
  selectRecord(record)
}

function openClusterOnHover(cluster) {
  keepHoverContentOpen()
  openClusterList(cluster)
}

function selectRecord(record) {
  selectedCluster.value = null
  selectedRecord.value = record
  nextTick(updateCardPosition)
}

function openClusterList(cluster) {
  selectedRecord.value = null
  selectedCluster.value = cluster
  nextTick(updateListPosition)
}

function featureKey(feature) {
  return [
    activeFilter.value,
    feature.datasetVersion,
    feature.datasetRevision,
    feature.kind,
    feature.resolution,
    feature.cellId,
    feature.exactLatitude || '',
    feature.exactLongitude || '',
    feature.speciesKey || '',
  ].join(':')
}

function scalableApiFilter() {
  return ['Aves', 'Insecta', 'audio'].includes(activeFilter.value) ? activeFilter.value : undefined
}

function cacheFeaturePayload(key, payload) {
  if (featureCache.size >= DataApiConstants.MAX_HOVER_CACHE_ENTRIES) {
    featureCache.delete(featureCache.keys().next().value)
  }
  featureCache.set(key, payload)
}

function applyFeaturePayload(feature, payload) {
  if (payload.type === 'record') {
    selectRecord(payload.record)
    return
  }
  openClusterList({
    ...feature,
    key: featureKey(feature),
    records: payload.page.items,
    total: payload.page.total,
    nextCursor: payload.page.nextCursor,
    queryFilter: scalableApiFilter(),
  })
}

async function requestFeaturePayload(feature, signal) {
  const queryFilter = scalableApiFilter()
  if (feature.occurrenceCount <= 1 && feature.representativeOccurrenceId && !queryFilter) {
    return {
      type: 'record',
      record: await occurrenceApi.getOccurrence(feature.representativeOccurrenceId, { signal }),
    }
  }
  const page = await listScalableFeatureOccurrences(feature, {
    limit: DataApiConstants.DEFAULT_LIST_LIMIT,
    speciesKey: feature.kind === 'species' ? feature.speciesKey : undefined,
    filter: queryFilter,
    signal,
  })
  if (page.total === 1 && page.items[0]) return { type: 'record', record: page.items[0] }
  return { type: 'list', page }
}

function listScalableFeatureOccurrences(feature, options) {
  if (feature.kind === 'coordinate' && feature.exactLatitude != null && feature.exactLongitude != null) {
    return occurrenceApi.listCoordinateOccurrences(feature.exactLatitude, feature.exactLongitude, options)
  }
  return occurrenceApi.listCellOccurrences(feature.resolution, feature.cellId, options)
}

async function openScalableFeature(feature) {
  if (!feature.datasetVersion || !feature.datasetRevision
    || feature.datasetVersion !== dataMeta.value?.dataset?.version
    || feature.datasetRevision !== dataMeta.value?.dataset?.revision) {
    requestState.value = 'error'
    dataErrorKey.value = 'data.versionMismatch'
    retryDataAction = reloadScalableData
    return
  }
  const key = featureKey(feature)
  const cached = featureCache.get(key)
  if (cached) {
    applyFeaturePayload(feature, cached)
    return
  }
  scalableRequestController?.abort()
  scalableRequestController = new AbortController()
  const sequence = ++scalableRequestSequence
  requestState.value = 'loading'
  dataErrorKey.value = ''
  try {
    const payload = await requestFeaturePayload(feature, scalableRequestController.signal)
    if (sequence !== scalableRequestSequence) return
    cacheFeaturePayload(key, payload)
    applyFeaturePayload(feature, payload)
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Unable to load occurrence data', error)
      requestState.value = 'error'
      dataErrorKey.value = 'data.featureError'
      retryDataAction = () => openScalableFeature(feature)
    }
  } finally {
    if (sequence === scalableRequestSequence && requestState.value !== 'error') requestState.value = 'idle'
  }
}

function openScalableFeatureOnHover(feature) {
  keepHoverContentOpen()
  clearScalableHoverTimer()
  scalableHoverTimer = window.setTimeout(() => {
    scalableHoverTimer = null
    void openScalableFeature(feature)
  }, DataApiConstants.HOVER_FETCH_DELAY_MILLISECONDS)
}

function leaveScalableFeature() {
  clearScalableHoverTimer()
  scalableRequestController?.abort()
  scalableRequestSequence += 1
  requestState.value = 'idle'
  scheduleHoverContentClose()
}

function selectScalableFeature(feature) {
  keepHoverContentOpen()
  clearScalableHoverTimer()
  void openScalableFeature(feature)
}

async function loadMoreClusterRecords() {
  const cluster = selectedCluster.value
  if (!cluster?.nextCursor || loadingMore.value) return
  loadingMore.value = true
  requestState.value = 'loading'
  dataErrorKey.value = ''
  try {
    const page = await listScalableFeatureOccurrences(cluster, {
      limit: DataApiConstants.DEFAULT_LIST_LIMIT,
      cursor: cluster.nextCursor,
      speciesKey: cluster.kind === 'species' ? cluster.speciesKey : undefined,
      filter: cluster.queryFilter,
    })
    if (selectedCluster.value?.key !== cluster.key) return
    const knownIds = new Set(cluster.records.map(record => record.gbifID))
    selectedCluster.value = {
      ...cluster,
      records: [...cluster.records, ...page.items.filter(record => !knownIds.has(record.gbifID))],
      total: page.total,
      nextCursor: page.nextCursor,
    }
    nextTick(updateListPosition)
  } catch (error) {
    console.error('Unable to load more occurrence data', error)
    requestState.value = 'error'
    dataErrorKey.value = 'data.listError'
    retryDataAction = loadMoreClusterRecords
  } finally {
    loadingMore.value = false
    if (requestState.value !== 'error') requestState.value = 'idle'
  }
}

async function loadScalableMeta() {
  dataState.value = 'loading'
  dataErrorKey.value = ''
  try {
    dataMeta.value = await occurrenceApi.getMeta()
    pmtilesUrl.value = runtimeConfig.pmtilesUrl || dataMeta.value.map?.pmtilesUrl || ''
    if (dataMeta.value.map?.sourceLayer) pmtilesSourceLayer.value = dataMeta.value.map.sourceLayer
    if (!pmtilesUrl.value) throw new Error('No PMTiles URL was configured')
    if (scalableLayerReady.value) dataState.value = 'ready'
  } catch (error) {
    console.error('Unable to load scalable dataset metadata', error)
    dataState.value = 'error'
    dataErrorKey.value = 'data.errorBody'
    retryDataAction = loadScalableMeta
  }
}

async function reloadScalableData() {
  scalableRequestController?.abort()
  scalableRequestSequence += 1
  featureCache.clear()
  selectedRecord.value = null
  selectedCluster.value = null
  scalableLayerReady.value = false
  dataMeta.value = null
  scalableLayerVersion.value += 1
  await nextTick()
  await loadScalableMeta()
}

function markScalableLayerReady() {
  scalableLayerReady.value = true
  if (dataMeta.value) dataState.value = 'ready'
}

function markScalableLayerError(error) {
  console.error('Unable to load PMTiles map layer', error)
  dataState.value = 'error'
  dataErrorKey.value = 'data.errorBody'
  retryDataAction = reloadScalableData
}

function retryDataRequest() {
  const action = retryDataAction
  retryDataAction = null
  requestState.value = 'idle'
  dataErrorKey.value = ''
  if (action) void action()
}

function resetView() {
  keepHoverContentOpen()
  selectedRecord.value = null
  selectedCluster.value = null
  if (usesScalableData) {
    map.value?.easeTo({
      center: initialCenter,
      zoom: initialZoom,
      bearing: 0,
      pitch: 0,
      duration: MapViewConstants.RESET_DURATION_MILLISECONDS,
    })
    return
  }
  fitRecords(allRecords, { maxZoom: MapViewConstants.SAMPLE_ZOOM })
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('photo-globe-theme', theme.value)
}

function toggleLanguage() {
  language.value = language.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('photo-globe-language', language.value)
}

function selectFilter(value) {
  keepHoverContentOpen()
  clearScalableHoverTimer()
  scalableRequestController?.abort()
  scalableRequestSequence += 1
  requestState.value = 'idle'
  dataErrorKey.value = ''
  activeFilter.value = value
  selectedRecord.value = null
  selectedCluster.value = null
  if (!usesScalableData) nextTick(() => fitRecords(visibleRecords.value, { maxZoom: 4.6 }))
}

function closePanels(event) {
  if (!event.target.closest('.control-top-right') && !event.target.closest('.filter-panel')) filterOpen.value = false
}

watch(selectedRecord, updateCardPosition)
watch(selectedCluster, updateListPosition)
onMounted(() => {
  window.addEventListener('pointerdown', closePanels)
  if (usesScalableData) void loadScalableMeta()
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', closePanels)
  keepHoverContentOpen()
  clearScalableHoverTimer()
  scalableRequestController?.abort()
})
</script>

<template>
  <main class="photo-globe-page" :class="`theme-${theme}`">
    <MapProvider
      :center="initialCenter"
      :zoom="initialZoom"
      :theme="theme"
      :language="language"
      @load="onMapLoad"
      @zoom="zoom = $event"
      @move="updateOverlayPositions"
    >
      <ScalableOccurrenceLayer
        v-if="scalableLayerCanMount"
        :key="scalableLayerVersion"
        :pmtiles-url="pmtilesUrl"
        :source-layer="pmtilesSourceLayer"
        :active-filter="activeFilter"
        @hover-feature="openScalableFeatureOnHover"
        @leave-feature="leaveScalableFeature"
        @select-feature="selectScalableFeature"
        @layer-ready="markScalableLayerReady"
        @layer-error="markScalableLayerError"
      />
      <template v-else-if="!usesScalableData">
        <template v-for="cluster in clusters" :key="cluster.id">
          <ClusterPin
            v-if="cluster.records.length > 1"
            :cluster="cluster"
            :language="language"
            @hover-start="openClusterOnHover"
            @hover-end="scheduleHoverContentClose"
            @expand="openClusterList"
          />
          <PhotoPin
            v-else
            :record="cluster.records[0]"
            :selected="selectedRecord?.gbifID === cluster.records[0].gbifID"
            :language="language"
            @hover-start="openRecordOnHover"
            @hover-end="scheduleHoverContentClose"
            @select="selectRecord"
          />
        </template>
      </template>
    </MapProvider>

    <div
      v-if="usesScalableData && (dataState !== 'ready' || requestState !== 'idle')"
      class="data-status"
      :class="{ 'is-error': dataState === 'error' || requestState === 'error' }"
      role="status"
    >
      <template v-if="dataState === 'error' || requestState === 'error'">
        <strong>{{ translate(language, 'data.errorTitle') }}</strong>
        <span>{{ translate(language, dataErrorKey || 'data.errorBody') }}</span>
        <button type="button" @click="retryDataRequest">{{ translate(language, 'data.retry') }}</button>
      </template>
      <span v-else>{{ translate(language, 'data.loading') }}</span>
    </div>

    <MapControls
      :filter-open="filterOpen"
      :theme="theme"
      :language="language"
      @home="resetView"
      @toggle-filter="filterOpen = !filterOpen"
      @toggle-theme="toggleTheme"
      @toggle-language="toggleLanguage"
      @zoom-in="map?.zoomIn({ duration: 280 })"
      @zoom-out="map?.zoomOut({ duration: 280 })"
      @reset-bearing="map?.easeTo({ bearing: 0, pitch: 0, duration: 500 })"
    />

    <Transition name="panel">
      <FilterPanel
        v-if="filterOpen"
        :active-filter="activeFilter"
        :visible-count="displayCount"
        :language="language"
        @select="selectFilter"
      />
    </Transition>

    <Transition name="card">
      <OccurrenceCard
        v-if="selectedRecord"
        :record="selectedRecord"
        :position="cardPosition"
        :language="language"
        @hover-start="keepHoverContentOpen"
        @hover-end="scheduleHoverContentClose"
      />
    </Transition>

    <Transition name="list">
      <OccurrenceList
        v-if="selectedCluster"
        :records="selectedCluster.records"
        :total="selectedCluster.total || selectedCluster.records.length"
        :has-more="Boolean(selectedCluster.nextCursor)"
        :loading-more="loadingMore"
        :position="listPosition"
        :language="language"
        @hover-start="keepHoverContentOpen"
        @hover-end="scheduleHoverContentClose"
        @select="selectRecord"
        @load-more="loadMoreClusterRecords"
      />
    </Transition>
  </main>
</template>
