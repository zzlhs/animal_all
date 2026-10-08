import React, { useEffect, useRef, useState } from 'react'
import type { Map as MapInstance, MapGeoJSONFeature, ExpressionSpecification } from 'maplibre-gl'
import type { FilterType, MapFeatureProperties, MapReleaseMeta, OccurrenceRecord } from '@gbif-globe/contracts'
import { MapInteractionConstants as C } from '@gbif-globe/contracts'
import type { SelectedFeature, FeatureInteraction } from './features.js'
import { countProperty, featureIdentity } from './features.js'
import 'maplibre-gl/dist/maplibre-gl.css'
import { GlobeView, capturePaint, applyAppearance } from './appearance.js'
import { initialBasemapStyle, bootstrapBasemapStyle } from './basemap.js'
import { layoutMapFeatures, mapFeatureFilter } from './markerLayout.js'
import { GlobeLoadingConstants as L } from './loading.constants.js'
import { markGlobeReady } from './performance.js'

interface MapCanvasProps {
  theme?: string
  language?: string
  filter?: FilterType
  release?: MapReleaseMeta
  nativeMarkersReady?: boolean
  priorityFeatureIds?: string[]
  priorityRecord?: OccurrenceRecord | null
  camera?: { center: [number, number]; zoom: number }
  onVisibleFeatures?: (features: SelectedFeature[]) => void
  onFeature?: (feature: SelectedFeature, interaction: FeatureInteraction) => void
  onDismiss?: () => void
  onError?: (error: Error) => void
  onMapReady?: (map: MapInstance) => void
  children?: React.ReactNode
}
let protocolPromise: Promise<void> | undefined
async function libraryWithProtocol() {
  const library = (await import('maplibre-gl')).default
  protocolPromise ??= import('pmtiles').then(({ Protocol }) => { library.addProtocol('pmtiles', new Protocol().tile) })
  await protocolPromise
  return library
}
export function MapCanvas(props: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const install = useRef<() => void>(() => {})

  useEffect(() => {
    let disposed = false
    let instance: MapInstance | null = null
    let hoverTimer: ReturnType<typeof setTimeout> | undefined
    let hovered = ''
    let installedUrl = ''
    let styleReady = false
    let originalPaint: ReturnType<typeof capturePaint> = new Map()
    let visibleKey = ''
    let nativeMode: boolean | undefined
    let cameraKey = ''
    let appearanceKey = ''
    let syncTimer: ReturnType<typeof setTimeout> | undefined
    let rasterTimer: ReturnType<typeof setTimeout> | undefined
    let basemapTimer: ReturnType<typeof setTimeout> | undefined
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    const candidateLayer = `${C.LAYER_ID}-candidates`
    let displayedFilter: ExpressionSpecification = ['==', ['get', 'kind'], '__none__']
    let baseFilter: ExpressionSpecification = ['==', ['get', 'kind'], '__none__']
    let rasterVisible = false
    let basemapInstalled = false
    void libraryWithProtocol().then(library => {
      if (disposed || !container.current) return
      instance = new library.Map({ container: container.current, style: bootstrapBasemapStyle(window.location.origin), center: GlobeView.CENTER, zoom: GlobeView.ZOOM, minZoom: 1, maxZoom: 19,
        maxTileCacheSize: L.MAX_TILE_CACHE, cancelPendingTileRequestsWhileZooming: true, localIdeographFontFamily: 'sans-serif', collectResourceTiming: true })
      map.current = instance
      const update = () => {
        const m = instance!
        if (!styleReady) return
        const { release, filter = 'all', theme = 'dark', language = 'zh' } = latest.current
        const camera = latest.current.camera
        if (camera && cameraKey !== JSON.stringify(camera)) { cameraKey = JSON.stringify(camera); m.jumpTo(camera) }
        m.setProjection({ type: 'globe' })
        if (appearanceKey !== `${theme}:${language}`) {
          applyAppearance(m, theme, language, originalPaint)
          appearanceKey = `${theme}:${language}`
        }
        if (!release) return
        const key = `${release.releaseId}:${release.pmtilesUrl}`
        if (key !== installedUrl) {
          for (const id of [C.LABEL_LAYER_ID, C.LAYER_ID, `${C.LAYER_ID}-shadow`, candidateLayer]) if (m.getLayer(id)) m.removeLayer(id)
          if (m.getSource(C.SOURCE_ID)) m.removeSource(C.SOURCE_ID)
          installedUrl = key
          nativeMode = undefined
          visibleKey = ''
          displayedFilter = ['==', ['get', 'kind'], '__none__']
        }
        if (!m.getSource(C.SOURCE_ID)) m.addSource(C.SOURCE_ID, { type: 'vector', url: release.pmtilesUrl.startsWith('pmtiles://') ? release.pmtilesUrl : `pmtiles://${new URL(release.pmtilesUrl, window.location.origin)}` })
        const count = countProperty(filter)
        const countExpr: ExpressionSpecification = ['coalesce', ['get', count], 0]
        // Species features use class_name; mixed coordinate/cluster features carry per-filter counts.
        const visibility: ExpressionSpecification = filter === 'Aves' || filter === 'Insecta'
          ? ['case', ['==', ['get', 'kind'], 'species'], ['==', ['get', 'class_name'], filter], ['>', countExpr, 0]]
          : ['>', countExpr, 0]
        const displayCount: ExpressionSpecification = filter === 'Aves' || filter === 'Insecta'
          ? ['case', ['==', ['get', 'kind'], 'species'], ['get', 'occurrence_count'], countExpr] : countExpr
        baseFilter = visibility
        if (!m.getLayer(candidateLayer)) m.addLayer({ id: candidateLayer, type: 'circle', source: C.SOURCE_ID, 'source-layer': release.sourceLayer,
          paint: { 'circle-radius': 1, 'circle-opacity': 0, 'circle-stroke-opacity': 0 } })
        m.setFilter(candidateLayer, visibility)
        if (!m.hasImage('gbif-audio')) {
          const data = new Uint8Array(32 * 32 * 4)
          const heights = [8, 18, 26, 14, 22, 8]
          heights.forEach((height, i) => {
            for (let y = (32 - height) / 2; y < (32 + height) / 2; y++) for (let x = 4 + i * 4; x < 6 + i * 4; x++) {
              const offset = (y * 32 + x) * 4
              data.set([255, 255, 255, 255], offset)
            }
          })
          m.addImage('gbif-audio', { width: 32, height: 32, data }, { sdf: true })
        }
        if (!m.getLayer(`${C.LAYER_ID}-shadow`)) m.addLayer({ id: `${C.LAYER_ID}-shadow`, type: 'circle', source: C.SOURCE_ID, 'source-layer': release.sourceLayer,
          paint: { 'circle-color': '#000', 'circle-opacity': .3, 'circle-blur': .6, 'circle-radius': 29, 'circle-translate': [0, 3] } })
        m.setFilter(`${C.LAYER_ID}-shadow`, ['all', visibility, displayedFilter])
        if (!m.getLayer(C.LAYER_ID)) m.addLayer({ id: C.LAYER_ID, type: 'circle', source: C.SOURCE_ID, 'source-layer': release.sourceLayer,
          paint: { 'circle-color': '#10272c', 'circle-stroke-color': '#74858e', 'circle-stroke-width': 1.5, 'circle-radius': 24 } })
        m.setFilter(C.LAYER_ID, ['all', visibility, displayedFilter])
        m.setPaintProperty(C.LAYER_ID, 'circle-radius', ['case', ['>', displayCount, 1], 25, 20])
        m.setPaintProperty(C.LAYER_ID, 'circle-color', theme === 'dark' ? '#10272c' : '#f0eee6')
        m.setPaintProperty(C.LAYER_ID, 'circle-stroke-color', theme === 'dark' ? '#74858e' : '#9caaa7')
        if (!m.getLayer(C.LABEL_LAYER_ID)) m.addLayer({ id: C.LABEL_LAYER_ID, type: 'symbol', source: C.SOURCE_ID, 'source-layer': release.sourceLayer,
          layout: { 'text-size': 14, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false, 'icon-allow-overlap': false, 'icon-size': .75 }, paint: { 'text-color': '#fff' } })
        m.setLayoutProperty(C.LABEL_LAYER_ID, 'icon-image', ['case', ['all', ['<=', displayCount, 1], ['>', ['coalesce', ['get', 'audio_occurrence_count'], 0], 0]], 'gbif-audio', ''])
        m.setPaintProperty(C.LABEL_LAYER_ID, 'icon-color', theme === 'dark' ? '#f4f6f6' : '#283c40')
        m.setFilter(C.LABEL_LAYER_ID, ['all', visibility, displayedFilter])
        m.setPaintProperty(C.LABEL_LAYER_ID, 'text-color', theme === 'dark' ? '#f4f6f6' : '#283c40')
        m.setLayoutProperty(C.LABEL_LAYER_ID, 'text-field', ['case', ['>', displayCount, 1], ['to-string', displayCount], ['>', ['coalesce', ['get', 'audio_occurrence_count'], 0], 0], '', '•'])
        scheduleSync()
      }
      install.current = update
      const revealRaster = () => {
        if (rasterVisible || disposed || !basemapInstalled) return
        rasterVisible = true
        for (const layer of instance!.getStyle().layers) if (layer.type === 'raster') instance!.setLayoutProperty(layer.id, 'visibility', 'visible')
      }
      const installBasemap = () => {
        if (basemapInstalled || disposed) return
        basemapInstalled = true
        const style = initialBasemapStyle(window.location.origin)
        if (typeof style.sprite === 'string') instance!.setSprite(style.sprite)
        for (const [id, source] of Object.entries(style.sources)) if (!instance!.getSource(id)) instance!.addSource(id, source)
        for (const layer of style.layers) {
          if (!instance!.getLayer(layer.id)) instance!.addLayer(layer, instance!.getLayer(candidateLayer) ? candidateLayer : undefined)
          originalPaint.set(layer.id, structuredClone(layer.paint || {}))
        }
        appearanceKey = ''; update()
        rasterTimer = setTimeout(revealRaster, L.DEFER_RASTER_MS)
        markGlobeReady('gbif-basemap-start')
      }
      instance.on('style.load', () => {
        styleReady = true; originalPaint = capturePaint(instance!); appearanceKey = ''; update()
        if (!disposed) { setReady(true); latest.current.onMapReady?.(instance!); markGlobeReady('gbif-map-ready') }
        fallbackTimer = setTimeout(() => { installBasemap(); revealRaster() }, L.BASEMAP_FALLBACK_MS)
      })
      instance.on('error', event => { const message = String(event.error?.message || 'Map unavailable'); setError(message); latest.current.onError?.(new Error(message)) })
      const normalize = (feature?: MapGeoJSONFeature): SelectedFeature | null => {
        if (!feature || feature.geometry.type !== 'Point') return null
        return { properties: feature.properties as MapFeatureProperties, coordinates: feature.geometry.coordinates.slice(0, 2) as [number, number] }
      }
      const hit = (point: { x: number; y: number }) => !nativeMode && instance!.getLayer(C.LAYER_ID) ? normalize(instance!.queryRenderedFeatures([point.x, point.y], { layers: [C.LAYER_ID] })[0]) : null
      const syncVisible = () => {
        syncTimer = undefined
        if (!instance?.getLayer(candidateLayer) || !latest.current.onVisibleFeatures || instance.isMoving()) return
        const unique = new Map<string, SelectedFeature>()
        for (const item of instance.queryRenderedFeatures(undefined, { layers: [candidateLayer] })) {
          const feature = normalize(item)
          if (feature) unique.set(featureIdentity(feature), feature)
        }
        const features = layoutMapFeatures([...unique.values()], instance, latest.current.filter || 'all', latest.current.priorityFeatureIds, latest.current.priorityRecord)
        const nextKey = JSON.stringify(features.map(featureIdentity))
        if (nextKey !== visibleKey) {
          displayedFilter = features.length ? ['any', ...features.map(mapFeatureFilter)] as ExpressionSpecification : ['==', ['get', 'kind'], '__none__']
          for (const id of [C.LAYER_ID, `${C.LAYER_ID}-shadow`, C.LABEL_LAYER_ID]) instance.setFilter(id, ['all', baseFilter, displayedFilter])
        }
        const native = Boolean(latest.current.nativeMarkersReady)
        if (nativeMode !== native) {
        nativeMode = native
        for (const id of [C.LAYER_ID, `${C.LAYER_ID}-shadow`]) instance.setPaintProperty(id, 'circle-opacity', native ? 0 : id.endsWith('-shadow') ? .3 : 1)
        instance.setPaintProperty(C.LAYER_ID, 'circle-stroke-opacity', native ? 0 : 1)
        instance.setPaintProperty(C.LABEL_LAYER_ID, 'text-opacity', native ? 0 : 1)
        instance.setPaintProperty(C.LABEL_LAYER_ID, 'icon-opacity', native ? 0 : 1)
        }
        if (nextKey !== visibleKey) {
          visibleKey = nextKey; latest.current.onVisibleFeatures(features)
          if (features.length) {
            markGlobeReady('gbif-first-markers')
            if (!basemapInstalled && !basemapTimer) basemapTimer = setTimeout(installBasemap, L.DEFER_BASEMAP_MS)
          }
        }
      }
      function scheduleSync() { if (!syncTimer) syncTimer = setTimeout(syncVisible, L.VISIBLE_SYNC_MS) }
      instance.on('sourcedata', event => { if (event.sourceId === C.SOURCE_ID && event.sourceDataType === 'content') scheduleSync() })
      instance.on('render', scheduleSync)
      instance.on('moveend', scheduleSync)
      instance.on('resize', scheduleSync)
      instance.on('mousemove', event => {
        if (event.originalEvent?.target instanceof Element && event.originalEvent.target.closest('.maplibregl-popup, .map-marker-host')) {
          clearTimeout(hoverTimer)
          return
        }
        const feature = hit(event.point)
        const key = feature ? featureIdentity(feature) : ''
        instance!.getCanvas().style.cursor = feature ? 'pointer' : ''
        if (key === hovered) return
        hovered = key
        clearTimeout(hoverTimer)
        if (feature) hoverTimer = setTimeout(() => latest.current.onFeature?.(feature, 'hover'), C.HOVER_DELAY_MS)
      })
      instance.on('click', event => {
        clearTimeout(hoverTimer)
        if (event.originalEvent?.target instanceof Element && event.originalEvent.target.closest('.maplibregl-popup, .map-marker-host')) return
        const feature = hit(event.point)
        if (feature) latest.current.onFeature?.(feature, 'click')
        else latest.current.onDismiss?.()
      })
      instance.on('mouseout', () => { clearTimeout(hoverTimer); hovered = '' })
    }).catch(reason => { if (!disposed) setError(String(reason)) })
    return () => { disposed = true; clearTimeout(hoverTimer); clearTimeout(syncTimer); clearTimeout(rasterTimer); clearTimeout(basemapTimer); clearTimeout(fallbackTimer); instance?.remove(); map.current = null; install.current = () => {} }
  }, [])
  useEffect(() => { install.current() }, [props.release, props.filter, props.theme, props.language, props.camera, props.nativeMarkersReady, props.priorityFeatureIds, props.priorityRecord])
  return <div className="map-viewport" style={{ position: 'absolute', inset: 0 }}>
    <div ref={container} style={{ width: '100%', height: '100%' }} />
    {error && <div role="alert" style={{ position: 'absolute', bottom: 60, left: 16, maxWidth: 400 }}>{error}<button onClick={() => window.location.reload()}>重试 / Retry</button></div>}
    {ready && props.children}
  </div>
}
