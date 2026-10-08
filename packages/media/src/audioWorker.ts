import ImageKit, { toFile } from '@imagekit/nodejs'
import { AudioQueueConstants as C, AudioProxyConstants, type AudioJob } from '@gbif-globe/contracts'
import { fetchAllowedAudioStream } from './audioProxy.js'
import { AudioTransferError, audioErrorCode } from './audioErrors.js'

interface WorkItem extends AudioJob { sourceUrl: string; sourceHash: string; leaseToken: string }
interface JobStore {
  claim(): Promise<WorkItem | null>
  progress(job: WorkItem, status: 'downloading' | 'uploading', received: number, total: number | null): Promise<boolean>
  complete(job: WorkItem, result: { url: string; fileId: string; size: number }): Promise<unknown>
  fail(job: WorkItem, code: string, message: string, retryable: boolean): Promise<unknown>
}

function positiveNumber(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value <= 0 || value > max) throw new Error(`Invalid ${name}`)
  return value
}
export function audioWorkerConfigured(): boolean {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT)
}

export async function downloadAudio(
  source: string,
  options: { signal?: AbortSignal; progress?: (received: number, total: number | null) => void;
    maxBytes?: number; firstResponseTimeoutMs?: number; idleTimeoutMs?: number; totalTimeoutMs?: number } = {},
) {
  const response = await fetchAllowedAudioStream(source, { ...options,
    allowedHosts: process.env.AUDIO_PROXY_ALLOWED_HOSTS?.split(',').map(value => value.trim()).filter(Boolean) })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    const code = [404, 410].includes(response.status) ? 'SOURCE_NOT_FOUND' : response.status === 403 ? 'SOURCE_FORBIDDEN'
      : response.status === 429 ? 'SOURCE_RATE_LIMITED' : 'SOURCE_SERVER_ERROR'
    throw new AudioTransferError(code, `Audio source returned HTTP ${response.status}`, response.status === 429 || response.status >= 500)
  }
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new AudioTransferError('INCOMPLETE_DOWNLOAD', 'Source did not return a complete audio file')
  }
  const total = Number(response.headers.get('content-length') || 0) || null
  const chunks: Buffer[] = []
  let received = 0
  options.progress?.(received, total)
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength; chunks.push(Buffer.from(chunk)); options.progress?.(received, total)
  }
  if (!received || (total !== null && received !== total)) throw new AudioTransferError('INCOMPLETE_DOWNLOAD', 'Audio download ended before the full file arrived')
  return { bytes: Buffer.concat(chunks), mime: (response.headers.get('content-type') || 'audio/mpeg').split(';')[0], size: received }
}

const EXTENSIONS: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg',
  'application/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm' }

export class AudioDownloadWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private claiming = false
  private stopping = false
  private tasks = new Map<string, { controller: AbortController; done: Promise<void> }>()
  constructor(private readonly store: JobStore) {}

  start(keepAlive = false) {
    if (this.timer || !audioWorkerConfigured()) return
    this.stopping = false
    this.timer = setInterval(() => { void this.tick() }, C.POLL_MS)
    if (!keepAlive) this.timer.unref()
    void this.tick()
  }

  async tick() {
    if (this.claiming || this.stopping || !audioWorkerConfigured()) return
    this.claiming = true
    try {
      while (!this.stopping && this.tasks.size < C.CONCURRENCY) {
        const job = await this.store.claim()
        if (!job) break
        const controller = new AbortController()
        const done = this.process(job, controller).finally(() => this.tasks.delete(job.id))
        this.tasks.set(job.id, { controller, done })
      }
    } catch (error) { console.error('Audio queue claim failed:', error instanceof Error ? error.message : 'Database unavailable') }
    finally { this.claiming = false }
  }

  private async process(job: WorkItem, controller: AbortController) {
    let received = 0, total: number | null = null, phase: 'downloading' | 'uploading' = 'downloading'
    let saving = false
    const heartbeat = async () => {
      if (saving || controller.signal.aborted) return
      saving = true
      try {
        if (!await this.store.progress(job, phase, received, total)) controller.abort(new AudioTransferError('WORKER_INTERRUPTED', 'Download lease was lost'))
      } catch { controller.abort(new AudioTransferError('WORKER_INTERRUPTED', 'Could not renew download lease')) }
      finally { saving = false }
    }
    const timer = setInterval(() => { void heartbeat() }, C.HEARTBEAT_MS)
    let uploadTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const file = await downloadAudio(job.sourceUrl, { signal: controller.signal,
        maxBytes: positiveNumber('AUDIO_MAX_BYTES', C.DEFAULT_MAX_BYTES, AudioProxyConstants.MAX_AUDIO_BYTES),
        firstResponseTimeoutMs: positiveNumber('AUDIO_FIRST_RESPONSE_TIMEOUT_MS', AudioProxyConstants.FIRST_RESPONSE_TIMEOUT_MS),
        idleTimeoutMs: positiveNumber('AUDIO_IDLE_TIMEOUT_MS', AudioProxyConstants.IDLE_TIMEOUT_MS),
        totalTimeoutMs: positiveNumber('AUDIO_TOTAL_TIMEOUT_MS', AudioProxyConstants.TOTAL_TIMEOUT_MS),
        progress: (bytes, length) => { received = bytes; total = length } })
      controller.signal.throwIfAborted()
      phase = 'uploading'; await heartbeat(); controller.signal.throwIfAborted()
      const folder = (process.env.IMAGEKIT_AUDIO_FOLDER || (process.env.IMAGEKIT_FOLDER ? `${process.env.IMAGEKIT_FOLDER}/audios` : C.DEFAULT_FOLDER))
        .split('/').filter(Boolean).map(part => part.replace(/[^a-z0-9_-]/gi, '_')).join('/')
      const extension = EXTENSIONS[file.mime] || new URL(job.sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'mp3'
      const fileName = `${job.sourceHash}.${extension}`
      const client = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY!, maxRetries: 0 })
      uploadTimer = setTimeout(() => controller.abort(new AudioTransferError('UPLOAD_TIMEOUT', 'ImageKit upload timed out')), C.UPLOAD_TIMEOUT_MS)
      const result = await client.files.upload({ file: await toFile(file.bytes, fileName, { type: file.mime }), fileName,
        folder: `/${folder}`, useUniqueFileName: false, overwriteFile: true, isPrivateFile: false,
        tags: ['gbif', 'audio', 'audio-queue'] }, { signal: controller.signal, timeout: C.UPLOAD_TIMEOUT_MS })
      if (!result.url || !result.fileId) throw new AudioTransferError('UPLOAD_FAILED', 'ImageKit returned no playable file')
      await this.store.complete(job, { url: result.url, fileId: result.fileId, size: result.size ?? file.size })
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error
      const status = (reason as { status?: number })?.status
      const code = status === 401 || status === 403 ? 'IMAGEKIT_AUTH_FAILED'
        : status === 413 ? 'FILE_TOO_LARGE' : phase === 'uploading' && audioErrorCode(reason) === 'NETWORK_ERROR' ? 'UPLOAD_FAILED'
        : reason instanceof Error && /not allowed|not in allowed|restricted|Invalid audio/.test(reason.message) ? 'INVALID_SOURCE' : audioErrorCode(reason)
      const retryable = reason instanceof AudioTransferError ? reason.retryable : !['IMAGEKIT_AUTH_FAILED', 'FILE_TOO_LARGE', 'INVALID_SOURCE'].includes(code)
      try { await this.store.fail(job, code, reason instanceof Error ? reason.message : 'Audio transfer failed', retryable) }
      catch { console.error('Could not persist audio failure for job', job.id) }
    } finally { clearInterval(timer); clearTimeout(uploadTimer) }
  }

  async stop() {
    this.stopping = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const task of this.tasks.values()) task.controller.abort(new AudioTransferError('WORKER_INTERRUPTED', 'Download worker stopped'))
    await Promise.allSettled([...this.tasks.values()].map(task => task.done))
  }
}
