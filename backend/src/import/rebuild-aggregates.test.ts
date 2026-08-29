import type { PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { rebuildAggregates } from './rebuild-aggregates.js'

describe('aggregate rebuild', () => {
  it('materializes media counts once and avoids collecting every geometry', async () => {
    const statements: string[] = []
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(statement)
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as PoolClient

    await rebuildAggregates(client, '42', 8)

    expect(statements[0]).toBe('BEGIN')
    expect(statements.at(-1)).toBe('COMMIT')
    expect(statements.filter(statement => statement.includes('CREATE TEMP TABLE aggregate_media_counts'))).toHaveLength(1)
    expect(statements.some(statement => statement.includes('ANALYZE aggregate_media_counts'))).toBe(true)
    expect(statements.join('\n')).not.toContain('ST_Collect')
    expect(statements.filter(statement => statement.includes('INSERT INTO map_cells'))).toHaveLength(6)
    expect(statements.filter(statement => statement.includes('INSERT INTO species_cells'))).toHaveLength(1)
  })
})
