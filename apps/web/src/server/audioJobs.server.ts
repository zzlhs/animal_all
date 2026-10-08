import { AudioJobRepository } from '@gbif-globe/db'
import { AudioQueueConstants as C } from '@gbif-globe/contracts'
import { AudioDownloadWorker, audioWorkerConfigured } from '@gbif-globe/media/audio-worker'

const repository = new AudioJobRepository()
const worker = new AudioDownloadWorker(repository)
const workerMode = () => process.env.AUDIO_WORKER_EMBEDDED === 'false' ? 'external' as const : 'embedded' as const
export function wakeAudioWorker() { if (workerMode() === 'embedded') worker.start() }
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleAudioJobs(request: Request): Promise<Response> {
  try {
    wakeAudioWorker()
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id')
      if (id) {
        if (!C.ID_PATTERN.test(id)) return json({ code: 'BAD_REQUEST' }, 400)
        const job = await repository.find(id)
        return job ? json({ job, configured: audioWorkerConfigured() }) : json({ code: 'AUDIO_NOT_FOUND' }, 404)
      }
      const snapshot = await repository.snapshot()
      return json({ ...snapshot, configured: audioWorkerConfigured(), workerMode: workerMode(),
        workerActive: snapshot.workerActive || (workerMode() === 'embedded' && audioWorkerConfigured()) })
    }
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405)
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin && origin !== process.env.PUBLIC_APP_URL) return json({ code: 'BAD_ORIGIN' }, 403)
    const raw = await request.text()
    if (raw.length > C.MAX_REQUEST_LENGTH) return json({ code: 'BAD_REQUEST' }, 400)
    const input = JSON.parse(raw) as { mediaIds?: unknown; sourceUrl?: unknown; priority?: unknown; retry?: unknown }
    if (!['playback', 'detail'].includes(String(input.priority))) return json({ code: 'BAD_REQUEST' }, 400)
    const mediaIds = input.mediaIds
    if (mediaIds !== undefined && (!Array.isArray(mediaIds) || !mediaIds.length || mediaIds.length > C.MAX_ENQUEUE
      || mediaIds.some(id => typeof id !== 'string' || !C.ID_PATTERN.test(id)))) return json({ code: 'BAD_REQUEST' }, 400)
    if (!mediaIds && (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > C.MAX_SOURCE_URL_LENGTH)) return json({ code: 'BAD_REQUEST' }, 400)
    const jobs = await repository.enqueue({ mediaIds: mediaIds as string[] | undefined,
      sourceUrl: input.sourceUrl as string | undefined,
      priority: input.priority === 'playback' ? C.PLAYBACK_PRIORITY : C.DETAIL_PRIORITY, retry: input.retry === true })
    if (workerMode() === 'embedded') void worker.tick()
    return json({ jobs, configured: audioWorkerConfigured() }, 202)
  } catch (error) {
    if (error instanceof SyntaxError) return json({ code: 'BAD_REQUEST' }, 400)
    if (error instanceof Error && error.message === 'AUDIO_NOT_FOUND') return json({ code: 'AUDIO_NOT_FOUND' }, 404)
    console.error('Audio job request failed:', error instanceof Error ? error.message : 'Unknown error')
    return json({ code: 'QUEUE_UNAVAILABLE' }, 503)
  }
}
