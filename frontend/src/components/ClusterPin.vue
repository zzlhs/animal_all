<script setup>
import { computed, toRef } from 'vue'
import { useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
import { useGlobalAudioPlayer } from '../composables/useGlobalAudioPlayer.js'
import { translate } from '../i18n.js'
import MapMarker from './MapMarker.vue'

const props = defineProps({
  cluster: { type: Object, required: true },
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['expand', 'hover-start', 'hover-end'])
const representative = computed(() => props.cluster.records[0])
const representativeRef = toRef(() => representative.value)
const { thumbnailUrl } = useOccurrenceMedia(representativeRef)
const size = computed(() => 50)

const { currentTrack, isPlaying, activeSource } = useGlobalAudioPlayer()
const isCurrentPlaying = computed(() => (
  activeSource.value === 'occurrence' &&
  isPlaying.value &&
  props.cluster.records.some(r => String(r.gbifID) === String(currentTrack.value?.gbifID))
))
</script>

<template>
  <MapMarker :lng-lat="cluster.coordinates">
    <button
      class="photo-pin photo-pin--cluster"
      :class="{ 'is-playing-audio': isCurrentPlaying }"
      :style="{ width: `${size}px`, height: `${size}px` }"
      type="button"
      :aria-label="translate(language, 'marker.cluster', { count: cluster.records.length })"
      @mouseenter="emit('hover-start', cluster)"
      @mouseleave="emit('hover-end')"
      @click.stop="emit('expand', cluster)"
    >
      <span v-if="isCurrentPlaying" class="photo-pin__sound-wave wave-1" />
      <span v-if="isCurrentPlaying" class="photo-pin__sound-wave wave-2" />
      <span v-if="isCurrentPlaying" class="photo-pin__sound-wave wave-3" />
      <span v-if="isCurrentPlaying" class="photo-pin__beacon" aria-hidden="true">
        <span class="beacon-bar bar-1"></span>
        <span class="beacon-bar bar-2"></span>
        <span class="beacon-bar bar-3"></span>
      </span>

      <span class="photo-pin__image" :class="`taxon-${representative.class?.toLowerCase() || 'other'}`">
        <img v-if="thumbnailUrl" class="photo-pin__image-blur" :src="thumbnailUrl" alt="" aria-hidden="true" />
        <img v-if="thumbnailUrl" class="photo-pin__image-main" :src="thumbnailUrl" :alt="representative.scientificName" />
      </span>
      <span class="photo-pin__inner"><span class="photo-pin__count">{{ cluster.records.length }}</span></span>
    </button>
  </MapMarker>
</template>
