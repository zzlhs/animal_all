<script setup>
import { inject, onBeforeUnmount, watch } from 'vue'
import { MapLayerConstants } from '../config/data.constants.js'
import { MapContextKey } from '../map/context.js'

const props = defineProps({
  pmtilesUrl: { type: String, default: '' },
  sourceLayer: { type: String, required: true },
  activeFilter: { type: String, default: 'all' },
})

const emit = defineEmits(['hover-feature', 'leave-feature', 'select-feature', 'layer-ready', 'layer-error'])
const context = inject(MapContextKey)
let installedMap = null
let hoveredFeatureKey = ''
let layerReadyEmitted = false
let protocolModulePromise = null
let protocolRegistration = null

function loadProtocol() {
  protocolModulePromise ||= import('pmtiles')
  return protocolModulePromise
}

function protocolUrl() {
  return props.pmtilesUrl.startsWith(`${MapLayerConstants.PROTOCOL}://`)
    ? props.pmtilesUrl
    : `${MapLayerConstants.PROTOCOL}://${props.pmtilesUrl}`
}

function normalizedFeature(feature) {
  const properties = feature?.properties || {}
  const coordinates = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null
  if (!coordinates) return null
  const clusterCountProperty = selectedClusterCountProperty()
  const occurrenceCount = properties.kind === 'cluster' || properties.kind === 'coordinate'
    ? properties[clusterCountProperty]
    : props.activeFilter === 'audio' ? properties.audio_count : properties.occurrence_count
  return {
    datasetVersion: properties.dataset_version || '',
    datasetRevision: properties.dataset_revision || '',
    kind: properties.kind,
    resolution: Number(properties.resolution),
    cellId: properties.cell_id,
    exactLatitude: properties.exact_latitude || null,
    exactLongitude: properties.exact_longitude || null,
    speciesKey: properties.species_key || null,
    scientificName: properties.scientific_name || '',
    representativeOccurrenceId: properties.representative_occurrence_id,
    occurrenceCount: Number(occurrenceCount || 0),
    speciesCount: Number(properties.species_count || 0),
    imageCount: Number(properties.image_count || 0),
    audioCount: Number(properties.audio_count || 0),
    videoCount: Number(properties.video_count || 0),
    coordinates: [Number(coordinates[0]), Number(coordinates[1])],
  }
}

function selectedClusterCountProperty() {
  if (props.activeFilter === 'Aves') return 'aves_count'
  if (props.activeFilter === 'Insecta') return 'insecta_count'
  if (props.activeFilter === 'audio') return 'audio_occurrence_count'
  return 'occurrence_count'
}

function clusterFilter() {
  const countProperty = selectedClusterCountProperty()
  return ['all', ['match', ['get', 'kind'], ['cluster', 'coordinate'], true, false], ['>', ['get', countProperty], 0]]
}

function clusterRadiusExpression() {
  return ['interpolate', ['linear'], ['ln', ['+', ['get', selectedClusterCountProperty()], 1]], 0, 14, 12, 22]
}

function featureFilter() {
  const detailKinds = ['match', ['get', 'kind'], ['species', 'occurrence'], true, false]
  if (props.activeFilter === 'audio') return ['all', detailKinds, ['>', ['get', 'audio_count'], 0]]
  if (props.activeFilter === 'Aves' || props.activeFilter === 'Insecta') {
    return ['all', detailKinds, ['==', ['get', 'class_name'], props.activeFilter]]
  }
  return detailKinds
}

function applyFilter() {
  if (!installedMap) return
  if (installedMap.getLayer(MapLayerConstants.SPECIES_LAYER_ID)) {
    installedMap.setFilter(MapLayerConstants.SPECIES_LAYER_ID, featureFilter())
  }
  if (installedMap.getLayer(MapLayerConstants.CLUSTER_LAYER_ID)) {
    installedMap.setFilter(MapLayerConstants.CLUSTER_LAYER_ID, clusterFilter())
    installedMap.setPaintProperty(MapLayerConstants.CLUSTER_LAYER_ID, 'circle-radius', clusterRadiusExpression())
  }
  if (installedMap.getLayer(MapLayerConstants.CLUSTER_COUNT_LAYER_ID)) {
    installedMap.setFilter(MapLayerConstants.CLUSTER_COUNT_LAYER_ID, clusterFilter())
    installedMap.setLayoutProperty(MapLayerConstants.CLUSTER_COUNT_LAYER_ID, 'text-field', [
      'to-string', ['get', selectedClusterCountProperty()],
    ])
  }
}

async function ensureLayers() {
  const map = context.map.value
  const mapLibrary = context.mapLibrary.value?.library
  if (!map || !mapLibrary || !props.pmtilesUrl || !map.isStyleLoaded()) return
  try {
    if (protocolRegistration?.library !== mapLibrary) {
      const { Protocol } = await loadProtocol()
      const protocol = new Protocol()
      mapLibrary.addProtocol(MapLayerConstants.PROTOCOL, protocol.tile)
      protocolRegistration = { library: mapLibrary, protocol }
    }

    if (!map.getSource(MapLayerConstants.SOURCE_ID)) {
      map.addSource(MapLayerConstants.SOURCE_ID, {
        type: 'vector',
        url: protocolUrl(),
      })
    }
    if (!map.getLayer(MapLayerConstants.CLUSTER_LAYER_ID)) {
      map.addLayer({
      id: MapLayerConstants.CLUSTER_LAYER_ID,
      type: 'circle',
      source: MapLayerConstants.SOURCE_ID,
      'source-layer': props.sourceLayer,
      filter: clusterFilter(),
      paint: {
        'circle-color': 'rgba(20, 35, 55, .88)',
        'circle-stroke-color': 'rgba(205, 226, 255, .72)',
        'circle-stroke-width': 1.5,
        'circle-radius': clusterRadiusExpression(),
      },
      })
    }
    if (!map.getLayer(MapLayerConstants.CLUSTER_COUNT_LAYER_ID)) {
      map.addLayer({
      id: MapLayerConstants.CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: MapLayerConstants.SOURCE_ID,
      'source-layer': props.sourceLayer,
      filter: clusterFilter(),
      layout: {
        'text-field': ['to-string', ['get', selectedClusterCountProperty()]],
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#f8fbff',
        'text-halo-color': 'rgba(0, 0, 0, .46)',
        'text-halo-width': 1,
      },
      })
    }
    if (!map.getLayer(MapLayerConstants.SPECIES_LAYER_ID)) {
      map.addLayer({
      id: MapLayerConstants.SPECIES_LAYER_ID,
      type: 'circle',
      source: MapLayerConstants.SOURCE_ID,
      'source-layer': props.sourceLayer,
      filter: featureFilter(),
      paint: {
        'circle-color': ['case', ['>', ['get', 'audio_count'], 0], '#ed5bab', ['>', ['get', 'image_count'], 0], '#7898c7', '#607286'],
        'circle-stroke-color': 'rgba(244, 249, 255, .9)',
        'circle-stroke-width': 1.2,
        'circle-radius': ['interpolate', ['linear'], ['ln', ['+', ['get', 'occurrence_count'], 1]], 0, 5, 8, 10],
      },
      })
    }
    applyFilter()
    if (!layerReadyEmitted) {
      layerReadyEmitted = true
      emit('layer-ready')
    }
  } catch (error) {
    emit('layer-error', error)
  }
}

function interactiveFeatures(event) {
  const layers = [MapLayerConstants.SPECIES_LAYER_ID, MapLayerConstants.CLUSTER_LAYER_ID]
    .filter(layer => installedMap.getLayer(layer))
  return layers.length ? installedMap.queryRenderedFeatures(event.point, { layers }) : []
}

function onMouseMove(event) {
  const feature = normalizedFeature(interactiveFeatures(event)[0])
  installedMap.getCanvas().style.cursor = feature ? 'pointer' : ''
  if (!feature) {
    if (hoveredFeatureKey) emit('leave-feature')
    hoveredFeatureKey = ''
    return
  }
  const key = [
    feature.datasetVersion,
    feature.datasetRevision,
    feature.kind,
    feature.resolution,
    feature.cellId,
    feature.exactLatitude || '',
    feature.exactLongitude || '',
    feature.speciesKey || '',
  ].join(':')
  if (key === hoveredFeatureKey) return
  hoveredFeatureKey = key
  emit('hover-feature', feature)
}

function onClick(event) {
  const feature = normalizedFeature(interactiveFeatures(event)[0])
  if (feature) emit('select-feature', feature)
}

function installInteractions() {
  const map = context.map.value
  if (!map || installedMap === map) return
  installedMap = map
  map.on('mousemove', onMouseMove)
  map.on('click', onClick)
  map.on('style.load', ensureLayers)
  map.on('error', onMapError)
}

function onMapError(event) {
  const message = String(event?.error?.message || event?.message || '')
  if (event?.sourceId === MapLayerConstants.SOURCE_ID || /pmtiles|gbif-scalable-source/i.test(message)) {
    emit('layer-error', event?.error || event)
  }
}

function removeInteractions() {
  if (!installedMap) return
  installedMap.off('mousemove', onMouseMove)
  installedMap.off('click', onClick)
  installedMap.off('style.load', ensureLayers)
  installedMap.off('error', onMapError)
  for (const layerId of [
    MapLayerConstants.SPECIES_LAYER_ID,
    MapLayerConstants.CLUSTER_COUNT_LAYER_ID,
    MapLayerConstants.CLUSTER_LAYER_ID,
  ]) {
    if (installedMap.getLayer(layerId)) installedMap.removeLayer(layerId)
  }
  if (installedMap.getSource(MapLayerConstants.SOURCE_ID)) installedMap.removeSource(MapLayerConstants.SOURCE_ID)
  installedMap.getCanvas().style.cursor = ''
  installedMap = null
}

watch(
  [() => context.ready.value, () => props.pmtilesUrl, () => props.sourceLayer],
  ([ready]) => {
    if (!ready || !props.pmtilesUrl) return
    installInteractions()
    void ensureLayers()
  },
  { immediate: true },
)
watch(() => props.activeFilter, () => {
  hoveredFeatureKey = ''
  applyFilter()
})
onBeforeUnmount(removeInteractions)
</script>

<template><span class="scalable-occurrence-layer" aria-hidden="true" /></template>
