import { describe, expect, it } from 'vitest'
import { ApiConstants } from '../config/api.constants.js'
import { normalizePageSize } from './page.js'

describe('page size normalization', () => {
  it('uses the default for invalid values', () => {
    expect(normalizePageSize(undefined)).toBe(ApiConstants.DEFAULT_PAGE_SIZE)
    expect(normalizePageSize('0')).toBe(ApiConstants.DEFAULT_PAGE_SIZE)
  })

  it('caps large page sizes', () => {
    expect(normalizePageSize('1000')).toBe(ApiConstants.MAX_PAGE_SIZE)
  })
})
