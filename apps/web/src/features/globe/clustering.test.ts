import { describe, expect, it } from 'vitest'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { clusterOccurrences } from './clustering.js'
const record = (id: string, longitude: number) => ({ gbifId: id, decimalLatitude: 25, decimalLongitude: longitude }) as OccurrenceRecord
describe('bounded photo marker clustering', () => {
  it('keeps connected observations together and preserves representative order', () => {
    const records = [record('2', 105), record('1', 105.015), record('3', 105.03), record('4', 108)]
    const clusters = clusterOccurrences(records, 10)
    expect(clusters.map(c => c.records.map(r => r.gbifId))).toEqual([['2','1','3'],['4']])
    expect(clusters[0].coordinates[0]).toBeCloseTo(105.015)
    expect(clusters[0].coordinates[1]).toBe(25)
  })
  it('preserves every observation at exact zoom even at identical coordinates', () => {
    const records = [record('1', 105), record('2', 105)]
    const clusters = clusterOccurrences(records, 15)
    expect(clusters).toHaveLength(2)
    expect(clusters.map(c => c.id)).toEqual(['1','2'])
  })
})
