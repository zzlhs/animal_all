<script setup>
import { computed, toRef } from 'vue'
import { AudioLines, Image as ImageIcon, Video } from '@lucide/vue'
import { recordMedia, useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
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
const mediaKinds = computed(() => new Set(recordMedia(props.record).map(item => item.kind)))
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
        <img v-if="thumbnailUrl" class="photo-pin__image-blur" :src="thumbnailUrl" alt="" aria-hidden="true" />
        <img v-if="thumbnailUrl" class="photo-pin__image-main" :src="thumbnailUrl" :alt="record.scientificName" />
      </span>
      <span class="photo-pin__inner">
        <AudioLines v-if="!thumbnailUrl && mediaKinds.has('audio')" :size="18" />
        <Video v-else-if="!thumbnailUrl && mediaKinds.has('video')" :size="18" />
        <ImageIcon v-else :size="18" />
      </span>
    </button>
    <div class="pin-tooltip" role="tooltip">
      <strong>{{ record.scientificName }}</strong>
      <span>{{ location }}</span>
    </div>
  </MapMarker>
</template>
