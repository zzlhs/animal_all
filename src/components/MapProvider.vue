<script setup>
import { nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapContextKey } from '../map/context.js'

const props = defineProps({
  center: { type: Array, required: true },
  zoom: { type: Number, required: true },
  theme: { type: String, default: 'dark' },
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['load', 'zoom', 'move'])
const container = ref(null)
const map = shallowRef(null)
const mapLibrary = shallowRef(null)
const ready = ref(false)

provide(MapContextKey, { map, mapLibrary, ready })

function mapboxStyle() {
  return 'mapbox://styles/mapbox/standard'
}

function maplibreStyle() {
  return 'https://tiles.openfreemap.org/styles/liberty'
}

function applyMapboxLanguage() {
  if (!map.value || mapLibrary.value?.provider !== 'mapbox') return
  try {
    map.value.setLanguage(props.language === 'zh' ? 'zh-Hans' : 'en')
  } catch {}
}

function applyMapLanguage() {
  applyMapboxLanguage()
  if (map.value && mapLibrary.value?.provider === 'maplibre' && ready.value) customizeMapLibreStyle()
  try {
    map.value?.getCanvas().setAttribute('aria-label', props.language === 'zh' ? '地图' : 'Map')
  } catch {}
}

function applyGlobeProjection() {
  if (!map.value) return
  try {
    // MapLibre derives the projection from the loaded style, so its
    // constructor option is not enough when the style is provided by URL.
    // Apply it after every style load to keep theme switches spherical too.
    map.value.setProjection(mapLibrary.value?.provider === 'mapbox'
      ? { name: 'globe' }
      : { type: 'globe' })
  } catch {}
}

function applyMapLibreAtmosphere() {
  if (!map.value || mapLibrary.value?.provider !== 'maplibre') return
  try {
    // Keep the sky transparent so the CSS star field remains visible, while
    // letting the map renderer add the pale atmospheric rim around the globe.
    map.value.setSky({
      'sky-color': 'transparent',
      'horizon-color': 'transparent',
      'fog-color': props.theme === 'dark' ? 'rgba(120, 151, 214, .72)' : 'rgba(192, 214, 244, .76)',
      'fog-ground-blend': .48,
      'horizon-fog-blend': .72,
      'sky-horizon-blend': .72,
      'atmosphere-blend': .92,
    })
  } catch {}
}

async function applyTheme() {
  if (!map.value || !ready.value) return
  if (mapLibrary.value.provider === 'mapbox') {
    try {
      map.value.setConfigProperty('basemap', 'lightPreset', props.theme === 'dark' ? 'night' : 'day')
      map.value.setConfigProperty('basemap', 'colorThemes', 'faded')
    } catch {}
    return
  }
  const center = map.value.getCenter()
  const zoom = map.value.getZoom()
  map.value.setStyle(maplibreStyle(), { diff: false })
  map.value.once('style.load', () => map.value.jumpTo({ center, zoom }))
}

function customizeMapLibreStyle() {
  for (const layer of map.value.getStyle().layers || []) {
    if (props.theme === 'dark') {
      try {
        if (layer.type === 'background') map.value.setPaintProperty(layer.id, 'background-color', '#05182d')
        if (layer.type === 'raster') {
          map.value.setPaintProperty(layer.id, 'raster-brightness-min', 0)
          // The low-zoom globe is driven by Natural Earth's raster layer.
          // Retain muted colour, but keep enough luminance for the land mass
          // to read as a physical sphere against the night sky.
          map.value.setPaintProperty(layer.id, 'raster-brightness-max', .53)
          map.value.setPaintProperty(layer.id, 'raster-saturation', -.50)
          map.value.setPaintProperty(layer.id, 'raster-contrast', .09)
        }
        if (layer.type === 'fill') {
          const color = /water/i.test(layer.id)
            ? '#0b2746'
            : /building/i.test(layer.id)
              ? '#3e4c55'
              : /park|wood|forest|grass|landcover/i.test(layer.id)
                ? '#3f5354'
                : '#495963'
          map.value.setPaintProperty(layer.id, 'fill-color', color)
        }
        if (layer.type === 'line') {
          const color = /boundary/i.test(layer.id)
            ? '#9285a4'
            : /water/i.test(layer.id)
              ? '#456d91'
              : /road|highway|street|path/i.test(layer.id)
                ? '#89929c'
                : '#6f7b85'
          map.value.setPaintProperty(layer.id, 'line-color', color)
        }
      } catch {}
    }

    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
    if (!/(label|place|country|state|city|town|village|poi|airport)/i.test(layer.id)) continue
    try {
      map.value.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', `name:${props.language}`],
        ['get', 'name:en'],
        ['get', 'name:latin'],
        ['get', 'name'],
      ])
      map.value.setPaintProperty(layer.id, 'text-color', props.theme === 'dark' ? '#d5d8dc' : '#292524')
      map.value.setPaintProperty(layer.id, 'text-halo-color', props.theme === 'dark' ? 'rgba(4, 18, 33, .88)' : 'rgba(255, 255, 255, .74)')
      map.value.setPaintProperty(layer.id, 'text-halo-width', .9)
    } catch {}
  }
}

watch(() => props.theme, applyTheme)
watch(() => props.language, applyMapLanguage)

onMounted(async () => {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()
  const library = token ? (await import('mapbox-gl')).default : maplibregl
  if (token) library.accessToken = token
  mapLibrary.value = { Marker: library.Marker, provider: token ? 'mapbox' : 'maplibre' }

  const options = {
    container: container.value,
    style: token ? mapboxStyle() : maplibreStyle(),
    center: props.center,
    zoom: props.zoom,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    minZoom: 1,
    maxZoom: 19,
    // The reference uses Mapbox GL's globe projection. Keeping the projection
    // on the map instance is important: native markers then follow the same
    // globe transform during zoom, pan, and rotation instead of sitting on a
    // manually positioned flat-map overlay.
    projection: 'globe',
  }
  if (token) {
    options.language = props.language === 'zh' ? 'zh-Hans' : 'en'
    options.config = { basemap: { lightPreset: props.theme === 'dark' ? 'night' : 'day', colorThemes: 'faded' } }
  }

  map.value = new library.Map(options)
  map.value.on('error', event => console.error('Map error', event.error || event))
  let didBecomeReady = false
  const markReady = async () => {
    if (didBecomeReady) return
    didBecomeReady = true
    ready.value = true
    await nextTick()
    emit('load', map.value)
  }
  map.value.on('style.load', () => {
    applyMapLanguage()
    applyGlobeProjection()
    if (!token) {
      customizeMapLibreStyle()
      applyMapLibreAtmosphere()
    }
    markReady()
  })
  map.value.on('load', markReady)
  map.value.on('zoom', () => emit('zoom', map.value.getZoom()))
  map.value.on('move', () => emit('move', map.value))
})

onBeforeUnmount(() => map.value?.remove())
</script>

<template>
  <div class="map-provider" :class="`theme-${theme}`">
    <div ref="container" class="map-canvas" />
    <div class="marker-staging"><slot /></div>
  </div>
</template>
