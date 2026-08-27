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
import { normalizeLanguage } from './i18n.js'

const allRecords = occurrences.records.filter(record => record.hasCoordinates)
const dataBounds = boundsFor(allRecords)
const initialCenter = [
  (dataBounds[0][0] + dataBounds[1][0]) / 2,
  (dataBounds[0][1] + dataBounds[1][1]) / 2,
]
// Keep the whole globe visible on the initial desktop/mobile view. The
// reference starts at a low globe zoom instead of fitting tightly to the
// occurrence bounding box.
const initialZoom = 1.9

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
const HOVER_CLOSE_DELAY = 220
let hoverCloseTimer = null

const visibleRecords = computed(() => {
  if (activeFilter.value === 'all') return allRecords
  if (activeFilter.value === 'Animalia') return allRecords.filter(record => record.kingdom === 'Animalia')
  return allRecords.filter(record => record.class === activeFilter.value)
})

const clusters = computed(() => clusterOccurrences(visibleRecords.value, zoom.value))

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
  fitRecords(allRecords, { duration: 0, maxZoom: 1.9 })
}

function updateCardPosition() {
  if (!map.value || !selectedRecord.value) return
  const point = map.value.project([selectedRecord.value.longitude, selectedRecord.value.latitude])
  const cardWidth = 320
  const cardHeight = 274
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

function resetView() {
  keepHoverContentOpen()
  selectedRecord.value = null
  selectedCluster.value = null
  fitRecords(allRecords, { maxZoom: 1.9 })
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
  activeFilter.value = value
  selectedRecord.value = null
  selectedCluster.value = null
  nextTick(() => fitRecords(visibleRecords.value, { maxZoom: 4.6 }))
}

function closePanels(event) {
  if (!event.target.closest('.control-top-right') && !event.target.closest('.filter-panel')) filterOpen.value = false
}

watch(selectedRecord, updateCardPosition)
watch(selectedCluster, updateListPosition)
onMounted(() => window.addEventListener('pointerdown', closePanels))
onUnmounted(() => {
  window.removeEventListener('pointerdown', closePanels)
  keepHoverContentOpen()
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
    </MapProvider>

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
        :visible-count="visibleRecords.length"
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
        :position="listPosition"
        :language="language"
        @hover-start="keepHoverContentOpen"
        @hover-end="scheduleHoverContentClose"
        @select="selectRecord"
      />
    </Transition>
  </main>
</template>
