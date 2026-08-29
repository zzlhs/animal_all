import { describe, expect, it } from 'vitest'
import { mediaUrl } from './useOccurrenceMedia.js'

describe('occurrence media URLs', () => {
  it('allows HTTP media and rejects executable protocols', () => {
    expect(mediaUrl({ identifier: 'https://example.test/photo.jpg' })).toBe('https://example.test/photo.jpg')
    expect(mediaUrl({ identifier: 'javascript:alert(1)' })).toBe('')
    expect(mediaUrl({ identifier: 'javascript:alert(1)', references: 'https://example.test/fallback.jpg' }))
      .toBe('https://example.test/fallback.jpg')
  })
})
