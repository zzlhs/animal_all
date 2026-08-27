<script setup>
import { computed, toRef } from 'vue'
import { CalendarDays, Database, ExternalLink, Image as ImageIcon, MapPin, Ruler } from '@lucide/vue'
import { useOccurrenceMedia } from '../composables/useOccurrenceMedia.js'
import { formatEventDate, formatLocation } from '../map/formatting.js'
import { translate, translateBasis } from '../i18n.js'

const props = defineProps({
  record: { type: Object, required: true },
  position: { type: Object, required: true },
  language: { type: String, default: 'en' },
})

defineEmits(['hover-start', 'hover-end'])
const recordRef = toRef(props, 'record')
const { thumbnailUrl } = useOccurrenceMedia(recordRef)

const location = computed(() => formatLocation(props.record, props.language))
const date = computed(() => formatEventDate(props.record.eventDate, props.language) || translate(props.language, 'card.dateUnavailable'))
const coordinates = computed(() => `${Math.abs(props.record.latitude).toFixed(4)}°${props.record.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(props.record.longitude).toFixed(4)}°${props.record.longitude >= 0 ? 'E' : 'W'}`)
const basis = computed(() => translateBasis(props.language, props.record.basisOfRecord))
const uncertainty = computed(() => props.record.coordinateUncertaintyInMeters ? translate(props.language, 'card.uncertainty', { value: props.record.coordinateUncertaintyInMeters }) : translate(props.language, 'card.coordinateUnavailable'))
</script>

<template>
  <article
    class="occurrence-card"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    @mouseenter="$emit('hover-start')"
    @mouseleave="$emit('hover-end')"
  >
    <div class="occurrence-card__hero" :class="`taxon-${record.class?.toLowerCase() || 'other'}`">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="record.scientificName" />
      <ImageIcon v-else class="occurrence-card__placeholder" :size="34" />
    </div>
    <div class="occurrence-card__body">
      <a :href="`https://www.gbif.org/occurrence/${record.gbifID}`" target="_blank" rel="noreferrer" :aria-label="translate(language, 'card.openInGbif')">
        <h3>{{ record.scientificName }}</h3><ExternalLink :size="14" />
      </a>
      <p class="occurrence-card__summary">{{ location }} <span>·</span> {{ date }}</p>
      <div class="occurrence-card__fact"><Database :size="15" /><span>{{ basis }}</span></div>
      <div class="occurrence-card__fact"><MapPin :size="15" /><span>{{ coordinates }}</span></div>
      <div class="occurrence-card__fact"><Ruler :size="15" /><span>{{ uncertainty }}</span></div>
      <div class="occurrence-card__fact occurrence-card__id"><CalendarDays :size="15" /><span>GBIF {{ record.gbifID }}</span></div>
    </div>
  </article>
</template>
