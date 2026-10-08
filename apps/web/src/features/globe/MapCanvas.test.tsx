// @vitest-environment jsdom
import React from 'react'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ maps: [] as any[] }))
vi.mock('maplibre-gl', () => {
  class Map {
    handlers: Record<string, Function> = {}
    layers = new Set<string>()
    sources = new Set<string>()
    addSource = vi.fn((id: string) => this.sources.add(id))
    addLayer = vi.fn((layer: any) => this.layers.add(layer.id))
    removeLayer = vi.fn((id: string) => this.layers.delete(id))
    removeSource = vi.fn((id: string) => this.sources.delete(id))
    setFilter = vi.fn()
    setPaintProperty = vi.fn()
    setLayoutProperty = vi.fn()
    setProjection = vi.fn()
    setSky = vi.fn()
    setSprite = vi.fn()
    hasImage = vi.fn(() => false)
    addImage = vi.fn()
    remove = vi.fn()
    queryRenderedFeatures = vi.fn(() => [])
    on(name: string, fn: Function) { this.handlers[name] = fn }
    isStyleLoaded() { return false } // Tile requests can still be pending after style.load.
    getStyle() { return { layers: [] } }
    getLayer(id: string) { return this.layers.has(id) }
    getSource(id: string) { return this.sources.has(id) }
    getCanvas() { return { style: {} } }
    getContainer() { return { clientWidth: 1280, clientHeight: 720 } }
    getZoom() { return 2.05 }
    isMoving() { return false }
    project(coordinate: [number, number]) { return { x: 640 + coordinate[0], y: 360 - coordinate[1] } }
    constructor(public options: any) { state.maps.push(this) }
  }
  return { default: { Map, addProtocol:vi.fn() } }
})
vi.mock('pmtiles', () => ({ Protocol: class { tile = vi.fn() } }))
import { MapCanvas } from './MapCanvas.js'
afterEach(cleanup)
describe('MapCanvas lifecycle', () => {
  it('installs release tiles, updates filtering without recreating map, and removes resources', async () => {
    const release = {releaseId:'1',featureSchemaVersion:2,pmtilesUrl:'https://cdn.example.com/a.pmtiles',sourceLayer:'gbif_occurrences',maxZoom:18}
    const onFeature = vi.fn()
    const view=render(<MapCanvas filter="all" onFeature={onFeature} />)
    await waitFor(() => expect(state.maps.length).toBeGreaterThan(0))
    const map=state.maps.at(-1)
    act(() => { map.handlers['style.load']() })
    view.rerender(<MapCanvas release={release} filter="all" onFeature={onFeature} />)
    expect(map.addSource).toHaveBeenCalledWith('gbif-occurrences',expect.objectContaining({url:'pmtiles://https://cdn.example.com/a.pmtiles'}))
    const count=state.maps.length
    view.rerender(<MapCanvas release={release} filter="audio" onFeature={onFeature} />)
    expect(state.maps.length).toBe(count)
    expect(JSON.stringify(map.setFilter.mock.calls.at(-1))).toContain('audio_occurrence_count')
    const feature={properties:{kind:'coordinate',dataset_revision:'r',exact_latitude:'0',exact_longitude:'0'},geometry:{type:'Point',coordinates:[0,0]}}
    map.queryRenderedFeatures.mockReturnValue([feature])
    act(() => map.handlers.click({point:{x:10,y:20}}))
    expect(onFeature).toHaveBeenCalledWith(expect.objectContaining({coordinates:[0,0]}), 'click')
    view.rerender(<MapCanvas release={{...release,releaseId:'2',pmtilesUrl:'https://cdn.example.com/b.pmtiles'}} />)
    expect(map.removeSource).toHaveBeenCalledWith('gbif-occurrences')
    view.unmount()
    expect(map.remove).toHaveBeenCalledOnce()
  })
  it('shows the map and synchronizes GBIF tiles while unrelated basemap requests remain pending', async () => {
    const onMapReady = vi.fn(), onVisibleFeatures = vi.fn()
    const release = {releaseId:'1',featureSchemaVersion:2,pmtilesUrl:'https://cdn.example.com/a.pmtiles',sourceLayer:'gbif_occurrences',maxZoom:18}
    render(<MapCanvas release={release} onMapReady={onMapReady} onVisibleFeatures={onVisibleFeatures} />)
    await waitFor(() => expect(state.maps.at(-1)?.handlers['style.load']).toBeDefined())
    const map = state.maps.at(-1)
    const properties = { kind:'cluster', dataset_revision:'r', resolution:2, cell_id:'abc', occurrence_count:100, representative_occurrence_id:'1' }
    map.queryRenderedFeatures.mockReturnValue([{ properties, geometry:{ type:'Point', coordinates:[0,0] } }])
    act(() => { map.handlers['style.load'](); map.handlers.sourcedata({ sourceId:'gbif-occurrences', sourceDataType:'content' }) })
    expect(onMapReady).toHaveBeenCalledWith(map)
    expect(map.handlers.idle).toBeUndefined()
    expect(map.options.style).toMatchObject({ version:8, projection:{type:'globe'} })
    expect(map.options.style.sources).toEqual({})
    await waitFor(() => expect(onVisibleFeatures).toHaveBeenCalledWith([expect.objectContaining({ properties })]))
  })
  it('lets popup controls handle clicks and dismisses a selection on empty map clicks', async () => {
    const onFeature = vi.fn(), onDismiss = vi.fn()
    render(<MapCanvas onFeature={onFeature} onDismiss={onDismiss} />)
    await waitFor(() => expect(state.maps.at(-1)?.handlers.click).toBeDefined())
    const map = state.maps.at(-1)
    const popup = document.createElement('div')
    popup.className = 'maplibregl-popup'
    const play = document.createElement('button')
    popup.appendChild(play)
    act(() => map.handlers.click({point:{x:10,y:20},originalEvent:{target:play}}))
    expect(onFeature).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => map.handlers.click({point:{x:10,y:20},originalEvent:{target:document.createElement('canvas')}}))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
