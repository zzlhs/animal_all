import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareDetailAudio, resolveAudioForPlayback } from './audioCache.js'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('persistent audio preparation client', () => {
  it('enqueues details without downloading a source file', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ jobs: [], configured: true }, { status: 202 }))
    vi.stubGlobal('fetch', fetcher)
    await prepareDetailAudio(['1231'])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ priority: 'detail', mediaIds: ['1231'] })
  })
  it('promotes a queued job and returns its ImageKit URL without fetching its full body', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ jobs: [{ id: '1', status: 'downloading' }], configured: true }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ job: { id: '1', status: 'ready', playbackUrl: 'https://ik.imagekit.io/test/a.mp3' }, configured: true }))
    vi.stubGlobal('fetch', fetcher)
    const prepared = resolveAudioForPlayback('https://xeno-canto.org/a.mp3', undefined, undefined, { mediaId: '1231', retry: true })
    await vi.advanceTimersByTimeAsync(1001)
    expect(await prepared).toEqual({ url: 'https://ik.imagekit.io/test/a.mp3', cacheHit: false, cacheStored: true })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ priority: 'playback', retry: true })
    expect(fetcher.mock.calls[1][0]).toBe('/api/audio/jobs?id=1')
  })
  it('reports missing configuration while retaining the server task', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jobs: [{ id: '1', status: 'queued' }], configured: false }, { status: 202 })))
    await expect(resolveAudioForPlayback('https://xeno-canto.org/a.mp3')).rejects.toMatchObject({ code: 'IMAGEKIT_NOT_CONFIGURED' })
  })
  it('plays an existing uploaded recording even when credentials are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jobs: [{ id: '1', status: 'ready', playbackUrl: 'https://ik.imagekit.io/test/a.mp3' }], configured: false }, { status: 202 })))
    expect((await resolveAudioForPlayback('https://xeno-canto.org/a.mp3')).cacheHit).toBe(true)
  })
})
