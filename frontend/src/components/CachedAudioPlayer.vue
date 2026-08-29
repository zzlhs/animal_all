<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CircleAlert, Database, LoaderCircle, Play, RotateCcw } from '@lucide/vue'
import { resolveAudioForPlayback } from '../media/audioCache.js'
import { translate } from '../i18n.js'

const props = defineProps({
  sourceUrl: { type: String, required: true },
  language: { type: String, default: 'en' },
})

const audioElement = ref(null)
const objectUrl = ref('')
const state = ref('idle')
const cacheResult = ref('none')
let abortController = null

const isLoading = computed(() => state.value === 'loading')
const actionLabel = computed(() => isLoading.value
  ? translate(props.language, 'media.cacheLoading')
  : state.value === 'error'
    ? translate(props.language, 'media.cacheRetry')
    : translate(props.language, 'media.cacheAndPlay'))
const statusLabel = computed(() => {
  if (state.value === 'loading') return translate(props.language, 'media.cacheLoading')
  if (state.value === 'error') return translate(props.language, 'media.cacheError')
  if (cacheResult.value === 'hit') return translate(props.language, 'media.cacheHit')
  if (cacheResult.value === 'stored') return translate(props.language, 'media.cacheStored')
  if (cacheResult.value === 'failed') return translate(props.language, 'media.cacheStoreFailed')
  return ''
})

function releaseObjectUrl() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
}

function resetPlayer() {
  abortController?.abort()
  abortController = null
  audioElement.value?.pause()
  releaseObjectUrl()
  state.value = 'idle'
  cacheResult.value = 'none'
}

async function cacheAndPlay() {
  if (isLoading.value) return
  state.value = 'loading'
  abortController = new AbortController()

  try {
    const result = await resolveAudioForPlayback(props.sourceUrl, {
      signal: abortController.signal,
    })
    objectUrl.value = URL.createObjectURL(result.blob)
    cacheResult.value = result.cacheHit ? 'hit' : result.cacheStored ? 'stored' : 'failed'
    state.value = 'ready'
    await nextTick()

    try {
      await audioElement.value?.play()
    } catch {
      // Browsers may require a second user gesture after a long download.
    }
  } catch (error) {
    if (error?.name !== 'AbortError') state.value = 'error'
  } finally {
    abortController = null
  }
}

watch(() => props.sourceUrl, resetPlayer)
onBeforeUnmount(resetPlayer)
</script>

<template>
  <div class="cached-audio-player">
    <audio
      v-if="objectUrl"
      ref="audioElement"
      class="occurrence-card__audio"
      controls
      preload="metadata"
      :src="objectUrl"
      :aria-label="translate(language, 'media.playAudio')"
      @play="state = 'playing'"
      @pause="state = state === 'playing' ? 'ready' : state"
      @ended="state = 'ready'"
    />
    <button
      v-else
      class="cached-audio-player__action"
      :class="{ 'is-loading': isLoading, 'is-error': state === 'error' }"
      type="button"
      :disabled="isLoading"
      :aria-label="actionLabel"
      @click="cacheAndPlay"
    >
      <LoaderCircle v-if="isLoading" :size="15" />
      <RotateCcw v-else-if="state === 'error'" :size="15" />
      <Play v-else :size="15" fill="currentColor" />
      <span>{{ actionLabel }}</span>
    </button>

    <div v-if="statusLabel" class="cached-audio-player__status" :class="{ 'is-error': state === 'error' || cacheResult === 'failed' }" aria-live="polite">
      <CircleAlert v-if="state === 'error' || cacheResult === 'failed'" :size="12" />
      <Database v-else :size="12" />
      <span>{{ statusLabel }}</span>
    </div>
  </div>
</template>
