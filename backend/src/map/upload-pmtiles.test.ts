import { describe, expect, it } from 'vitest'
import { validateObjectKey } from './upload-pmtiles.js'

describe('PMTiles object keys', () => {
  it('requires an explicit PMTiles key', () => {
    expect(() => validateObjectKey('')).toThrow('--key is required')
    expect(() => validateObjectKey('maps/release-v1.bin')).toThrow('--key must end with .pmtiles')
  })

  it('normalizes a versioned PMTiles key', () => {
    expect(validateObjectKey('/maps/release-v1.pmtiles')).toBe('maps/release-v1.pmtiles')
  })
})
