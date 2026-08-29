import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient, DatabaseTransactionClient } from './pool.js'
import { withReadSnapshot } from './pool.js'

describe('read snapshots', () => {
  it('runs a multi-query operation on one repeatable-read client', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    const release = vi.fn()
    const client = { query, release } as unknown as DatabaseTransactionClient
    const database = { connect: vi.fn().mockResolvedValue(client) } as unknown as DatabaseClient

    await withReadSnapshot(database, async snapshot => {
      await snapshot.query('SELECT 1')
      await snapshot.query('SELECT 2')
      return 'done'
    })

    expect(query.mock.calls.map(call => call[0])).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SELECT 1',
      'SELECT 2',
      'COMMIT',
    ])
    expect(release).toHaveBeenCalledOnce()
  })
})
