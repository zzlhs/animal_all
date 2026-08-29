import { AudioProxyConstants } from './audioProxy.constants.js'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export function parseAudioSourceUrl(rawUrl) {
  let sourceUrl
  try {
    sourceUrl = new URL(rawUrl)
  } catch {
    throw new Error('Invalid audio source URL')
  }

  const hostname = sourceUrl.hostname.toLowerCase()
  const isAllowedHost = AudioProxyConstants.ALLOWED_HOSTS.includes(hostname)
  if (
    sourceUrl.protocol !== AudioProxyConstants.ALLOWED_PROTOCOL
    || sourceUrl.username
    || sourceUrl.password
    || !isAllowedHost
  ) {
    throw new Error('Audio source is not allowed')
  }

  return sourceUrl
}

function validateAudioResponse(response) {
  if (response.status < 200 || response.status >= 300) return
  const contentType = response.headers.get('content-type') || ''
  if (!AudioProxyConstants.AUDIO_CONTENT_TYPE_PATTERN.test(contentType)) {
    response.body?.cancel().catch(() => {})
    throw new Error('Audio source returned an unsupported content type')
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > AudioProxyConstants.MAX_CONTENT_LENGTH_BYTES) {
    response.body?.cancel().catch(() => {})
    throw new Error('Audio source is too large')
  }
}

export async function fetchAllowedAudio(rawUrl, { method = 'GET', range, signal } = {}) {
  let sourceUrl = parseAudioSourceUrl(rawUrl)
  const requestMethod = method === 'HEAD' ? 'HEAD' : 'GET'

  for (let redirectCount = 0; redirectCount <= AudioProxyConstants.MAX_REDIRECTS; redirectCount += 1) {
    const headers = new Headers({
      Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5',
      'User-Agent': AudioProxyConstants.REQUEST_USER_AGENT,
    })
    if (range) headers.set('Range', range)

    const timeoutSignal = AbortSignal.timeout(AudioProxyConstants.REQUEST_TIMEOUT_MILLISECONDS)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    const response = await fetch(sourceUrl, {
      headers,
      method: requestMethod,
      redirect: 'manual',
      signal: requestSignal,
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      validateAudioResponse(response)
      return response
    }

    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location) throw new Error('Audio source redirect is missing a destination')
    sourceUrl = parseAudioSourceUrl(new URL(location, sourceUrl).href)
  }

  throw new Error('Audio source redirected too many times')
}

export function copyAudioResponseHeaders(sourceHeaders) {
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
  })
  for (const name of AudioProxyConstants.RESPONSE_HEADERS) {
    const value = sourceHeaders.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}
