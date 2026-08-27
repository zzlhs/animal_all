<script setup>
import { Ban, Bird, Bug, Layers3, SlidersHorizontal } from '@lucide/vue'
import { translate } from '../i18n.js'

const props = defineProps({
  activeFilter: { type: String, default: 'all' },
  visibleCount: { type: Number, default: 0 },
  language: { type: String, default: 'en' },
})

defineEmits(['select'])

const options = [
  { id: 'all', title: 'filters.all', subtitle: 'filters.allSubtitle', icon: Ban },
  { id: 'Animalia', title: 'filters.kingdom', subtitle: 'filters.kingdomSubtitle', icon: Layers3 },
  { id: 'Aves', title: 'filters.birds', subtitle: 'filters.birdsSubtitle', icon: Bird },
  { id: 'Insecta', title: 'filters.insects', subtitle: 'filters.insectsSubtitle', icon: Bug },
]

const label = (key, values) => translate(props.language, key, values)
</script>

<template>
  <aside class="filter-panel" :aria-label="label('filters.aria')">
    <header class="filter-panel__header">
      <div class="filter-panel__title"><SlidersHorizontal :size="15" /><strong>{{ label('filters.title') }}</strong></div>
      <p>{{ label('filters.subtitle') }}</p>
    </header>
    <div class="filter-panel__options">
      <button
        v-for="option in options"
        :key="option.id"
        class="filter-panel__option"
        :class="{ active: activeFilter === option.id }"
        type="button"
        :aria-label="label(option.title)"
        @click="$emit('select', option.id)"
      >
        <span class="filter-panel__icon"><component :is="option.icon" :size="17" /></span>
        <span><strong>{{ label(option.title) }}</strong><small>{{ label(option.subtitle) }}</small></span>
      </button>
    </div>
    <div class="filter-panel__count">{{ label('filters.count', { count: visibleCount }) }}</div>
  </aside>
</template>
