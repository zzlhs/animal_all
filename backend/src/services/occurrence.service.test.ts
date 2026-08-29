import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../db/pool.js'
import { getOccurrence, listCellOccurrences } from './occurrence.service.js'

describe('occurrence snapshot consistency', () => {
  it('loads media by the dataset id selected with the occurrence', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          dataset_id: '77',
          gbif_id: '42',
          scientific_name: 'Test species',
          latitude: 39.9,
          longitude: 116.4,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
    const occurrence = await getOccurrence(
      { query } as unknown as DatabaseClient,
      'release-v1',
      '42',
    )

    expect(occurrence?.gbifID).toBe('42')
    expect(query.mock.calls[1]![0]).toContain('WHERE m.dataset_id = $1::bigint')
    expect(query.mock.calls[1]![1]).toEqual(['77', ['42']])
  })

  it('uses precomputed cell totals instead of recounting a dense aggregate', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ total_count: '1000000' }] })
      .mockResolvedValueOnce({ rows: [] })

    const page = await listCellOccurrences(
      { query } as unknown as DatabaseClient,
      'release-v1',
      2,
      '82754ffffffffff',
      20,
    )

    expect(page).toEqual({ items: [], total: 1_000_000, nextCursor: null })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]![0]).toContain('FROM map_cells mc')
    expect(query.mock.calls[0]![0]).toContain('mc.occurrence_count')
    expect(query.mock.calls[1]![0]).toContain('FROM occurrences o')
  })
})
