import { AudioProxyConstants as C } from '@gbif-globe/contracts'
import { AudioTransferError } from './audioErrors.js'
const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  'observation.org',
  'www.observation.org',
  'xeno-canto.org',
  'www.xeno-canto.org',
  'static.inaturalist.org',
  'inaturalist-open-data.s3.amazonaws.com',
])

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export const AUDIO_CONTENT_TYPE_PATTERN = /^(audio\/|application\/(?:ogg|octet-stream)(?:;|$))/i
export const MAX_AUDIO_BYTES = C.MAX_AUDIO_BYTES
export const MAX_REDIRECTS = C.MAX_REDIRECTS

export const ALLOWED_RESPONSE_HEADERS = Object.freeze([
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
])

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true
  }
  // AWS / cloud metadata IP
  if (lower === '169.254.169.254') return true

  // Private IPv4 ranges
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
  }

  // Private / local IPv6
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return true
  }

  return false
}

export function parseAndValidateAudioUrl(rawUrl: string, allowedHosts: string[] = [...DEFAULT_ALLOWED_HOSTS]): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid audio source URL')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Audio source protocol not allowed')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Audio source credentials not allowed')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isPrivateIpOrHost(hostname)) {
    throw new Error('Audio source host is restricted')
  }

  const isAllowed = allowedHosts.some(host => {
    const h = host.toLowerCase()
    return hostname === h || hostname.endsWith(`.${h}`)
  })

  if (!isAllowed) {
    throw new Error('Audio source host is not in allowed list')
  }

  // Port restrictions: only allow standard 80/443 or none specified
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Audio source port not allowed')
  }

  return parsed
}

export async function fetchAllowedAudioStream(
  rawUrl: string,
  options: {
    method?: 'GET' | 'HEAD'
    range?: string
    signal?: AbortSignal
    allowedHosts?: string[]
    firstResponseTimeoutMs?: number
    idleTimeoutMs?: number
    totalTimeoutMs?: number
    maxBytes?: number
  } = {},
): Promise<Response> {
  const allowedHosts = options.allowedHosts || [...DEFAULT_ALLOWED_HOSTS]
  let currentUrl = parseAndValidateAudioUrl(rawUrl, allowedHosts)
  const method = options.method === 'HEAD' ? 'HEAD' : 'GET'
  const maxBytes = options.maxBytes ?? C.MAX_AUDIO_BYTES
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  const totalTimer = setTimeout(() => controller.abort(new AudioTransferError('TOTAL_TIMEOUT', 'Audio transfer exceeded the total time limit')), options.totalTimeoutMs ?? C.TOTAL_TIMEOUT_MS)
  let responseTimer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => { clearTimeout(totalTimer); clearTimeout(responseTimer) }
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const headers = new Headers({ Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5',
        'User-Agent': 'gbif-photo-globe/2.0 (TanStack Start audio proxy)' })
      if (options.range) headers.set('Range', options.range)
      responseTimer = setTimeout(() => controller.abort(new AudioTransferError('FIRST_RESPONSE_TIMEOUT', 'Audio source did not respond in time')), options.firstResponseTimeoutMs ?? C.FIRST_RESPONSE_TIMEOUT_MS)
      const response = await fetch(currentUrl, { headers, method, redirect: 'manual', signal })
      clearTimeout(responseTimer)
      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => {})
        const location = response.headers.get('location')
        if (!location) throw new AudioTransferError('INVALID_SOURCE', 'Audio redirect has no destination', false)
        currentUrl = parseAndValidateAudioUrl(new URL(location, currentUrl).href, allowedHosts)
        continue
      }
      if (response.ok) {
        if (!AUDIO_CONTENT_TYPE_PATTERN.test(response.headers.get('content-type') || '')) {
          await response.body?.cancel().catch(() => {})
          throw new AudioTransferError('UNSUPPORTED_AUDIO', 'Audio source returned unsupported content type', false)
        }
        if (Number(response.headers.get('content-length') || 0) > maxBytes) {
          await response.body?.cancel().catch(() => {})
          throw new AudioTransferError('FILE_TOO_LARGE', 'Audio source exceeds size limit', false)
        }
      }
      if (method === 'HEAD' || !response.body) { cleanup(); return response }
      const reader = response.body.getReader()
      let received = 0
      const bounded = new ReadableStream<Uint8Array>({
        async pull(stream) {
          const idleTimer = setTimeout(() => controller.abort(new AudioTransferError('IDLE_TIMEOUT', 'Audio download stopped receiving data')), options.idleTimeoutMs ?? C.IDLE_TIMEOUT_MS)
          try {
            const { done, value } = await reader.read()
            if (done) { cleanup(); stream.close(); reader.releaseLock(); return }
            received += value.byteLength
            if (received > maxBytes) throw new AudioTransferError('FILE_TOO_LARGE', 'Audio source exceeds size limit', false)
            stream.enqueue(value)
          } catch (error) {
            cleanup()
            await reader.cancel().catch(() => {})
            stream.error(signal.aborted ? signal.reason : error)
          } finally { clearTimeout(idleTimer) }
        },
        async cancel(reason) { cleanup(); controller.abort(reason); await reader.cancel(reason).catch(() => {}) },
      })
      // fetch decodes encoded responses; decoded bodies must not retain the compressed length.
      const outputHeaders = new Headers(response.headers)
      if (outputHeaders.has('content-encoding')) { outputHeaders.delete('content-encoding'); outputHeaders.delete('content-length') }
      return new Response(bounded, { status: response.status, statusText: response.statusText, headers: outputHeaders })
    }
    throw new AudioTransferError('INVALID_SOURCE', 'Audio source exceeded maximum redirect limit', false)
  } catch (error) { cleanup(); throw signal.aborted ? signal.reason : error }
}

export function copyAudioHeaders(sourceHeaders: Headers): Headers {
  const result = new Headers({
    'X-Content-Type-Options': 'nosniff',
  })
  for (const name of ALLOWED_RESPONSE_HEADERS) {
    const val = sourceHeaders.get(name)
    if (val) result.set(name, val)
  }
  return result
}
