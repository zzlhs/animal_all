<script setup>
import { computed, toRef } from 'vue'
import { AudioLines, ChevronRight, Image as ImageIcon, Video } from '@lucide/vue'
import { recordMedia, useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
import { formatEventDate, formatLocation } from '../map/formatting.js'
import { translate } from '../i18n.js'

const props = defineProps({
  record: { type: Object, required: true },
  language: { type: String, default: 'en' },
})

defineEmits(['select'])

const recordRef = toRef(props, 'record')
const { thumbnailUrl } = useOccurrenceMedia(recordRef)
const mediaKinds = computed(() => new Set(recordMedia(props.record).map(item => item.kind)))
const location = computed(() => formatLocation(props.record, props.language))
const date = computed(() => formatEventDate(props.record.eventDate, props.language) || translate(props.language, 'card.dateUnavailable'))
</script>

<template>
  <button class="occurrence-list__item" type="button" :aria-label="translate(language, 'list.open', { name: record.scientificName })" @click="$emit('select', record)">
    <span class="occurrence-list__thumb" :class="`taxon-${record.class?.toLowerCase() || 'other'}`">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="record.scientificName" />
      <ImageIcon v-else :size="19" />
    </span>
    <span class="occurrence-list__copy">
      <strong>{{ record.scientificName }}</strong>
      <small>{{ location }}</small>
      <small>{{ date }}</small>
      <span v-if="mediaKinds.size" class="occurrence-list__media-badges" aria-hidden="true">
        <ImageIcon v-if="mediaKinds.has('image')" :size="11" />
        <AudioLines v-if="mediaKinds.has('audio')" :size="11" />
        <Video v-if="mediaKinds.has('video')" :size="11" />
      </span>
    </span>
    <ChevronRight class="occurrence-list__chevron" :size="16" />
  </button>
</template>
