<script setup>
import { computed, toRef } from 'vue'
import { Image as ImageIcon } from '@lucide/vue'
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
// The reference keeps cluster badges visually uniform; count changes should
// not turn a dense area into an oversized visual target.
const size = computed(() => 44)
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
        <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="representative.scientificName" />
        <ImageIcon v-else :size="18" />
      </span>
      <span class="photo-pin__count">{{ cluster.records.length }}</span>
    </button>
  </MapMarker>
</template>
