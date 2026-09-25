import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { resolveAudioForPlayback } from '../media/audioCache.js'
import { AmbientSoundConstants } from '../media/ambientSound.constants.js'
import {
  ambientVolumePerTrack,
  defaultAmbientMixTrackIds,
  normalizeAmbientTrackIds,
} from '../media/ambientSound.js'

function hasSameItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

export function useAmbientSound(trackSource) {
  const mode = ref(AmbientSoundConstants.MODES.SINGLE)
  const selectedTrackId = ref('')
  const selectedMixTrackIds = ref([])
  const durationMinutes = ref(AmbientSoundConstants.DEFAULT_DURATION_MINUTES)
  const remainingSeconds = ref(AmbientSoundConstants.DEFAULT_DURATION_MINUTES * AmbientSoundConstants.SECONDS_PER_MINUTE)
  const masterVolume = ref(AmbientSoundConstants.DEFAULT_MASTER_VOLUME)
  const state = ref(AmbientSoundConstants.STATES.IDLE)
  const messageKey = ref('')

  let audioEntries = []
  let abortController = null
  let countdownTimer = null
  let countdownDeadline = 0
  let playbackSequence = 0

  const tracks = computed(() => Array.isArray(trackSource?.value) ? trackSource.value : [])
  const selectedTracks = computed(() => {
    const byId = new Map(tracks.value.map(track => [track.id, track]))
    const ids = mode.value === AmbientSoundConstants.MODES.SINGLE
      ? [selectedTrackId.value]
      : selectedMixTrackIds.value
    return ids.map(id => byId.get(id)).filter(Boolean)
  })
  const isLoading = computed(() => state.value === AmbientSoundConstants.STATES.LOADING)
  const isPlaying = computed(() => state.value === AmbientSoundConstants.STATES.PLAYING)
  const isPaused = computed(() => state.value === AmbientSoundConstants.STATES.PAUSED)
  const hasValidSelection = computed(() => (
    mode.value === AmbientSoundConstants.MODES.SINGLE
      ? selectedTracks.value.length === 1
      : selectedTracks.value.length >= AmbientSoundConstants.MIN_MIX_TRACK_COUNT
  ))

  function resetRemainingTime() {
    remainingSeconds.value = durationMinutes.value * AmbientSoundConstants.SECONDS_PER_MINUTE
  }

  function clearCountdown() {
    if (countdownTimer !== null) window.clearInterval(countdownTimer)
    countdownTimer = null
    countdownDeadline = 0
  }

  function remainingAtCurrentMoment() {
    if (!countdownDeadline) return remainingSeconds.value
    return Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000))
  }

  function releaseEntries(entries) {
    for (const entry of entries) {
      entry.audio.pause()
      entry.audio.removeAttribute('src')
      entry.audio.load()
      URL.revokeObjectURL(entry.objectUrl)
    }
  }

  function disposeAudioEntries() {
    releaseEntries(audioEntries)
    audioEntries = []
  }

  function applyVolume() {
    const volume = ambientVolumePerTrack(masterVolume.value, audioEntries.length)
    for (const entry of audioEntries) entry.audio.volume = volume
  }

  function finishPlayback() {
    clearCountdown()
    disposeAudioEntries()
    remainingSeconds.value = 0
    state.value = AmbientSoundConstants.STATES.IDLE
    messageKey.value = ''
  }

  function startCountdown() {
    clearCountdown()
    countdownDeadline = Date.now() + remainingSeconds.value * 1000
    countdownTimer = window.setInterval(() => {
      remainingSeconds.value = remainingAtCurrentMoment()
      if (remainingSeconds.value <= 0) finishPlayback()
    }, AmbientSoundConstants.COUNTDOWN_INTERVAL_MILLISECONDS)
  }

  function stop({ resetTime = true } = {}) {
    playbackSequence += 1
    abortController?.abort()
    abortController = null
    clearCountdown()
    disposeAudioEntries()
    state.value = AmbientSoundConstants.STATES.IDLE
    messageKey.value = ''
    if (resetTime) resetRemainingTime()
  }

  async function beginPlayback() {
    if (!hasValidSelection.value) {
      state.value = AmbientSoundConstants.STATES.ERROR
      messageKey.value = mode.value === AmbientSoundConstants.MODES.MIX
        ? 'ambient.mixMinimum'
        : 'ambient.selectionError'
      return
    }

    stop({ resetTime: false })
    if (remainingSeconds.value <= 0) resetRemainingTime()
    const sequence = ++playbackSequence
    abortController = new AbortController()
    state.value = AmbientSoundConstants.STATES.LOADING
    messageKey.value = ''

    try {
      const prepared = await Promise.allSettled(selectedTracks.value.map(async track => {
        const result = await resolveAudioForPlayback(track.sourceUrl, { signal: abortController.signal })
        const objectUrl = URL.createObjectURL(result.blob)
        const audio = new Audio(objectUrl)
        audio.loop = true
        audio.preload = 'auto'
        return { audio, objectUrl, sourceUrl: track.sourceUrl }
      }))

      const entries = prepared
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)

      if (sequence !== playbackSequence) {
        releaseEntries(entries)
        return
      }
      if (!entries.length) throw new Error('No ambient audio could be prepared')

      audioEntries = entries
      applyVolume()
      const started = await Promise.allSettled(entries.map(entry => entry.audio.play()))
      if (sequence !== playbackSequence) return

      const playableEntries = entries.filter((_, index) => started[index].status === 'fulfilled')
      const failedEntries = entries.filter((_, index) => started[index].status === 'rejected')
      releaseEntries(failedEntries)
      audioEntries = playableEntries
      if (!audioEntries.length) throw new Error('No ambient audio could start')

      abortController = null
      state.value = AmbientSoundConstants.STATES.PLAYING
      if (prepared.length !== audioEntries.length) messageKey.value = 'ambient.partialError'
      startCountdown()
    } catch (error) {
      if (sequence !== playbackSequence || error?.name === 'AbortError') return
      disposeAudioEntries()
      abortController = null
      state.value = AmbientSoundConstants.STATES.ERROR
      messageKey.value = 'ambient.error'
    }
  }

  function pause() {
    if (!isPlaying.value) return
    remainingSeconds.value = remainingAtCurrentMoment()
    clearCountdown()
    for (const entry of audioEntries) entry.audio.pause()
    state.value = AmbientSoundConstants.STATES.PAUSED
  }

  async function resume() {
    if (!isPaused.value || !audioEntries.length) return beginPlayback()
    const started = await Promise.allSettled(audioEntries.map(entry => entry.audio.play()))
    const playableEntries = audioEntries.filter((_, index) => started[index].status === 'fulfilled')
    const failedEntries = audioEntries.filter((_, index) => started[index].status === 'rejected')
    releaseEntries(failedEntries)
    audioEntries = playableEntries

    if (!audioEntries.length) {
      state.value = AmbientSoundConstants.STATES.ERROR
      messageKey.value = 'ambient.error'
      return
    }

    state.value = AmbientSoundConstants.STATES.PLAYING
    startCountdown()
  }

  function togglePlayback() {
    if (isLoading.value) return
    if (isPlaying.value) {
      pause()
      return
    }
    if (isPaused.value) {
      void resume()
      return
    }
    void beginPlayback()
  }

  function setMode(nextMode) {
    if (!Object.values(AmbientSoundConstants.MODES).includes(nextMode) || mode.value === nextMode) return
    stop()
    mode.value = nextMode
  }

  function setSingleTrack(trackId) {
    if (selectedTrackId.value === trackId) return
    stop()
    selectedTrackId.value = trackId
  }

  function toggleMixTrack(trackId) {
    const currentIds = selectedMixTrackIds.value
    if (currentIds.includes(trackId)) {
      if (currentIds.length <= AmbientSoundConstants.MIN_MIX_TRACK_COUNT) return false
      stop()
      selectedMixTrackIds.value = currentIds.filter(id => id !== trackId)
      return true
    }
    if (currentIds.length >= AmbientSoundConstants.MAX_MIX_TRACK_COUNT) return false
    stop()
    selectedMixTrackIds.value = [...currentIds, trackId]
    return true
  }

  function setDuration(minutes) {
    if (!AmbientSoundConstants.DURATION_OPTIONS.includes(minutes)) return
    stop({ resetTime: false })
    durationMinutes.value = minutes
    resetRemainingTime()
  }

  function setMasterVolume(value) {
    masterVolume.value = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : masterVolume.value
    applyVolume()
  }

  function reconcileSelection(availableTracks) {
    const availableIds = new Set(availableTracks.map(track => track.id))
    if (!availableIds.has(selectedTrackId.value)) selectedTrackId.value = availableTracks[0]?.id || ''

    const validMixIds = normalizeAmbientTrackIds(selectedMixTrackIds.value, availableTracks)
    if (validMixIds.length < AmbientSoundConstants.MIN_MIX_TRACK_COUNT) {
      for (const id of defaultAmbientMixTrackIds(availableTracks)) {
        if (!validMixIds.includes(id)) validMixIds.push(id)
        if (validMixIds.length >= AmbientSoundConstants.DEFAULT_MIX_TRACK_COUNT) break
      }
    }
    selectedMixTrackIds.value = validMixIds.slice(0, AmbientSoundConstants.MAX_MIX_TRACK_COUNT)
  }

  watch(tracks, availableTracks => {
    if (audioEntries.some(entry => !availableTracks.some(track => track.sourceUrl === entry.sourceUrl))) stop({ resetTime: false })
    reconcileSelection(availableTracks)
  }, { immediate: true })
  watch(masterVolume, applyVolume)
  onBeforeUnmount(stop)

  return {
    mode,
    tracks,
    selectedTrackId,
    selectedMixTrackIds,
    selectedTracks,
    durationMinutes,
    remainingSeconds,
    masterVolume,
    state,
    messageKey,
    isLoading,
    isPlaying,
    isPaused,
    hasValidSelection,
    setMode,
    setSingleTrack,
    toggleMixTrack,
    setDuration,
    setMasterVolume,
    togglePlayback,
    stop,
  }
}
