import { cellToLatLng } from 'h3-js'
import { describe, expect, it } from 'vitest'
import {
  exactOccurrenceFeature,
  mapCellFeature,
  speciesCellFeature,
  type ExactOccurrenceRow,
  type MapCellRow,
  type SpeciesCellRow,
} from './export-map-features.js'

describe('map feature export', () => {
  it('anchors aggregate features at the canonical H3 center', () => {
    const row = {
      dataset_version: 'test-v1',
      dataset_revision: '11111111-1111-4111-8111-111111111111',
      resolution: 5,
      cell_id: '85283473fffffff',
      longitude: 99,
      latitude: 88,
      representative_occurrence_id: '1',
      occurrence_count: '2',
      species_count: '1',
      image_count: '0',
      audio_count: '0',
      video_count: '0',
      aves_count: '0',
      insecta_count: '0',
      audio_occurrence_count: '0',
      first_year: null,
      last_year: null,
    } as MapCellRow
    const feature = mapCellFeature(row, 'test')
    const [latitude, longitude] = cellToLatLng(row.cell_id)
    expect(feature.geometry.coordinates).toEqual([longitude, latitude])
    expect(feature.geometry.coordinates).not.toEqual([99, 88])
    expect(feature.properties.dataset_version).toBe('test-v1')
    expect(feature.properties.dataset_revision).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('keeps high-zoom occurrence coordinates exact', () => {
    const feature = exactOccurrenceFeature({
      dataset_version: 'test-v1',
      dataset_revision: '11111111-1111-4111-8111-111111111111',
      resolution: 8,
      cell_id: '88283470d9fffff',
      representative_occurrence_id: '42',
      species_key: '9',
      scientific_name: 'Test species',
      class_name: 'Aves',
      longitude: 116.4,
      latitude: 39.9,
      occurrence_count: '1',
      species_count: '1',
      image_count: '1',
      audio_count: '0',
      video_count: '0',
      aves_count: '1',
      insecta_count: '0',
      audio_occurrence_count: '0',
    } as ExactOccurrenceRow, 'test')
    expect(feature.geometry.coordinates).toEqual([116.4, 39.9])
    expect(feature.tippecanoe.minzoom).toBe(15)
    expect(feature.properties.dataset_version).toBe('test-v1')
    expect(feature.properties.dataset_revision).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('anchors species-grid features at the canonical H3 center', () => {
    const row = {
      dataset_version: 'test-v1',
      dataset_revision: '11111111-1111-4111-8111-111111111111',
      resolution: 8,
      cell_id: '88283470d9fffff',
      species_key: '9',
      scientific_name: 'Test species',
      class_name: 'Aves',
      representative_occurrence_id: '42',
      occurrence_count: '3',
      image_count: '1',
      audio_count: '0',
      video_count: '0',
      first_year: 2020,
      last_year: 2026,
    } as SpeciesCellRow
    const feature = speciesCellFeature(row, 'test')
    const [latitude, longitude] = cellToLatLng(row.cell_id)
    expect(feature.geometry.coordinates).toEqual([longitude, latitude])
  })
})
