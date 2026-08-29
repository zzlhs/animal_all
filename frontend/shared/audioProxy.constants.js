export const AudioProxyConstants = Object.freeze({
  ROUTE: '/api/audio-proxy',
  ALLOWED_PROTOCOL: 'https:',
  ALLOWED_HOSTS: Object.freeze([
    'observation.org',
    'www.observation.org',
    'xeno-canto.org',
    'www.xeno-canto.org',
  ]),
  AUDIO_CONTENT_TYPE_PATTERN: /^(audio\/|application\/(?:ogg|octet-stream)(?:;|$))/i,
  MAX_REDIRECTS: 3,
  REQUEST_TIMEOUT_MILLISECONDS: 12_000,
  MAX_CONTENT_LENGTH_BYTES: 100 * 1024 * 1024,
  REQUEST_USER_AGENT: 'gbif-photo-globe/1.0 (on-demand audio cache)',
  RESPONSE_HEADERS: Object.freeze([
    'accept-ranges',
    'cache-control',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
  ]),
})
