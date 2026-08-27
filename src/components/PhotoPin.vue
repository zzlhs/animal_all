<script setup>
import { computed, toRef } from 'vue'
import { Image as ImageIcon } from '@lucide/vue'
import { useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
import { formatLocation } from '../map/formatting.js'
import { translate } from '../i18n.js'
import MapMarker from './MapMarker.vue'

const props = defineProps({
  record: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['select', 'hover-start', 'hover-end'])
const recordRef = toRef(props, 'record')
const { thumbnailUrl } = useOccurrenceMedia(recordRef)
const location = computed(() => formatLocation(props.record, props.language))
</script>

<template>
  <MapMarker :lng-lat="[record.longitude, record.latitude]">
    <button
      class="photo-pin photo-pin--single"
      :class="{ 'is-selected': selected }"
      type="button"
      :aria-label="translate(language, 'marker.named', { name: record.scientificName })"
      @mouseenter="emit('hover-start', record)"
      @mouseleave="emit('hover-end')"
      @click.stop="emit('select', record)"
    >
      <span class="photo-pin__pulse" />
      <span class="photo-pin__ping" />
      <span class="photo-pin__image" :class="`taxon-${record.class?.toLowerCase() || 'other'}`">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="record.scientificName" />
        <ImageIcon v-if="selected || !thumbnailUrl" :size="18" />
      </span>
    </button>
    <div class="pin-tooltip" role="tooltip">
      <strong>{{ record.scientificName }}</strong>
      <span>{{ location }}</span>
    </div>
  </MapMarker>
</template>
