import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Map as MapInstance, Popup as MapLibrePopup, Marker } from 'maplibre-gl'
import { MapPopupConstants as C } from './popup.constants.js'

interface MapPopupProps {
  map: MapInstance | null
  coordinates: [number, number]
  onInteract?: () => void
  children: React.ReactNode
}

// Use the same map projection and movement lifecycle as the selected marker.
export function MapPopup({ map, coordinates, onInteract, children }: MapPopupProps) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const popup = useRef<MapLibrePopup | null>(null)
  const reposition = useRef<() => void>(() => {})
  const latestCoordinates = useRef(coordinates)
  latestCoordinates.current = coordinates

  useEffect(() => {
    if (!map) return
    let disposed = false
    let marker: Marker | null = null
    const content = document.createElement('div')
    content.className = 'map-occurrence-popup__content'
    const update = () => {
      const height = map.getContainer().clientHeight
      const point = map.project(latestCoordinates.current)
      const gap = C.EDGE_PADDING + C.MARKER_OFFSET + C.TIP_SIZE
      // Leave enough room above or below the pin for the entire measured panel.
      const available = Math.max(point.y - gap, height - point.y - gap)
      content.style.setProperty('--popup-max-height', `${Math.max(0, Math.min(height - C.EDGE_PADDING * 2, Math.floor(available)))}px`)
      const instance = popup.current
      if (instance) {
        const width = content.getBoundingClientRect().width
        const viewportWidth = map.getContainer().clientWidth
        const left = Math.max(C.EDGE_PADDING, Math.min(point.x - width / 2, viewportWidth - C.EDGE_PADDING - width))
        const shift = left + width / 2 - point.x
        const below = height - point.y >= point.y
        // Keep the arrow on the selected coordinate while clamping a wide card inside a narrow viewport.
        instance.options.anchor = below ? 'top' : 'bottom'
        instance.getElement().style.setProperty('--popup-shift-x', `${shift}px`)
        instance.setOffset([shift, below ? C.MARKER_OFFSET : -C.MARKER_OFFSET])
      }
      popup.current?.setLngLat(latestCoordinates.current)
      marker?.setLngLat(latestCoordinates.current)
    }
    const observer = new ResizeObserver(update)
    reposition.current = update
    observer.observe(content)
    map.on('resize', update)
    map.on('move', update)
    setTarget(content)
    void import('maplibre-gl').then(({ Popup, Marker }) => {
      if (disposed) return
      const location = document.createElement('div')
      location.className = 'map-selected-location'
      location.setAttribute('aria-hidden', 'true')
      location.style.width = location.style.height = `${C.SELECTED_MARKER_SIZE}px`
      marker = new Marker({ element: location, anchor: 'center', opacityWhenCovered: 0 })
        .setLngLat(latestCoordinates.current).addTo(map)
      popup.current = new Popup({
        className: 'map-occurrence-popup',
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        maxWidth: 'none',
        offset: C.MARKER_OFFSET,
        padding: { top: C.EDGE_PADDING, right: C.EDGE_PADDING, bottom: C.EDGE_PADDING, left: C.EDGE_PADDING },
        subpixelPositioning: true,
        locationOccludedOpacity: 0,
      }).setDOMContent(content).setLngLat(latestCoordinates.current).addTo(map)
      update()
    })
    return () => {
      disposed = true
      observer.disconnect()
      map.off('resize', update)
      map.off('move', update)
      popup.current?.remove()
      marker?.remove()
      popup.current = null
      reposition.current = () => {}
    }
  }, [map])

  useEffect(() => { reposition.current() }, [coordinates[0], coordinates[1]])

  return target ? createPortal(<div onPointerDown={onInteract}>{children}</div>, target) : null
}
