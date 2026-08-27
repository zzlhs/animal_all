<script setup>
import { List } from '@lucide/vue'
import { translate } from '../i18n.js'
import OccurrenceListItem from './OccurrenceListItem.vue'

defineProps({
  records: { type: Array, required: true },
  position: { type: Object, required: true },
  language: { type: String, default: 'en' },
})

defineEmits(['hover-start', 'hover-end', 'select'])
</script>

<template>
  <aside
    class="occurrence-list"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    :aria-label="translate(language, 'list.aria')"
    @mouseenter="$emit('hover-start')"
    @mouseleave="$emit('hover-end')"
  >
    <header class="occurrence-list__header">
      <div>
        <div class="occurrence-list__kicker"><List :size="13" /> {{ translate(language, 'list.kicker') }}</div>
        <h2>{{ translate(language, 'list.title', { count: records.length }) }}</h2>
        <p>{{ translate(language, 'list.hint') }}</p>
      </div>
    </header>

    <div class="occurrence-list__items">
      <OccurrenceListItem v-for="record in records" :key="record.gbifID" :record="record" :language="language" @select="$emit('select', $event)" />
    </div>

    <footer class="occurrence-list__footer">{{ translate(language, 'list.footer', { count: records.length }) }}</footer>
  </aside>
</template>
