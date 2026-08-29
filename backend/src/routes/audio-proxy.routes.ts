import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { ApiConstants } from '../config/api.constants.js'
import type { AppConfig } from '../config/env.js'

interface AudioProxyQuery {
  url?: string
}

const redirectStatuses = new Set([301, 302, 303, 307, 308])

function validatedSourceUrl(rawUrl: string | undefined, allowedHosts: readonly string[]) {
  let sourceUrl: URL
  try {
    sourceUrl = new URL(rawUrl ?? '')
  } catch {
    throw new Error('Invalid audio source URL')
  }
  if (
    sourceUrl.protocol !== 'https:'
    || sourceUrl.username
    || sourceUrl.password
    || !allowedHosts.includes(sourceUrl.hostname.toLowerCase())
  ) throw new Error('Audio source is not allowed')
  return sourceUrl
}

function validateAudioResponse(response: Response) {
  if (response.status < 200 || response.status >= 300) return
  const contentType = response.headers.get('content-type') || ''
  if (!ApiConstants.AUDIO_CONTENT_TYPE_PATTERN.test(contentType)) {
    response.body?.cancel().catch(() => {})
    throw new Error('Audio source returned an unsupported content type')
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > ApiConstants.MAX_AUDIO_CONTENT_LENGTH_BYTES) {
    response.body?.cancel().catch(() => {})
    throw new Error('Audio source is too large')
  }
}

async function fetchAudio(rawUrl: string | undefined, allowedHosts: readonly string[], method: 'GET' | 'HEAD', range?: string) {
  let sourceUrl = validatedSourceUrl(rawUrl, allowedHosts)
  for (let redirectCount = 0; redirectCount <= ApiConstants.MAX_AUDIO_REDIRECTS; redirectCount += 1) {
    const headers = new Headers({ Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5' })
    if (range) headers.set('Range', range)
    const response = await fetch(sourceUrl, {
      method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(ApiConstants.AUDIO_REQUEST_TIMEOUT_MILLISECONDS),
    })
    if (!redirectStatuses.has(response.status)) {
      validateAudioResponse(response)
      return response
    }
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location) throw new Error('Audio source redirect is missing a destination')
    sourceUrl = validatedSourceUrl(new URL(location, sourceUrl).href, allowedHosts)
  }
  throw new Error('Audio source redirected too many times')
}

export async function registerAudioProxyRoutes(app: FastifyInstance, config: AppConfig) {
  app.route<{ Querystring: AudioProxyQuery }>({
    method: ['GET', 'HEAD'],
    url: ApiConstants.AUDIO_PROXY_ROUTE,
    handler: async (request, reply) => {
      let upstream: Response
      try {
        upstream = await fetchAudio(
          request.query.url,
          config.audioProxyAllowedHosts,
          request.method === 'HEAD' ? 'HEAD' : 'GET',
          request.headers.range,
        )
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Audio source is unavailable' })
      }

      reply.code(upstream.status).header('X-Content-Type-Options', 'nosniff')
      for (const header of ApiConstants.AUDIO_RESPONSE_HEADERS) {
        const value = upstream.headers.get(header)
        if (value) reply.header(header, value)
      }
      if (request.method === 'HEAD' || !upstream.body) return reply.send()
      return reply.send(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream))
    },
  })
}
