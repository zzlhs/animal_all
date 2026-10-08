import { AudioQueueConstants as C, type AudioJob } from '@gbif-globe/contracts'

export class AudioPreparationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'AudioPreparationError' }
}

export function audioErrorMessage(error: unknown): string {
  const code = error instanceof AudioPreparationError ? error.code
    : (error as { code?: string })?.code || ((error as Error)?.name === 'NotAllowedError' ? 'AUTOPLAY_BLOCKED'
      : (error as Error)?.name === 'NotSupportedError' ? 'UNSUPPORTED_AUDIO' : 'NETWORK_ERROR')
  const keys: Record<string, string> = {
    FIRST_RESPONSE_TIMEOUT: 'firstResponseTimeout', IDLE_TIMEOUT: 'idleTimeout', TOTAL_TIMEOUT: 'totalTimeout',
    SOURCE_NOT_FOUND: 'sourceNotFound', AUDIO_NOT_FOUND: 'sourceNotFound', SOURCE_FORBIDDEN: 'sourceForbidden',
    SOURCE_RATE_LIMITED: 'sourceRateLimited', UNSUPPORTED_AUDIO: 'unsupportedAudio', FILE_TOO_LARGE: 'fileTooLarge',
    AUTOPLAY_BLOCKED: 'autoplayBlocked', IMAGEKIT_AUTH_FAILED: 'imagekitAuthFailed', IMAGEKIT_NOT_CONFIGURED: 'imagekitNotConfigured',
    UPLOAD_FAILED: 'uploadFailed', UPLOAD_TIMEOUT: 'uploadTimeout', QUEUE_UNAVAILABLE: 'queueUnavailable',
    INVALID_SOURCE: 'invalidSource', PREPARATION_TIMEOUT: 'preparationTimeout', INCOMPLETE_DOWNLOAD: 'incompleteDownload',
  }
  return `media.${keys[code] || 'networkError'}`
}

async function requestJobs(body: unknown, signal?: AbortSignal): Promise<{ jobs: AudioJob[]; configured: boolean }> {
  const response = await fetch(C.ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(C.API_TIMEOUT_MS)]) : AbortSignal.timeout(C.API_TIMEOUT_MS) })
  const result = await response.json()
  if (!response.ok) throw new AudioPreparationError(result.code || 'QUEUE_UNAVAILABLE')
  return result
}

export async function prepareDetailAudio(mediaIds: string[], signal?: AbortSignal): Promise<void> {
  await requestJobs({ mediaIds: mediaIds.slice(0, C.MAX_ENQUEUE), priority: 'detail' }, signal)
}

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, C.POLL_MS)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function resolveAudioForPlayback(
  sourceUrl: string,
  _proxyUrl = '/api/audio-proxy',
  signal?: AbortSignal,
  options: { mediaId?: string; retry?: boolean } = {},
): Promise<{ url: string; cacheHit: boolean; cacheStored: boolean }> {
  signal?.throwIfAborted()
  const result = await requestJobs({ ...(options.mediaId ? { mediaIds: [options.mediaId] } : { sourceUrl }),
    priority: 'playback', retry: options.retry === true }, signal)
  let job = result.jobs[0]
  if (!job) throw new AudioPreparationError('AUDIO_NOT_FOUND')
  const cacheHit = job.status === 'ready'
  const deadline = Date.now() + C.CLIENT_WAIT_MS
  while (job.status !== 'ready') {
    if (!result.configured) throw new AudioPreparationError('IMAGEKIT_NOT_CONFIGURED')
    if (job.status === 'failed') throw new AudioPreparationError(job.errorCode || 'NETWORK_ERROR')
    if (Date.now() >= deadline) throw new AudioPreparationError('PREPARATION_TIMEOUT')
    await delay(signal)
    const response = await fetch(`${C.ROUTE}?id=${job.id}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(C.API_TIMEOUT_MS)]) : AbortSignal.timeout(C.API_TIMEOUT_MS), cache: 'no-store' })
    const polled = await response.json()
    if (!response.ok) throw new AudioPreparationError(polled.code || 'QUEUE_UNAVAILABLE')
    job = polled.job
  }
  if (!job.playbackUrl) throw new AudioPreparationError('UPLOAD_FAILED')
  return { url: job.playbackUrl, cacheHit, cacheStored: true }
}
