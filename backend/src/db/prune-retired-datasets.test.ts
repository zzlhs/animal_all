import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from './pool.js'
import { pruneRetiredDatasets } from './prune-retired-datasets.js'

describe('retired dataset pruning', () => {
  it('uses bounded, age-gated deletion', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    await pruneRetiredDatasets({ query } as unknown as DatabaseClient, 30, 5)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'retired'"),
      [30, 5],
    )
    expect(query.mock.calls[0]![0]).toContain('FOR UPDATE SKIP LOCKED')
    expect(query.mock.calls[0]![0]).toContain('LIMIT $2')
  })
})
