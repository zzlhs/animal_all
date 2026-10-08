import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllowedAudioStream, parseAndValidateAudioUrl } from './audioProxy.js'
import { downloadAudio, AudioDownloadWorker } from './audioWorker.js'

const cloud = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@imagekit/nodejs', () => ({ default: class { files = { upload: cloud.upload } },
  toFile: async (bytes: Buffer, name: string) => ({ bytes, name }) }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks() })

function slowBody(interval: number, count: number) {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    let timer: ReturnType<typeof setInterval>, sent = 0
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        timer = setInterval(() => {
          controller.enqueue(new Uint8Array([++sent]))
          if (sent === count) { clearInterval(timer); controller.close() }
        }, interval)
        init.signal.addEventListener('abort', () => { clearInterval(timer); controller.error(init.signal.reason) }, { once: true })
      }, cancel() { clearInterval(timer) },
    }), { headers: { 'content-type': 'audio/mpeg' } })
  }))
}
describe('audio transfer deadlines', () => {
  it('times out waiting for response headers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))))
    const transfer = expect(downloadAudio('https://xeno-canto.org/a.mp3', { firstResponseTimeoutMs: 20, totalTimeoutMs: 100 })).rejects.toMatchObject({ code: 'FIRST_RESPONSE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(21); await transfer
  })
  it('allows an active download to continue after the header deadline', async () => {
    vi.useFakeTimers(); slowBody(10, 5)
    const transfer = downloadAudio('https://xeno-canto.org/a.mp3', { firstResponseTimeoutMs: 20, idleTimeoutMs: 30, totalTimeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(51)
    expect((await transfer).size).toBe(5)
  })
  it('times out only when the body stops delivering bytes', async () => {
    vi.useFakeTimers(); slowBody(100, 1)
    const transfer = expect(downloadAudio('https://xeno-canto.org/a.mp3', { idleTimeoutMs: 30, totalTimeoutMs: 200 })).rejects.toMatchObject({ code: 'IDLE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(31); await transfer
  })
  it('enforces a separate overall deadline even when bytes keep arriving', async () => {
    vi.useFakeTimers(); slowBody(10, 20)
    const transfer = expect(downloadAudio('https://xeno-canto.org/a.mp3', { idleTimeoutMs: 30, totalTimeoutMs: 45 })).rejects.toMatchObject({ code: 'TOTAL_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(46); await transfer
  })
  it('rejects nonexistent, oversized and incomplete recordings before uploading', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(downloadAudio('https://xeno-canto.org/a.mp3')).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND', retryable: false })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg', 'content-length': '100' } })))
    await expect(downloadAudio('https://xeno-canto.org/a.mp3', { maxBytes: 10 })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    await expect(downloadAudio('https://xeno-canto.org/a.mp3')).rejects.toMatchObject({ code: 'INCOMPLETE_DOWNLOAD' })
    expect(cloud.upload).not.toHaveBeenCalled()
  })
  it('supports the iNaturalist audio sources in the imported dataset', () => {
    expect(parseAndValidateAudioUrl('https://static.inaturalist.org/sounds/1.mp3').hostname).toBe('static.inaturalist.org')
    expect(() => parseAndValidateAudioUrl('http://127.0.0.1/file.mp3')).toThrow(/restricted/)
  })
  it('preserves Range streaming and supports cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-1/100' } })))
    const response = await fetchAllowedAudioStream('https://xeno-canto.org/a.mp3', { range: 'bytes=0-1' })
    expect(response.status).toBe(206); await response.body!.cancel()
  })
})

describe('ImageKit audio worker', () => {
  it('uploads downloaded bytes and persists the returned URL and size', async () => {
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', 'test-key'); vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })))
    cloud.upload.mockResolvedValue({ url: 'https://ik.imagekit.io/test/a.mp3', fileId: 'cloud-file', size: 3 })
    const job = { id: '1', sourceUrl: 'https://xeno-canto.org/a.mp3', sourceHash: 'hash', leaseToken: 'lease', attempts: 1 } as any
    const store = { claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null), progress: vi.fn().mockResolvedValue(true),
      complete: vi.fn(), fail: vi.fn() }
    const worker = new AudioDownloadWorker(store)
    await worker.tick()
    await vi.waitFor(() => expect(store.complete).toHaveBeenCalledWith(job, { url: 'https://ik.imagekit.io/test/a.mp3', fileId: 'cloud-file', size: 3 }))
    expect(cloud.upload.mock.calls[0][0].file.bytes).toEqual(Buffer.from([1, 2, 3]))
    expect(cloud.upload.mock.calls[0][0].useUniqueFileName).toBe(false)
    expect(store.fail).not.toHaveBeenCalled(); await worker.stop()
  })
})
