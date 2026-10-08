import { metaQuerySchema } from '@gbif-globe/contracts'
import { metaService } from './db.server.js'
import { json, errorResponse } from './http.server.js'
export async function handleMetaRequest(request: Request) {
  try {
    if (process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
      void import('./audioJobs.server.js').then(module => module.wakeAudioWorker()).catch(() => {})
    }
    const { revision } = metaQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const result = await metaService.getMeta(revision)
    // Local releases remain on the current app origin when switching dev/production ports.
    try {
      const url = new URL(result.map.pmtilesUrl)
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && /^\/api\/maps\/[a-f0-9-]{36}\.pmtiles$/.test(url.pathname)) result.map = { ...result.map, pmtilesUrl: url.pathname }
    } catch {}
    return json(result, 200, { 'Cache-Control': 'no-cache' })
  } catch (error) { return errorResponse(error) }
}
