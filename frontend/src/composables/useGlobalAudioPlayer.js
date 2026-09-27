import { computed, reactive, ref } from 'vue'
import { resolveAudioForPlayback } from '../media/audioCache.js'

// Module-level singleton state shared across all components
const currentTrack = ref(null)
const state = ref('idle') // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
const currentTime = ref(0)
const duration = ref(0)
const isVisible = ref(false)
const errorMessage = ref('')
const cacheResult = ref('none')

// Ambient sound integration
const activeSource = ref('none') // 'none' | 'occurrence' | 'ambient'
const ambientState = reactive({
  isPlaying: false,
  isPaused: false,
  isLoading: false,
  mode: 'single', // 'single' | 'mix'
  title: '',
  subtitle: '',
  remainingSeconds: 0,
  durationMinutes: 0,
  progressPercent: 0,
  trackCount: 1,
  thumbnail: '',
})

let ambientHandlers = {
  togglePlayback: null,
  stop: null,
  pause: null,
}

let audioElement = null
let currentObjectUrl = ''
let abortController = null

function releaseObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = ''
  }
}

function initAudioElement() {
  if (audioElement || typeof Audio === 'undefined') return audioElement
  audioElement = new Audio()
  audioElement.preload = 'auto'

  audioElement.addEventListener('timeupdate', () => {
    if (audioElement) {
      currentTime.value = audioElement.currentTime || 0
      if (audioElement.duration && Number.isFinite(audioElement.duration)) {
        duration.value = audioElement.duration
      }
    }
  })

  audioElement.addEventListener('loadedmetadata', () => {
    if (audioElement?.duration && Number.isFinite(audioElement.duration)) {
      duration.value = audioElement.duration
    }
  })

  audioElement.addEventListener('durationchange', () => {
    if (audioElement?.duration && Number.isFinite(audioElement.duration)) {
      duration.value = audioElement.duration
    }
  })

  audioElement.addEventListener('play', () => {
    state.value = 'playing'
  })

  audioElement.addEventListener('pause', () => {
    if (state.value === 'playing') {
      state.value = 'paused'
    }
  })

  audioElement.addEventListener('ended', () => {
    state.value = 'idle'
    if (duration.value > 0) {
      currentTime.value = duration.value
    }
  })

  audioElement.addEventListener('error', (event) => {
    state.value = 'error'
    errorMessage.value = event?.message || 'media.cacheError'
  })

  return audioElement
}

export function useGlobalAudioPlayer() {
  const isPlaying = computed(() => (
    activeSource.value === 'ambient' ? ambientState.isPlaying : state.value === 'playing'
  ))
  const isLoading = computed(() => (
    activeSource.value === 'ambient' ? ambientState.isLoading : state.value === 'loading'
  ))
  const isPaused = computed(() => (
    activeSource.value === 'ambient' ? ambientState.isPaused : state.value === 'paused'
  ))
  const isEnded = computed(() => (
    activeSource.value === 'ambient'
      ? (!ambientState.isPlaying && ambientState.remainingSeconds <= 0 && ambientState.durationMinutes > 0)
      : (state.value === 'idle' && duration.value > 0 && currentTime.value >= duration.value - 0.5)
  ))
  const progressPercent = computed(() => {
    if (activeSource.value === 'ambient') {
      return ambientState.progressPercent
    }
    return duration.value > 0 ? Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100)) : 0
  })

  function registerAmbientHandlers(handlers) {
    ambientHandlers = { ...ambientHandlers, ...handlers }
  }

  function updateAmbientState(updates) {
    Object.assign(ambientState, updates)

    if (updates.isPlaying) {
      activeSource.value = 'ambient'
      isVisible.value = true
      // Pause occurrence audio if playing to prevent noise conflict
      if (state.value === 'playing') {
        audioElement?.pause()
        state.value = 'paused'
      }
    }
  }

  async function playTrack(trackData) {
    if (!trackData?.sourceUrl) return

    // If ambient is playing, pause ambient so user can hear the individual call
    if (ambientState.isPlaying) {
      ambientHandlers.pause?.()
    }
    activeSource.value = 'occurrence'

    // If same track is already loaded
    if (currentTrack.value?.sourceUrl === trackData.sourceUrl) {
      if (state.value === 'playing') {
        pause()
        return
      }
      if (state.value === 'paused' || state.value === 'idle') {
        resume()
        return
      }
    }

    // Switch to new track
    abortController?.abort()
    abortController = new AbortController()

    if (audioElement) {
      audioElement.pause()
    }
    releaseObjectUrl()

    currentTrack.value = {
      id: trackData.id || trackData.sourceUrl,
      sourceUrl: trackData.sourceUrl,
      scientificName: trackData.scientificName || '',
      vernacularName: trackData.vernacularName || '',
      thumbnail: trackData.thumbnail || '',
      gbifID: trackData.gbifID || '',
      record: trackData.record || null,
      mediaItem: trackData.mediaItem || null,
    }
    isVisible.value = true
    state.value = 'loading'
    errorMessage.value = ''
    currentTime.value = 0
    duration.value = 0
    cacheResult.value = 'none'

    try {
      const result = await resolveAudioForPlayback(trackData.sourceUrl, {
        signal: abortController.signal,
      })
      cacheResult.value = result.cacheHit ? 'hit' : result.cacheStored ? 'stored' : 'failed'
      currentObjectUrl = URL.createObjectURL(result.blob)

      const audio = initAudioElement()
      if (!audio) {
        state.value = 'error'
        return
      }

      audio.src = currentObjectUrl
      await audio.play()
    } catch (error) {
      if (error?.name !== 'AbortError') {
        state.value = 'error'
        errorMessage.value = error?.message || 'media.cacheError'
      }
    } finally {
      abortController = null
    }
  }

  function pause() {
    if (activeSource.value === 'ambient') {
      ambientHandlers.pause?.()
      return
    }
    if (!audioElement) return
    audioElement.pause()
    state.value = 'paused'
  }

  function resume() {
    if (activeSource.value === 'ambient') {
      if (state.value === 'playing') {
        audioElement?.pause()
        state.value = 'paused'
      }
      ambientHandlers.togglePlayback?.()
      return
    }

    if (!audioElement) return
    if (ambientState.isPlaying) {
      ambientHandlers.pause?.()
    }
    if (isEnded.value || (duration.value > 0 && currentTime.value >= duration.value - 0.2)) {
      audioElement.currentTime = 0
      currentTime.value = 0
    }
    audioElement.play().catch(() => {})
  }

  function togglePlay() {
    if (isLoading.value) return
    if (activeSource.value === 'ambient') {
      if (ambientHandlers.togglePlayback) {
        ambientHandlers.togglePlayback()
      } else if (isPlaying.value) {
        pause()
      } else {
        resume()
      }
      return
    }
    if (isPlaying.value) {
      pause()
    } else {
      resume()
    }
  }

  function seek(seconds) {
    if (activeSource.value === 'ambient') return
    if (!audioElement || !Number.isFinite(seconds)) return
    const target = Math.max(0, Math.min(seconds, duration.value || seconds))
    audioElement.currentTime = target
    currentTime.value = target
  }

  function stop() {
    if (activeSource.value === 'ambient') {
      ambientHandlers.stop?.()
      return
    }
    abortController?.abort()
    abortController = null
    if (audioElement) {
      audioElement.pause()
      audioElement.currentTime = 0
    }
    currentTime.value = 0
    state.value = 'idle'
  }

  function close() {
    if (activeSource.value === 'ambient') {
      ambientHandlers.stop?.()
      ambientState.isPlaying = false
      ambientState.isPaused = false
    } else {
      stop()
      releaseObjectUrl()
      if (audioElement) {
        audioElement.removeAttribute('src')
        audioElement.load()
      }
      currentTrack.value = null
    }
    isVisible.value = false
    activeSource.value = 'none'
  }

  return {
    activeSource,
    ambientState,
    currentTrack,
    state,
    currentTime,
    duration,
    isVisible,
    errorMessage,
    cacheResult,
    isPlaying,
    isLoading,
    isPaused,
    isEnded,
    progressPercent,
    registerAmbientHandlers,
    updateAmbientState,
    playTrack,
    pause,
    resume,
    togglePlay,
    seek,
    stop,
    close,
  }
}
