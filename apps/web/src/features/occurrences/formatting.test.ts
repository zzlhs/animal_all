import { describe, it, expect } from 'vitest'
import {
  formatLocation,
  formatEnglishLocation,
  formatEventDate,
} from './formatting.js'

describe('Formatting Helpers', () => {
  it('formats location in Chinese with country, state, and locality', () => {
    const locZh = formatLocation(
      {
        country: '中国',
        countryCode: 'CN',
        stateProvince: '浙江省',
        locality: '杭州市西湖区',
      },
      'zh',
    )
    expect(locZh).toContain('杭州市西湖区')
    expect(locZh).toContain('浙江省')
  })

  it('formats location in English', () => {
    const locEn = formatEnglishLocation({
      country: 'Japan',
      countryCode: 'JP',
      stateProvince: 'Tokyo',
      locality: 'Shinjuku',
    })
    expect(locEn).toContain('Shinjuku')
    expect(locEn).toContain('Tokyo')
  })

  it('handles empty location gracefully', () => {
    expect(formatLocation({}, 'zh')).toBe('位置未知')
    expect(formatLocation({}, 'en')).toBe('Location unavailable')
  })

  it('formats event date with localization', () => {
    expect(formatEventDate('2024-05-15', 'zh')).toContain('2024')
    expect(formatEventDate('2024-05-15', 'en')).toContain('2024')
    expect(formatEventDate('', 'en')).toBe('')
  })
})
