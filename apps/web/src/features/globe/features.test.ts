import { describe, expect, it } from 'vitest'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { featurePath, selectionCoordinates, type SelectedFeature } from './features.js'
const feature = (properties: Record<string, unknown>) => ({ properties: { dataset_revision: 'revision', cell_id: 'cell', resolution: 8, ...properties }, coordinates: [0, 0] }) as SelectedFeature

describe('map feature requests', () => {
  it('uses exact coordinate attributes including zero, never quantized geometry', () => {
    const path = featurePath(feature({ kind: 'coordinate', exact_latitude: '0', exact_longitude: '0.00000017' }), 'audio', 'cursor')
    expect(path).toContain('/coordinates/0/0.00000017/')
    expect(path).toContain('filter=audio')
    expect(path).toContain('cursor=cursor')
  })
  it('keeps species and unknown-species queries disjoint', () => {
    expect(featurePath(feature({ kind: 'species', species_key: '10' }), 'Aves')).toContain('speciesKey=10')
    expect(featurePath(feature({ kind: 'unclassified' }), 'all')).toContain('unknownSpecies=true')
  })
})

describe('selection popup anchor', () => {
  const record = { decimalLongitude: 115.5037, decimalLatitude: 38.8616 } as OccurrenceRecord
  it('keeps a detail attached to its clicked vector marker instead of moving to the representative record', () => {
    const marker = { ...feature({ kind: 'cluster' }), coordinates: [110, 30] as [number, number] }
    expect(selectionCoordinates(marker, null, record)).toEqual([110, 30])
  })
  it('keeps a sample cluster anchor when choosing one of its records', () => {
    expect(selectionCoordinates(null, { coordinates: [120, 25] }, record)).toEqual([120, 25])
  })
  it('uses recording coordinates for direct audio location and rejects missing coordinates', () => {
    expect(selectionCoordinates(null, null, record)).toEqual([115.5037, 38.8616])
    expect(selectionCoordinates(null, null, { decimalLongitude: null, decimalLatitude: null } as unknown as OccurrenceRecord)).toBeNull()
    expect(selectionCoordinates(null, null, null)).toBeNull()
  })
})
