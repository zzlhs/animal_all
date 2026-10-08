import { describe, it, expect } from 'vitest'
import {
  listQuerySchema,
  cellOccurrencesParamsSchema,
  coordinateOccurrencesParamsSchema,
  occurrenceParamsSchema,
  cursorSchema,
} from './schemas.js'

describe('Contracts Zod Schemas', () => {
  it('validates list query schema with optional fields and bounds', () => {
    const parsed = listQuerySchema.parse({ limit: '50' })
    expect(parsed.limit).toBe(50)

    const withFilter = listQuerySchema.parse({ limit: '20', filter: 'Aves' })
    expect(withFilter.filter).toBe('Aves')

    expect(() => listQuerySchema.parse({ limit: '500' })).toThrow()
    expect(() => listQuerySchema.parse({ filter: 'Reptilia' })).toThrow()
  })

  it('validates cell occurrences params schema within 2 to 8', () => {
    expect(cellOccurrencesParamsSchema.parse({ resolution: '2', cellId: '822d57fffffffff' }).resolution).toBe(2)
    expect(cellOccurrencesParamsSchema.parse({ resolution: '8', cellId: '882d572ffffffff' }).resolution).toBe(8)
    expect(() => cellOccurrencesParamsSchema.parse({ resolution: '1', cellId: '822d57fffffffff' })).toThrow()
    expect(() => cellOccurrencesParamsSchema.parse({ resolution: '9', cellId: '822d57fffffffff' })).toThrow()
  })

  it('validates coordinate occurrences params schema bounds', () => {
    const valid = coordinateOccurrencesParamsSchema.parse({ latitude: '39.9042', longitude: '116.4074' })
    expect(valid.latitude).toBeCloseTo(39.9042)
    expect(valid.longitude).toBeCloseTo(116.4074)

    expect(() => coordinateOccurrencesParamsSchema.parse({ latitude: '91', longitude: '0' })).toThrow()
    expect(() => coordinateOccurrencesParamsSchema.parse({ latitude: '0', longitude: '181' })).toThrow()
  })

  it('validates occurrence params schema gbifId format', () => {
    expect(occurrenceParamsSchema.parse({ gbifId: '123456789' }).gbifId).toBe('123456789')
    expect(() => occurrenceParamsSchema.parse({ gbifId: 'abc' })).toThrow()
    expect(() => occurrenceParamsSchema.parse({ gbifId: '-123' })).toThrow()
  })

  it('validates cursor schema', () => {
    const valid = cursorSchema.parse({
      v: 2,
      revision: '4e9c0fd0-df84-4551-8dc4-97de5a3c226f',
      scopeHash: 'a'.repeat(64),
      order: 'gbifId:asc',
      lastId: '123456789',
    })
    expect(valid.v).toBe(2)
    expect(valid.lastId).toBe('123456789')
  })
})
