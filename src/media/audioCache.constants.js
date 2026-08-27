const DAY_IN_MILLISECONDS = 86_400_000

export const AudioCacheConstants = Object.freeze({
  DATABASE_NAME: 'gbif-photo-globe-media',
  DATABASE_VERSION: 1,
  STORE_NAME: 'audio-files',
  KEY_PATH: 'sourceUrl',
  MAX_ENTRIES: 50,
  MAX_IDLE_MILLISECONDS: 3 * DAY_IN_MILLISECONDS,
  MIME_TYPES_BY_EXTENSION: Object.freeze({
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
  }),
})
