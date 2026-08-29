import { afterEach, describe, expect, it, vi } from 'vitest'
import { occurrenceApi } from './occurrenceApi.js'

afterEach(() => vi.unstubAllGlobals())

describe('occurrence API client', () => {
  it('encodes H3 cells and pagination filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, nextCursor: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await occurrenceApi.listCellOccurrences(8, 'cell/id', {
      limit: 25,
      cursor: 'next value',
      speciesKey: '42',
      filter: 'Aves',
    })

    const requestedUrl = new URL(fetchMock.mock.calls[0][0])
    expect(requestedUrl.pathname).toContain('/api/v1/cells/8/cell%2Fid/occurrences')
    expect(requestedUrl.searchParams.get('limit')).toBe('25')
    expect(requestedUrl.searchParams.get('filter')).toBe('Aves')
  })

  it('surfaces non-successful API responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(occurrenceApi.getMeta()).rejects.toThrow('503')
  })

  it('queries records that share one exact coordinate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, nextCursor: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await occurrenceApi.listCoordinateOccurrences('39.9', '116.4')
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toContain('/coordinates/39.9/116.4/occurrences')
  })
})
