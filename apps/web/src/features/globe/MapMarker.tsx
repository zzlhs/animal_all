import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type maplibregl from 'maplibre-gl'

interface MapMarkerProps {
  map: maplibregl.Map | null
  lngLat: [number, number]
  children: React.ReactNode
}

export function MapMarker({ map, lngLat, children }: MapMarkerProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    if (!map) return

    let disposed = false
    const target = document.createElement('div')
    target.className = 'map-marker-host'
    setElement(target)
    void import('maplibre-gl').then(({ Marker }) => {
      if (!disposed) markerRef.current = new Marker({ element: target, anchor: 'center', opacityWhenCovered: 0 }).setLngLat(lngLat).addTo(map)
    })

    return () => {
      disposed = true
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat)
    }
  }, [lngLat])

  return element ? createPortal(children, element) : null
}
