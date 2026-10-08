import { describe, expect, it, vi } from 'vitest'
import type { Map as MapInstance } from 'maplibre-gl'
import { applyAppearance, capturePaint } from './appearance.js'

describe('globe theme round trip', () => {
  it('restores original daylight paint without removing occurrence layers', () => {
    const layers = [
      { id: 'water', type: 'fill', paint: { 'fill-color': '#aaccff' } },
      { id: 'natural-earth', type: 'raster', paint: {} },
      { id: 'country-label', type: 'symbol', layout: { 'text-field': '{name}' }, paint: {} },
      { id: 'gbif-occurrences', type: 'circle', paint: { 'circle-color': '#123' } },
    ]
    const map = { getStyle: () => ({ layers }), setSky: vi.fn(),
      setLayoutProperty: vi.fn(), setPaintProperty: vi.fn((id, property, value) => {
        Object.assign(layers.find(layer => layer.id === id)!.paint, { [property]: value })
      }) }
    const instance = map as unknown as MapInstance
    const original = capturePaint(instance)
    applyAppearance(instance, 'dark', 'zh', original)
    expect(layers[0].paint['fill-color']).toBe('#0b2746')
    applyAppearance(instance, 'light', 'en', original)
    expect(layers[0].paint['fill-color']).toBe('#aaccff')
    expect(layers[1].paint).toMatchObject({ 'raster-brightness-max': 1, 'raster-saturation': 0, 'raster-contrast': 0 })
    expect(layers[3].paint).toEqual({ 'circle-color': '#123' })
    applyAppearance(instance, 'dark', 'zh', original)
    expect(layers[0].paint['fill-color']).toBe('#0b2746')
  })
})
