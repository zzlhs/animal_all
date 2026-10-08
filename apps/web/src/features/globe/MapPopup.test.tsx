// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Map as MapInstance } from 'maplibre-gl'
const state = vi.hoisted(() => ({ popups: [] as any[], observers: [] as any[], markers: [] as any[] }))
vi.mock('maplibre-gl', () => ({ Marker: class {
  setLngLat = vi.fn().mockReturnThis()
  addTo = vi.fn().mockReturnThis()
  remove = vi.fn()
  constructor() { state.markers.push(this) }
}, Popup: class {
  options: any
  content!: HTMLElement
  setLngLat = vi.fn().mockReturnThis()
  setOffset = vi.fn().mockReturnThis()
  getElement() { return this.content }
  remove = vi.fn(() => this.content.remove())
  constructor(options: any) { this.options = options; state.popups.push(this) }
  setDOMContent(content: HTMLElement) { this.content = content; return this }
  addTo() { document.body.appendChild(this.content); return this }
} }))
import { MapPopup } from './MapPopup.js'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.popups.length = 0; state.observers.length = 0; state.markers.length = 0 })

it('repositions a persistent popup after selection, movement and panel resizing, and cleans up listeners', async () => {
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(callback: () => void) { this.callback = callback; state.observers.push(this) }
  })
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientHeight', { value: 720 })
  Object.defineProperty(container, 'clientWidth', { value: 1280 })
  const handlers: Record<string, () => void> = {}
  let panY = 0
  const map = {
    getContainer: () => container,
    project: (coordinate: [number, number]) => ({ x: coordinate[0], y: coordinate[1] + panY }),
    on: (event: string, handler: () => void) => { handlers[event] = handler },
    off: vi.fn(),
  } as unknown as MapInstance
  const view = render(<MapPopup map={map} coordinates={[300, 200]}><button>Play recording</button></MapPopup>)
  await waitFor(() => expect(state.popups.length).toBe(1))
  const popup = state.popups[0]
  expect(popup.content.textContent).toBe('Play recording')
  expect(popup.content.style.getPropertyValue('--popup-max-height')).toBe('466px')
  view.rerender(<MapPopup map={map} coordinates={[500, 380]}><button>Play recording</button></MapPopup>)
  expect(state.popups).toHaveLength(1)
  expect(popup.setLngLat).toHaveBeenLastCalledWith([500, 380])
  expect(state.markers[0].setLngLat).toHaveBeenLastCalledWith([500, 380])
  expect(popup.content.style.getPropertyValue('--popup-max-height')).toBe('326px')
  panY = 100
  act(() => handlers.move())
  expect(popup.content.style.getPropertyValue('--popup-max-height')).toBe('426px')
  act(() => state.observers[0].callback())
  expect(popup.setLngLat).toHaveBeenLastCalledWith([500, 380])
  view.unmount()
  expect(popup.remove).toHaveBeenCalledOnce()
  expect(state.markers[0].remove).toHaveBeenCalledOnce()
  expect(state.observers[0].disconnect).toHaveBeenCalledOnce()
  expect(map.off).toHaveBeenCalledWith('move', handlers.move)
  expect(map.off).toHaveBeenCalledWith('resize', handlers.resize)
})

it('keeps a wide mobile card within the viewport and leaves its arrow at the clicked coordinate', async () => {
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    observe=vi.fn();disconnect=vi.fn()
    constructor(callback: () => void) { this.callback=callback;state.observers.push(this) }
  })
  const container=document.createElement('div')
  Object.defineProperties(container,{clientHeight:{value:844},clientWidth:{value:390}})
  const map={getContainer:() => container,project:() => ({x:260,y:542}),on:vi.fn(),off:vi.fn()} as unknown as MapInstance
  render(<MapPopup map={map} coordinates={[105,25]}><div>Observation</div></MapPopup>)
  await waitFor(() => expect(state.popups).toHaveLength(1))
  const popup=state.popups[0]
  popup.content.getBoundingClientRect=() => ({width:320}) as DOMRect
  act(() => state.observers[0].callback())
  expect(popup.options.anchor).toBe('bottom')
  expect(popup.setOffset).toHaveBeenLastCalledWith([-42,-32])
  expect(popup.content.style.getPropertyValue('--popup-shift-x')).toBe('-42px')
})
