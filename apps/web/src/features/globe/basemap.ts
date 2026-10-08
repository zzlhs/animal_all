import type { StyleSpecification } from 'maplibre-gl'
import snapshot from './basemap.style.json'
import { GlobeLoadingConstants as L } from './loading.constants.js'

export const BasemapConstants = Object.freeze({
  ORIGIN: 'https://tiles.openfreemap.org',
  ROUTE: '/api/basemap',
  RASTER_LAYER: 'natural_earth',
})

// Bundle the style and TileJSON URLs to avoid two serial remote requests during startup.
// An optional asset origin can point to a deployment/CDN serving the same /api/basemap paths.
export function initialBasemapStyle(origin: string) {
  const style = structuredClone(snapshot) as unknown as StyleSpecification
  const base = import.meta.env.VITE_BASEMAP_ASSET_ORIGIN || origin
  const rewrite = (url: string) => url.startsWith(BasemapConstants.ORIGIN + '/')
    ? base.replace(/\/$/, '') + BasemapConstants.ROUTE + new URL(url).pathname.replace(/%7B/gi, '{').replace(/%7D/gi, '}') : url
  if (typeof style.sprite === 'string') style.sprite = rewrite(style.sprite)
  if (style.glyphs) style.glyphs = rewrite(style.glyphs)
  for (const source of Object.values(style.sources)) if ('tiles' in source && source.tiles) source.tiles = source.tiles.map(rewrite)
  for (const layer of style.layers) if (layer.type === 'raster') layer.layout = { ...layer.layout, visibility: 'none' }
  // Global views need fewer terrain tiles; regional views keep the original resolution.
  const raster = style.layers.find(layer => layer.id === BasemapConstants.RASTER_LAYER)
  if (raster?.type === 'raster') {
    style.sources.ne2_overview = { ...style.sources.ne2_shaded, type: 'raster', tileSize: 512, maxzoom: 3 } as StyleSpecification['sources'][string]
    const overview = { ...structuredClone(raster), id: 'natural_earth_overview', source: 'ne2_overview', minzoom: 0, maxzoom: L.GLOBAL_ZOOM }
    raster.minzoom = L.GLOBAL_ZOOM
    style.layers.splice(style.layers.indexOf(raster), 0, overview)
  }
  style.projection = { type: 'globe' }
  return style
}

export function bootstrapBasemapStyle(origin: string): StyleSpecification {
  const full = initialBasemapStyle(origin)
  return { version:8, sources:{}, glyphs:full.glyphs, projection:{type:'globe'}, layers:full.layers.filter(layer => layer.type==='background') }
}
