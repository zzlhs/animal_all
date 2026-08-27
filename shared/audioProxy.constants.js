export const AudioProxyConstants = Object.freeze({
  ROUTE: '/api/audio-proxy',
  ALLOWED_PROTOCOL: 'https:',
  ALLOWED_HOSTS: Object.freeze([
    'observation.org',
    'www.observation.org',
    'xeno-canto.org',
    'www.xeno-canto.org',
  ]),
  AUDIO_PATH_PATTERN: /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i,
  MAX_REDIRECTS: 3,
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
