import { describe, expect, it } from 'vitest'
import { basemapResourcePath } from './basemap.server.js'
import { initialBasemapStyle } from '../features/globe/basemap.js'
describe('basemap delivery', () => {
  it('bundles style and TileJSON with locally cached resource paths', () => {
    const style=initialBasemapStyle('https://example.com')
    expect(style.glyphs).toContain('https://example.com/api/basemap/fonts/{fontstack}/{range}.pbf')
    expect(style.sprite).toContain('https://example.com/api/basemap/sprites/')
    expect(style.sources.openmaptiles).toHaveProperty('tiles')
    expect(style.sources.openmaptiles).not.toHaveProperty('url')
    expect(style.layers.filter(layer => layer.type==='raster').every(layer => layer.layout?.visibility==='none')).toBe(true)
  })
  it('accepts only known tile/font/sprite paths', () => {
    expect(basemapResourcePath('fonts/Noto Sans Regular/0-255.pbf')).toBeTruthy()
    expect(basemapResourcePath('planet/20261004_113936_pt/2/3/1.pbf')).toBeTruthy()
    for (const path of ['../private','planet/../../secret.pbf','https://localhost/private','fonts/Noto/0-255.pbf?url=x']) expect(basemapResourcePath(path)).toBeNull()
  })
})
