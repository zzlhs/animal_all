export const AmbientSoundConstants = Object.freeze({
  MODES: Object.freeze({
    SINGLE: 'single',
    MIX: 'mix',
  }),
  STATES: Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    ERROR: 'error',
  }),
  DEFAULT_DURATION_MINUTES: 30,
  DURATION_OPTIONS: Object.freeze([15, 30, 60, 90]),
  DEFAULT_MASTER_VOLUME: 0.62,
  DEFAULT_MIX_TRACK_COUNT: 3,
  MIN_MIX_TRACK_COUNT: 2,
  MAX_MIX_TRACK_COUNT: 4,
  COUNTDOWN_INTERVAL_MILLISECONDS: 250,
  SECONDS_PER_MINUTE: 60,
})
