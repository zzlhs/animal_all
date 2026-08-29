import { describe, expect, it, vi } from 'vitest'
import { mediaKind, mediaKindSql, retryAt } from './sync-imagekit.js'

describe('ImageKit sync queue helpers', () => {
  it('classifies supported media without relying on URL extensions', () => {
    expect(mediaKind({ format: 'audio/mpeg', media_type: null })).toBe('audio')
    expect(mediaKind({ format: '', media_type: 'MovingImage' })).toBe('video')
  })

  it('builds a SQL filter only for enabled media kinds', () => {
    const sql = mediaKindSql(new Set(['audio']))
    expect(sql).toContain("LIKE 'audio/%'")
    expect(sql).not.toContain("LIKE 'image/%'")
  })

  it('uses bounded exponential retry delays', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T00:00:00Z'))
    expect(retryAt(3, 60).toISOString()).toBe('2026-08-27T00:04:00.000Z')
    expect(retryAt(20, 60).toISOString()).toBe('2026-08-28T00:00:00.000Z')
    vi.useRealTimers()
  })
})
