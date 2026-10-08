import { afterEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ enqueue: vi.fn(), find: vi.fn(), snapshot: vi.fn(), start: vi.fn(), tick: vi.fn(), configured: vi.fn(() => true) }))
vi.mock('@gbif-globe/db', () => ({ AudioJobRepository: class { enqueue = mock.enqueue; find = mock.find; snapshot = mock.snapshot } }))
vi.mock('@gbif-globe/media/audio-worker', () => ({ AudioDownloadWorker: class { start = mock.start; tick = mock.tick }, audioWorkerConfigured: mock.configured }))
import { handleAudioJobs } from './audioJobs.server.js'
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
const post = (body: unknown, origin?: string) => new Request('http://localhost/api/audio/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
describe('audio job HTTP API', () => {
  it('persists playback priority and returns a task rather than waiting for the download', async () => {
    mock.enqueue.mockResolvedValue([{ id: '1', status: 'queued' }])
    const response = await handleAudioJobs(post({ mediaIds: ['1231'], priority: 'playback', retry: true }))
    expect(response.status).toBe(202)
    expect(mock.enqueue).toHaveBeenCalledWith({ mediaIds: ['1231'], sourceUrl: undefined, priority: 100, retry: true })
  })
  it('does not start an embedded worker in external mode', async () => {
    vi.stubEnv('AUDIO_WORKER_EMBEDDED', 'false')
    mock.enqueue.mockResolvedValue([{ id: '1', status: 'queued' }])
    await handleAudioJobs(post({ mediaIds: ['1231'], priority: 'detail' }))
    expect(mock.start).not.toHaveBeenCalled(); expect(mock.tick).not.toHaveBeenCalled()
  })
  it('rejects invalid priorities, IDs, oversized batches, malformed JSON and cross-origin submissions', async () => {
    for (const body of [{ mediaIds: ['1'], priority: 'viewport' }, { mediaIds: ['x'], priority: 'detail' }, { mediaIds: Array(21).fill('1'), priority: 'detail' }]) {
      expect((await handleAudioJobs(post(body))).status).toBe(400)
    }
    expect((await handleAudioJobs(post({ mediaIds: ['1'], priority: 'playback' }, 'https://another.example'))).status).toBe(403)
    expect((await handleAudioJobs(new Request('http://localhost/api/audio/jobs', { method: 'POST', body: '{' }))).status).toBe(400)
    expect(mock.enqueue).not.toHaveBeenCalled()
  })
  it('reports nonexistent recordings and returns configuration status with queued jobs', async () => {
    mock.enqueue.mockRejectedValueOnce(new Error('AUDIO_NOT_FOUND'))
    expect((await handleAudioJobs(post({ mediaIds: ['1'], priority: 'detail' }))).status).toBe(404)
    mock.configured.mockReturnValueOnce(false)
    mock.find.mockResolvedValue({ id: '1', status: 'queued' })
    const response = await handleAudioJobs(new Request('http://localhost/api/audio/jobs?id=1'))
    expect((await response.json()).job.status).toBe('queued')
  })
})
