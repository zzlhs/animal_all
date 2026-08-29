<script setup>
import { computed, toRef } from 'vue'
import { useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
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
// Match the reference cluster marker: the representative photo fills the
// circular marker while the count sits in a compact dark glass center.
const size = computed(() => 50)
</script>

<template>
  <MapMarker :lng-lat="cluster.coordinates">
    <button
      class="photo-pin photo-pin--cluster"
      :style="{ width: `${size}px`, height: `${size}px` }"
      type="button"
      :aria-label="translate(language, 'marker.cluster', { count: cluster.records.length })"
      @mouseenter="emit('hover-start', cluster)"
      @mouseleave="emit('hover-end')"
      @click.stop="emit('expand', cluster)"
    >
      <span class="photo-pin__image" :class="`taxon-${representative.class?.toLowerCase() || 'other'}`">
        <img v-if="thumbnailUrl" class="photo-pin__image-blur" :src="thumbnailUrl" alt="" aria-hidden="true" />
        <img v-if="thumbnailUrl" class="photo-pin__image-main" :src="thumbnailUrl" :alt="representative.scientificName" />
      </span>
      <span class="photo-pin__inner"><span class="photo-pin__count">{{ cluster.records.length }}</span></span>
    </button>
  </MapMarker>
</template>
