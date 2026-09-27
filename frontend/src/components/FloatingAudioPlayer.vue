<script setup>
import { computed } from 'vue'
import { AudioLines, ExternalLink, LoaderCircle, MapPin, Pause, Play, RotateCcw, SlidersHorizontal, Waves, X } from '@lucide/vue'
import { useGlobalAudioPlayer } from '../composables/useGlobalAudioPlayer.js'
import { formatLocation } from '../map/formatting.js'
import { translate } from '../i18n.js'

const props = defineProps({
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['open-ambient-settings', 'locate-track'])

const {
  activeSource,
  ambientState,
  currentTrack,
  isVisible,
  isPlaying,
  isLoading,
  isEnded,
  currentTime,
  duration,
  progressPercent,
  togglePlay,
  seek,
  close,
} = useGlobalAudioPlayer()

const isAmbient = computed(() => activeSource.value === 'ambient')

const title = computed(() => {
  if (isAmbient.value) {
    return ambientState.title || translate(props.language, 'floatingPlayer.ambientTitle')
  }
  if (!currentTrack.value) return ''
  return currentTrack.value.vernacularName || currentTrack.value.scientificName || 'Audio Recording'
})

const subtitle = computed(() => {
  if (isAmbient.value) {
    return ambientState.subtitle
  }
  if (!currentTrack.value) return ''
  if (currentTrack.value.vernacularName && currentTrack.value.scientificName) {
    return currentTrack.value.scientificName
  }
  if (currentTrack.value.record) {
    const loc = formatLocation(currentTrack.value.record, props.language)
    if (loc && loc !== '位置未知' && loc !== 'Location unavailable') {
      return loc
    }
  }
  return currentTrack.value.gbifID ? `GBIF ${currentTrack.value.gbifID}` : ''
})

const badgeText = computed(() => {
  if (isAmbient.value) {
    return translate(props.language, 'floatingPlayer.ambientEyebrow')
  }
  return translate(props.language, 'floatingPlayer.nowPlaying')
})

const actionLabel = computed(() => {
  if (isLoading.value) return translate(props.language, 'media.cacheLoading')
  if (isEnded.value) return translate(props.language, 'floatingPlayer.replay')
  if (isPlaying.value) return translate(props.language, 'floatingPlayer.pause')
  return translate(props.language, 'floatingPlayer.play')
})

const displayCurrentTime = computed(() => {
  if (isAmbient.value) {
    const total = ambientState.durationMinutes * 60
    const elapsed = Math.max(0, total - ambientState.remainingSeconds)
    return formatTime(elapsed)
  }
  return formatTime(currentTime.value)
})

const displayDuration = computed(() => {
  if (isAmbient.value) {
    return formatTime(ambientState.durationMinutes * 60)
  }
  return formatTime(duration.value)
})

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

function handleRangeInput(event) {
  if (isAmbient.value) return
  const targetTime = Number(event.target.value)
  if (Number.isFinite(targetTime)) {
    seek(targetTime)
  }
}
</script>

<template>
  <Transition name="floating-player">
    <aside
      v-if="isVisible && (currentTrack || isAmbient)"
      class="floating-audio-player"
      :class="{ 'is-ambient': isAmbient }"
      role="region"
      :aria-label="badgeText"
    >
      <div class="floating-audio-player__header">
        <div class="floating-audio-player__cover-wrap" :class="{ 'is-playing': isPlaying, 'is-ambient': isAmbient }">
          <img
            v-if="!isAmbient && currentTrack?.thumbnail"
            class="floating-audio-player__cover"
            :src="currentTrack.thumbnail"
            :alt="title"
          />
          <div v-else-if="isAmbient" class="floating-audio-player__cover-placeholder is-ambient">
            <Waves :size="19" />
          </div>
          <div v-else class="floating-audio-player__cover-placeholder">
            <AudioLines :size="18" />
          </div>
        </div>

        <div class="floating-audio-player__meta">
          <div class="floating-audio-player__badge-row">
            <span class="floating-audio-player__badge" :class="{ 'is-ambient': isAmbient }">
              <span class="floating-audio-player__badge-dot" :class="{ 'is-playing': isPlaying, 'is-ambient': isAmbient }"></span>
              {{ badgeText }}
            </span>

            <div class="floating-audio-player__equalizer" :class="{ 'is-playing': isPlaying, 'is-ambient': isAmbient }">
              <span class="bar bar-1"></span>
              <span class="bar bar-2"></span>
              <span class="bar bar-3"></span>
              <span class="bar bar-4"></span>
            </div>
          </div>

          <strong
            class="floating-audio-player__title"
            :class="{ 'is-clickable': !isAmbient && currentTrack?.record }"
            :title="title"
            @click="!isAmbient && currentTrack?.record && emit('locate-track', currentTrack.record)"
          >
            {{ title }}
          </strong>
          <small v-if="subtitle" class="floating-audio-player__subtitle" :title="subtitle">{{ subtitle }}</small>
        </div>

        <button
          class="floating-audio-player__close"
          type="button"
          :aria-label="translate(language, 'floatingPlayer.close')"
          @click="close"
        >
          <X :size="15" />
        </button>
      </div>

      <div class="floating-audio-player__scrubber-row">
        <span class="floating-audio-player__time">{{ displayCurrentTime }}</span>
        <div class="floating-audio-player__progress-container">
          <input
            v-if="!isAmbient"
            type="range"
            class="floating-audio-player__range"
            min="0"
            :max="duration > 0 ? duration : 100"
            step="0.1"
            :value="currentTime"
            :disabled="isLoading || duration <= 0"
            :aria-label="translate(language, 'floatingPlayer.progress')"
            @input="handleRangeInput"
          />
          <div
            class="floating-audio-player__progress-fill"
            :class="{ 'is-ambient': isAmbient }"
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>
        <span class="floating-audio-player__time">{{ displayDuration }}</span>
      </div>

      <div class="floating-audio-player__footer">
        <div class="floating-audio-player__footer-left">
          <button
            v-if="isAmbient"
            class="floating-audio-player__settings-btn floating-audio-player__pill-btn is-ambient"
            type="button"
            :title="translate(language, 'floatingPlayer.openSettings')"
            @click="emit('open-ambient-settings')"
          >
            <SlidersHorizontal :size="12" />
            <span>{{ translate(language, 'floatingPlayer.openSettings') }}</span>
          </button>
          <template v-else>
            <button
              v-if="currentTrack?.record"
              class="floating-audio-player__locate-btn floating-audio-player__pill-btn is-occurrence"
              type="button"
              :title="translate(language, 'floatingPlayer.locate')"
              @click="emit('locate-track', currentTrack.record)"
            >
              <MapPin :size="12" />
              <span>{{ translate(language, 'floatingPlayer.locate') }}</span>
            </button>
            <a
              v-if="currentTrack?.gbifID"
              class="floating-audio-player__gbif-link"
              :href="`https://www.gbif.org/occurrence/${currentTrack.gbifID}`"
              target="_blank"
              rel="noreferrer"
              :title="`GBIF: ${currentTrack.gbifID}`"
            >
              <span>GBIF</span>
              <ExternalLink :size="10" />
            </a>
          </template>
        </div>

        <button
          class="floating-audio-player__play-btn"
          type="button"
          :class="{ 'is-playing': isPlaying, 'is-loading': isLoading, 'is-ambient': isAmbient }"
          :disabled="isLoading"
          :aria-label="actionLabel"
          @click="togglePlay"
        >
          <LoaderCircle v-if="isLoading" :size="16" class="spin" />
          <RotateCcw v-else-if="isEnded" :size="16" />
          <Pause v-else-if="isPlaying" :size="16" fill="currentColor" />
          <Play v-else :size="16" fill="currentColor" />
        </button>
      </div>
    </aside>
  </Transition>
</template>
