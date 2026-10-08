import { cellToLatLng } from 'h3-js'

export const H3ResolutionZoomMap = Object.freeze([
  { resolution: 2, minZoom: 0, maxZoom: 2.99 },
  { resolution: 3, minZoom: 3, maxZoom: 4.99 },
  { resolution: 4, minZoom: 5, maxZoom: 6.99 },
  { resolution: 5, minZoom: 7, maxZoom: 8.99 },
  { resolution: 6, minZoom: 9, maxZoom: 10.99 },
  { resolution: 7, minZoom: 11, maxZoom: 12.99 },
  { resolution: 8, minZoom: 13, maxZoom: 14.99 },
])

export function getResolutionForZoom(zoom: number): number {
  if (zoom >= 13) return 8
  if (zoom >= 11) return 7
  if (zoom >= 9) return 6
  if (zoom >= 7) return 5
  if (zoom >= 5) return 4
  if (zoom >= 3) return 3
  return 2
}

export function isCoordinateLevelZoom(zoom: number): boolean {
  return zoom >= 15
}

export function getCanonicalCellCenter(cellId: string): [longitude: number, latitude: number] {
  const [lat, lng] = cellToLatLng(cellId)
  return [lng, lat]
}
