<script setup>
import { computed } from 'vue'
import { CircleAlert, Database, LoaderCircle, Pause, Play, RotateCcw } from '@lucide/vue'
import { useGlobalAudioPlayer } from '../composables/useGlobalAudioPlayer.js'
import { translate } from '../i18n.js'

const props = defineProps({
  sourceUrl: { type: String, required: true },
  record: { type: Object, default: null },
  mediaItem: { type: Object, default: null },
  thumbnail: { type: String, default: '' },
  language: { type: String, default: 'en' },
})

const {
  currentTrack,
  state: globalState,
  cacheResult: globalCacheResult,
  playTrack,
  togglePlay,
} = useGlobalAudioPlayer()

const isCurrentTrack = computed(() => currentTrack.value?.sourceUrl === props.sourceUrl)
const isPlaying = computed(() => isCurrentTrack.value && globalState.value === 'playing')
const isLoading = computed(() => isCurrentTrack.value && globalState.value === 'loading')
const isError = computed(() => isCurrentTrack.value && globalState.value === 'error')

const actionLabel = computed(() => {
  if (isLoading.value) return translate(props.language, 'media.cacheLoading')
  if (isPlaying.value) return translate(props.language, 'floatingPlayer.pause')
  if (isCurrentTrack.value && globalState.value === 'paused') return translate(props.language, 'floatingPlayer.play')
  if (isError.value) return translate(props.language, 'media.cacheRetry')
  return translate(props.language, 'media.cacheAndPlay')
})

const statusLabel = computed(() => {
  if (!isCurrentTrack.value) return ''
  if (globalState.value === 'loading') return translate(props.language, 'media.cacheLoading')
  if (globalState.value === 'error') return translate(props.language, 'media.cacheError')
  if (globalCacheResult.value === 'hit') return translate(props.language, 'media.cacheHit')
  if (globalCacheResult.value === 'stored') return translate(props.language, 'media.cacheStored')
  if (globalCacheResult.value === 'failed') return translate(props.language, 'media.cacheStoreFailed')
  return ''
})

function handleClick() {
  if (isLoading.value) return
  if (isCurrentTrack.value) {
    togglePlay()
    return
  }

  playTrack({
    id: `${props.record?.gbifID || ''}-${props.mediaItem?.id || props.sourceUrl}`,
    sourceUrl: props.sourceUrl,
    scientificName: props.record?.scientificName || '',
    vernacularName: props.record?.vernacularName || '',
    thumbnail: props.thumbnail || '',
    gbifID: props.record?.gbifID || '',
    record: props.record,
    mediaItem: props.mediaItem,
  })
}
</script>

<template>
  <div class="cached-audio-player">
    <button
      class="cached-audio-player__action"
      :class="{
        'is-loading': isLoading,
        'is-playing': isPlaying,
        'is-error': isError,
      }"
      type="button"
      :disabled="isLoading"
      :aria-label="actionLabel"
      @click="handleClick"
    >
      <LoaderCircle v-if="isLoading" :size="15" class="spin" />
      <RotateCcw v-else-if="isError" :size="15" />
      <template v-else-if="isPlaying">
        <Pause :size="15" fill="currentColor" />
        <span class="cached-audio-player__wave" aria-hidden="true">
          <span class="wave-bar bar-1"></span>
          <span class="wave-bar bar-2"></span>
          <span class="wave-bar bar-3"></span>
        </span>
      </template>
      <Play v-else :size="15" fill="currentColor" />
      <span>{{ actionLabel }}</span>
    </button>

    <div
      v-if="statusLabel"
      class="cached-audio-player__status"
      :class="{ 'is-error': isError || globalCacheResult === 'failed' }"
      aria-live="polite"
    >
      <CircleAlert v-if="isError || globalCacheResult === 'failed'" :size="12" />
      <Database v-else :size="12" />
      <span>{{ statusLabel }}</span>
    </div>
  </div>
</template>
