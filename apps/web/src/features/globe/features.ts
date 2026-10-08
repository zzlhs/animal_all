import type { FilterType, MapFeatureProperties, OccurrenceRecord } from '@gbif-globe/contracts'
import { latLngToCell } from 'h3-js'
export interface SelectedFeature { properties: MapFeatureProperties; coordinates: [number, number] }
export type FeatureInteraction = 'hover' | 'click'
export function selectionCoordinates(feature: SelectedFeature | null, cluster: { coordinates: [number, number] } | null, record: OccurrenceRecord | null): [number, number] | null {
  // Keep a detail selected from a cluster attached to the marker the user opened.
  if (feature) return feature.coordinates
  if (cluster) return cluster.coordinates
  if (record && Number.isFinite(record.decimalLongitude) && Number.isFinite(record.decimalLatitude)) return [record.decimalLongitude, record.decimalLatitude]
  return null
}
export function featureContainsRecord(feature: SelectedFeature, record: OccurrenceRecord) {
  const p = feature.properties
  if (p.kind === 'coordinate') return Number(p.exact_latitude) === record.decimalLatitude && Number(p.exact_longitude) === record.decimalLongitude
  if (p.kind === 'species' && p.species_key !== record.speciesKey) return false
  if (p.kind === 'unclassified' && record.speciesKey) return false
  return latLngToCell(record.decimalLatitude, record.decimalLongitude, p.resolution) === p.cell_id
}
export function featureIdentity(feature: SelectedFeature) {
  const p = feature.properties
  return JSON.stringify([p.dataset_revision, p.kind, p.resolution, p.cell_id, p.species_key, p.exact_latitude, p.exact_longitude])
}
export function featurePath(feature: SelectedFeature, filter: FilterType, cursor?: string | null) {
  const p = feature.properties
  const query = new URLSearchParams({ revision: p.dataset_revision, filter, limit: '20' })
  if (cursor) query.set('cursor', cursor)
  let path: string
  if (p.kind === 'coordinate') {
    if (p.exact_latitude == null || p.exact_longitude == null) throw new Error('Missing original coordinates')
    path = `/api/v1/coordinates/${encodeURIComponent(p.exact_latitude)}/${encodeURIComponent(p.exact_longitude)}/occurrences`
  } else {
    path = `/api/v1/cells/${p.resolution}/${encodeURIComponent(p.cell_id)}/occurrences`
    if (p.kind === 'species' && p.species_key) query.set('speciesKey', p.species_key)
    if (p.kind === 'unclassified') query.set('unknownSpecies', 'true')
  }
  return `${path}?${query}`
}
export function countProperty(filter: FilterType) {
  return filter === 'Aves' ? 'aves_count' : filter === 'Insecta' ? 'insecta_count' : filter === 'audio' ? 'audio_occurrence_count' : 'occurrence_count'
}
