import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor.js'

describe('cursor encoding', () => {
  it('round-trips a numeric identifier stored as a string', () => {
    const encoded = encodeCursor({ id: '6360481313' })
    expect(decodeCursor(encoded)).toEqual({ id: '6360481313' })
  })

  it('rejects malformed cursors', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull()
    expect(decodeCursor(encodeCursor({ id: 'not-numeric' }))).toBeNull()
    expect(decodeCursor(undefined)).toBeNull()
  })
})
