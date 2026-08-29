import { describe, expect, it } from 'vitest'
import { createColumnMap } from './dwca-reader.js'
import { parseMediaRow, parseOccurrenceRow } from './dwca-records.js'

function rowFrom(values: Record<string, string>) {
  const header = Object.keys(values)
  return {
    columns: createColumnMap(header),
    row: header.map(name => values[name] ?? ''),
  }
}

describe('DWCA record parsing', () => {
  it('keeps Animalia records and precomputes stable H3 cells', () => {
    const input = rowFrom({
      gbifID: '6360481313',
      occurrenceID: 'urn:uuid:test',
      scientificName: 'Panthera pardus',
      acceptedScientificName: 'Panthera pardus (Linnaeus, 1758)',
      species: 'Panthera pardus',
      speciesKey: '5219404',
      kingdom: 'Animalia',
      decimalLatitude: '39.9',
      decimalLongitude: '116.4',
    })
    const record = parseOccurrenceRow(input.row, input.columns, 'Animalia')
    expect(record?.gbifId).toBe('6360481313')
    expect(record?.speciesKey).toBe('5219404')
    expect(record?.h3[5]).toMatch(/^85/)
  })

  it('filters records outside the selected kingdom', () => {
    const input = rowFrom({ gbifID: '1', scientificName: 'Quercus robur', kingdom: 'Plantae' })
    expect(parseOccurrenceRow(input.row, input.columns, 'Animalia')).toBeNull()
  })

  it('uses the first available media URL', () => {
    const input = rowFrom({
      gbifID: '6360481313',
      type: 'Sound',
      format: 'audio/mpeg',
      identifier: 'https://example.test/audio.mp3',
      references: 'https://example.test/record',
    })
    expect(parseMediaRow(input.row, input.columns)?.identifier).toBe('https://example.test/audio.mp3')
  })

  it('rejects unsafe media protocols and falls back to another HTTP source', () => {
    const input = rowFrom({
      gbifID: '6360481313',
      type: 'StillImage',
      identifier: 'javascript:alert(1)',
      references: 'https://example.test/safe-image.jpg',
    })
    const media = parseMediaRow(input.row, input.columns)
    expect(media?.identifier).toBe('https://example.test/safe-image.jpg')
    expect(media?.sourceUrl).toBe('')
  })
})
