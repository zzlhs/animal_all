import type { FilterType, OccurrenceRecord } from '@gbif-globe/contracts'
import type { Map as MapInstance } from 'maplibre-gl'
import { countProperty, featureContainsRecord, featureIdentity, type SelectedFeature } from './features.js'
import { GlobeLoadingConstants as C } from './loading.constants.js'

export interface ScreenItem<T> { id: string; coordinates: [number, number]; count: number; priority?: boolean; item: T }
interface ScreenArea { left: number; top: number; right: number; bottom: number }
interface MarkerViewport {
  width: number
  height: number
  zoom: number
  project: (coordinate: [number, number]) => { x: number; y: number }
  blockedAreas?: ScreenArea[]
}
export function markerBudget(zoom: number) {
  return zoom < C.GLOBAL_ZOOM ? C.GLOBAL_MARKER_LIMIT : zoom < C.LOCAL_ZOOM ? C.REGIONAL_MARKER_LIMIT : C.LOCAL_MARKER_LIMIT
}
export function photoBudget(zoom: number) {
  return zoom < C.GLOBAL_ZOOM ? C.GLOBAL_PHOTO_LIMIT : zoom < C.LOCAL_ZOOM ? C.REGIONAL_PHOTO_LIMIT : C.LOCAL_PHOTO_LIMIT
}
export function layoutScreenItems<T>(items: ScreenItem<T>[], view: MarkerViewport) {
  const seen = new Set<string>()
  const candidates = items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true })
    .map(item => ({ ...item, point: view.project(item.coordinates) }))
    .filter(({ point: { x, y } }) => Number.isFinite(x) && Number.isFinite(y) && x >= C.VIEWPORT_PADDING && y >= C.VIEWPORT_PADDING && x <= view.width - C.VIEWPORT_PADDING && y <= view.height - C.VIEWPORT_PADDING)
    .filter(({ point: { x, y } }) => !view.blockedAreas?.some(area => x >= area.left - C.CONTROL_CLEARANCE && x <= area.right + C.CONTROL_CLEARANCE && y >= area.top - C.CONTROL_CLEARANCE && y <= area.bottom + C.CONTROL_CLEARANCE))
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || b.count - a.count || a.id.localeCompare(b.id))
  const cells = new Map<string, Array<{ x: number; y: number }>>()
  const picked: T[] = []
  for (const candidate of candidates) {
    if (picked.length >= markerBudget(view.zoom)) break
    const { x, y } = candidate.point, col = Math.floor(x / C.MARKER_SPACING), row = Math.floor(y / C.MARKER_SPACING)
    let collision = false
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (cells.get(`${col + dx}:${row + dy}`)?.some(other => Math.hypot(other.x - x, other.y - y) < C.MARKER_SPACING)) collision = true
    }
    if (collision && !candidate.priority) continue
    const key = `${col}:${row}`, cell = cells.get(key) || []
    cell.push(candidate.point); cells.set(key, cell); picked.push(candidate.item)
  }
  return picked
}
export function markerViewport(map: MapInstance): MarkerViewport {
  const container = map.getContainer()
  const bounds = container.getBoundingClientRect?.()
  const controls = container.closest?.('.globe-page')?.querySelectorAll<HTMLElement>(C.CONTROL_SELECTOR)
  const blockedAreas = bounds && controls ? Array.from(controls).map(control => control.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => ({ left: rect.left - bounds.left, top: rect.top - bounds.top, right: rect.right - bounds.left, bottom: rect.bottom - bounds.top })) : []
  return { width: container.clientWidth, height: container.clientHeight, zoom: map.getZoom(), project: coordinate => map.project(coordinate), blockedAreas }
}
export function layoutMapFeatures(features: SelectedFeature[], map: MapInstance, filter: FilterType, priorityIds: string[] = [], priorityRecord?: OccurrenceRecord | null) {
  const priority = new Set(priorityIds)
  return layoutScreenItems(features.map(feature => ({ id: featureIdentity(feature), coordinates: feature.coordinates,
    count: feature.properties.kind === 'species' && (filter === 'Aves' || filter === 'Insecta') ? feature.properties.occurrence_count : Number(feature.properties[countProperty(filter)] || 0),
    priority: priority.has(featureIdentity(feature)) || Boolean(priorityRecord && featureContainsRecord(feature, priorityRecord)), item: feature })),
  markerViewport(map))
}

// The invisible candidate layer keeps all loaded features queryable. Only picked features are painted.
export function mapFeatureFilter(feature: SelectedFeature) {
  const p = feature.properties
  return ['all', ['==', ['get', 'kind'], p.kind], ['==', ['get', 'cell_id'], p.cell_id],
    ...(p.species_key != null ? [['==', ['get', 'species_key'], p.species_key]] : []),
    ...(p.exact_latitude != null ? [['==', ['get', 'exact_latitude'], p.exact_latitude], ['==', ['get', 'exact_longitude'], p.exact_longitude]] : [])]
}
