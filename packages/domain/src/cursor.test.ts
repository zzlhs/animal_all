import { describe, it, expect } from 'vitest'
import {
  computeScopeHash,
  encodeCursor,
  decodeCursor,
} from './cursor.js'

describe('Domain Cursors', () => {
  it('encodes and decodes cursor matching scope hash', () => {
    const scopeHash = computeScopeHash(['11111111-1111-4111-8111-111111111111', 8, '882d572ffffffff', 'all'])
    const cursor = encodeCursor({
      v: 2,
      revision: '11111111-1111-4111-8111-111111111111',
      scopeHash,
      order: 'gbifId:asc',
      lastId: '987654321',
    })

    expect(typeof cursor).toBe('string')
    const decoded = decodeCursor(cursor, scopeHash)
    expect(decoded.lastId).toBe('987654321')
    expect(decoded.revision).toBe('11111111-1111-4111-8111-111111111111')
    expect(decoded.v).toBe(2)
  })

  it('rejects cursor when scope hash does not match (different filter or cell)', () => {
    const scopeHashA = computeScopeHash(['11111111-1111-4111-8111-111111111111', 8, 'cell-A', 'all'])
    const scopeHashB = computeScopeHash(['11111111-1111-4111-8111-111111111111', 8, 'cell-B', 'all'])

    const cursor = encodeCursor({
      v: 2,
      revision: '11111111-1111-4111-8111-111111111111',
      scopeHash: scopeHashA,
      order: 'gbifId:asc',
      lastId: '987654321',
    })

    expect(() => decodeCursor(cursor, scopeHashB)).toThrow('Cursor does not match query scope')
  })

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-valid-cursor-string', 'scope')).toThrow()
  })
})

it('rejects missing scope, unsafe IDs, version downgrade and missing order', () => {
  const valid = { v: 2, revision: '11111111-1111-4111-8111-111111111111', scopeHash: 'a'.repeat(64), order: 'gbifId:asc', lastId: '1' }
  for (const change of [{ scopeHash: undefined }, { lastId: '9223372036854775808' }, { lastId: 'abc' }, { v: 1 }, { order: undefined }]) {
    const cursor = Buffer.from(JSON.stringify({ ...valid, ...change })).toString('base64url')
    expect(() => decodeCursor(cursor, valid.scopeHash)).toThrow()
  }
})
