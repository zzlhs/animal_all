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
  const isAllowedPath = AudioProxyConstants.AUDIO_PATH_PATTERN.test(sourceUrl.pathname)
  if (
    sourceUrl.protocol !== AudioProxyConstants.ALLOWED_PROTOCOL
    || sourceUrl.username
    || sourceUrl.password
    || !isAllowedHost
    || !isAllowedPath
  ) {
    throw new Error('Audio source is not allowed')
  }

  return sourceUrl
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

    const response = await fetch(sourceUrl, {
      headers,
      method: requestMethod,
      redirect: 'manual',
      signal,
    })

    if (!REDIRECT_STATUSES.has(response.status)) return response

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
