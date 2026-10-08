import type { PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { abortDatasetImport, beginDatasetImport, finalizeDatasetImport, upsertSpecies } from './import-repository.js'

function statementText(statement: unknown) {
  return String(statement).replace(/\s+/g, ' ').trim()
}

describe('dataset import promotion', () => {
  it('does not update shared taxonomy while rows are still staged', async () => {
    const statements: string[] = []
    const client = {
      query: vi.fn(async (statement: unknown) => {
        statements.push(statementText(statement))
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as PoolClient

    await upsertSpecies(client, [{
      speciesKey: '1',
      scientificName: 'Example species',
      acceptedScientificName: '',
      kingdom: 'Animalia',
      phylum: '',
      className: '',
      orderName: '',
      family: '',
      genus: '',
      taxonRank: 'SPECIES',
    }])

    expect(statements[0]).toContain('ON CONFLICT (species_key) DO NOTHING')
    expect(statements[0]).not.toContain('DO UPDATE SET')
  })

  it('keeps the old version until a ready staged dataset is promoted', async () => {
    const statements: Array<{ sql: string; values: readonly unknown[] }> = []
    const client = {
      query: vi.fn(async (statement: unknown, values: readonly unknown[] = []) => {
        const sql = statementText(statement)
        statements.push({ sql, values })
        if (sql.startsWith('SELECT id::text FROM datasets WHERE version')) return { rows: [{ id: '10' }] }
        if (sql.startsWith('INSERT INTO datasets')) return { rows: [{ id: '20' }] }
        if (sql.startsWith('UPDATE datasets SET version = $2')) return { rows: [{ id: '20' }] }
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as PoolClient

    const handle = await beginDatasetImport(client, 'release-v1', 'archive.zip', 'Animalia', true)
    expect(handle).toMatchObject({ id: '20', targetVersion: 'release-v1', stagingVersion: 'release-v1.__staging__' })
    expect(statements.some(item => item.sql === 'DELETE FROM datasets WHERE id = $1')).toBe(false)

    await finalizeDatasetImport(client, handle)

    const retireIndex = statements.findIndex(item => item.sql.includes("status = 'retired'"))
    const taxonomyIndex = statements.findIndex(item => item.sql.includes('WITH dataset_species AS'))
    const promoteIndex = statements.findIndex(item => item.sql.includes("status = 'ready' AND plottable_count > 0"))
    expect(retireIndex).toBeGreaterThan(-1)
    expect(taxonomyIndex).toBeGreaterThan(retireIndex)
    expect(promoteIndex).toBeGreaterThan(taxonomyIndex)
    expect(statements.at(-1)?.sql).toContain('pg_advisory_unlock')
  })

  it('deletes only the staged dataset when an import is aborted', async () => {
    const statements: Array<{ sql: string; values: readonly unknown[] }> = []
    const client = {
      query: vi.fn(async (statement: unknown, values: readonly unknown[] = []) => {
        const sql = statementText(statement)
        statements.push({ sql, values })
        if (sql.startsWith('SELECT id::text FROM datasets WHERE version')) return { rows: [] }
        if (sql.startsWith('INSERT INTO datasets')) return { rows: [{ id: '20' }] }
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as PoolClient

    const handle = await beginDatasetImport(client, 'release-v2', 'archive.zip', 'Animalia', false)
    await abortDatasetImport(client, handle)

    expect(statements.some(item => item.sql === 'DELETE FROM datasets WHERE id = $1 AND version = $2'
      && item.values[0] === '20' && item.values[1] === 'release-v2.__staging__')).toBe(true)
    expect(statements.at(-1)?.sql).toContain('pg_advisory_unlock')
  })

  it('rejects an existing version without replace before creating staging data', async () => {
    const statements: string[] = []
    const client = {
      query: vi.fn(async (statement: unknown) => {
        const sql = statementText(statement)
        statements.push(sql)
        if (sql.startsWith('SELECT id::text FROM datasets WHERE version')) return { rows: [{ id: '10' }] }
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as PoolClient

    await expect(beginDatasetImport(client, 'release-v3', 'archive.zip', 'Animalia', false))
      .rejects.toThrow('pass --replace')
    expect(statements.some(sql => sql.startsWith('INSERT INTO datasets'))).toBe(false)
    expect(statements.at(-1)).toContain('pg_advisory_unlock')
  })
})
