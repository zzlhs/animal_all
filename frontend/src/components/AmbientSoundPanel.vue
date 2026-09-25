<script setup>
import { computed, watch } from 'vue'
import { CircleAlert, Clock3, Pause, Play, Square, Volume2, Waves, X } from '@lucide/vue'
import { useAmbientSound } from '../composables/useAmbientSound.js'
import { AmbientSoundConstants } from '../media/ambientSound.constants.js'
import { translate } from '../i18n.js'

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['close', 'playing-change'])

const trackSource = computed(() => props.tracks)
const {
  mode,
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
} = useAmbientSound(trackSource)

const isMixMode = computed(() => mode.value === AmbientSoundConstants.MODES.MIX)
const mixLimitReached = computed(() => selectedMixTrackIds.value.length >= AmbientSoundConstants.MAX_MIX_TRACK_COUNT)
const durationOptions = AmbientSoundConstants.DURATION_OPTIONS
const secondsPerMinute = AmbientSoundConstants.SECONDS_PER_MINUTE

const actionLabel = computed(() => {
  if (isLoading.value) return translate(props.language, 'ambient.loading')
  if (isPlaying.value) return translate(props.language, 'ambient.pause')
  if (isPaused.value) return translate(props.language, 'ambient.resume')
  return translate(props.language, 'ambient.play')
})

watch(isPlaying, playing => emit('playing-change', playing), { immediate: true })

function label(key, values) {
  return translate(props.language, key, values)
}

function trackLabel(track) {
  if (!track.scientificName || track.scientificName === track.displayName) return track.displayName
  return `${track.displayName} · ${track.scientificName}`
}

function formatRemainingTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / secondsPerMinute)
  const secondsPart = String(totalSeconds % secondsPerMinute).padStart(2, '0')
  return `${minutes}:${secondsPart}`
}

function onMixTrackChange(trackId) {
  toggleMixTrack(trackId)
}
</script>

<template>
  <aside class="ambient-sound-panel" role="dialog" :aria-label="label('ambient.title')">
    <header class="ambient-sound-panel__header">
      <div>
        <span class="ambient-sound-panel__eyebrow"><Waves :size="14" /> {{ label('ambient.eyebrow') }}</span>
        <h2>{{ label('ambient.title') }}</h2>
        <p>{{ label('ambient.subtitle') }}</p>
      </div>
      <button class="ambient-sound-panel__close" type="button" :aria-label="label('ambient.close')" @click="$emit('close')">
        <X :size="17" />
      </button>
    </header>

    <template v-if="tracks.length">
      <div class="ambient-sound-panel__tabs" role="tablist" :aria-label="label('ambient.mode')">
        <button
          type="button"
          :class="{ 'is-active': !isMixMode }"
          role="tab"
          :aria-selected="!isMixMode"
          @click="setMode(AmbientSoundConstants.MODES.SINGLE)"
        >
          {{ label('ambient.single') }}
        </button>
        <button
          type="button"
          :class="{ 'is-active': isMixMode }"
          role="tab"
          :aria-selected="isMixMode"
          @click="setMode(AmbientSoundConstants.MODES.MIX)"
        >
          {{ label('ambient.mix') }}
        </button>
      </div>

      <section v-if="!isMixMode" class="ambient-sound-panel__section">
        <label class="ambient-sound-panel__field-label" for="ambient-single-track">{{ label('ambient.source') }}</label>
        <select
          id="ambient-single-track"
          :value="selectedTrackId"
          @change="setSingleTrack($event.target.value)"
        >
          <option v-for="track in tracks" :key="track.id" :value="track.id">{{ trackLabel(track) }}</option>
        </select>
      </section>

      <section v-else class="ambient-sound-panel__section">
        <div class="ambient-sound-panel__section-heading">
          <div>
            <span class="ambient-sound-panel__field-label">{{ label('ambient.sources') }}</span>
            <small>{{ label('ambient.selectedCount', { count: selectedMixTrackIds.length }) }}</small>
          </div>
          <span class="ambient-sound-panel__limit">{{ label('ambient.mixMaximum', { count: AmbientSoundConstants.MAX_MIX_TRACK_COUNT }) }}</span>
        </div>
        <div class="ambient-sound-panel__mix-list">
          <label v-for="track in tracks" :key="track.id" class="ambient-sound-panel__track" :class="{ 'is-selected': selectedMixTrackIds.includes(track.id) }">
            <input
              type="checkbox"
              :checked="selectedMixTrackIds.includes(track.id)"
              :disabled="!selectedMixTrackIds.includes(track.id) && mixLimitReached"
              @change="onMixTrackChange(track.id)"
            >
            <span>{{ trackLabel(track) }}</span>
          </label>
        </div>
        <p class="ambient-sound-panel__hint">{{ label('ambient.mixHint') }}</p>
      </section>

      <section class="ambient-sound-panel__section ambient-sound-panel__settings">
        <label class="ambient-sound-panel__field-label" for="ambient-duration">{{ label('ambient.duration') }}</label>
        <select id="ambient-duration" :value="durationMinutes" @change="setDuration(Number($event.target.value))">
          <option v-for="minutes in durationOptions" :key="minutes" :value="minutes">{{ label('ambient.durationOption', { count: minutes }) }}</option>
        </select>

        <div class="ambient-sound-panel__volume">
          <label for="ambient-volume"><Volume2 :size="14" /> {{ label('ambient.volume') }}</label>
          <input
            id="ambient-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="masterVolume"
            @input="setMasterVolume(Number($event.target.value))"
          >
        </div>
      </section>

      <div class="ambient-sound-panel__countdown" :class="{ 'is-playing': isPlaying, 'is-paused': isPaused }">
        <Clock3 :size="17" />
        <div>
          <span>{{ label('ambient.remaining') }}</span>
          <strong>{{ formatRemainingTime(remainingSeconds) }}</strong>
        </div>
        <small>{{ label('ambient.loop') }}</small>
      </div>

      <p v-if="messageKey" class="ambient-sound-panel__status" :class="{ 'is-error': state === AmbientSoundConstants.STATES.ERROR }" aria-live="polite">
        <CircleAlert :size="13" />
        <span>{{ label(messageKey, { count: AmbientSoundConstants.MIN_MIX_TRACK_COUNT }) }}</span>
      </p>

      <div class="ambient-sound-panel__actions">
        <button
          class="ambient-sound-panel__play"
          type="button"
          :disabled="isLoading || !hasValidSelection"
          @click="togglePlayback"
        >
          <Pause v-if="isPlaying" :size="16" fill="currentColor" />
          <Play v-else :size="16" fill="currentColor" />
          <span>{{ actionLabel }}</span>
        </button>
        <button class="ambient-sound-panel__stop" type="button" :disabled="isLoading" :aria-label="label('ambient.stop')" @click="stop()">
          <Square :size="15" fill="currentColor" />
          <span>{{ label('ambient.stop') }}</span>
        </button>
      </div>
    </template>

    <p v-else class="ambient-sound-panel__empty"><CircleAlert :size="15" /> {{ label('ambient.unavailable') }}</p>
  </aside>
</template>
