<script setup>
import { Focus, House, Languages, Minus, Monitor, Plus, SlidersVertical } from '@lucide/vue'
import { translate } from '../i18n.js'

const props = defineProps({
  filterOpen: { type: Boolean, default: false },
  theme: { type: String, default: 'dark' },
  language: { type: String, default: 'en' },
})

defineEmits(['home', 'toggle-filter', 'toggle-theme', 'toggle-language', 'zoom-in', 'zoom-out', 'reset-bearing'])

const label = key => translate(props.language, key)
</script>

<template>
  <button class="glass-control control-home" type="button" :aria-label="label('controls.home')" @click="$emit('home')">
    <House :size="20" />
  </button>

  <div class="control-top-right">
    <button class="glass-control" :class="{ active: filterOpen }" type="button" :aria-label="label('controls.filter')" @click="$emit('toggle-filter')">
      <SlidersVertical :size="20" />
    </button>
    <button class="glass-control" type="button" :aria-label="label(theme === 'dark' ? 'controls.useLight' : 'controls.useDark')" @click="$emit('toggle-theme')">
      <Monitor :size="20" />
    </button>
    <button class="glass-control control-language" type="button" :aria-label="label(language === 'zh' ? 'controls.switchToEnglish' : 'controls.switchToChinese')" @click="$emit('toggle-language')">
      <Languages :size="18" />
      <span aria-hidden="true">{{ language === 'zh' ? 'EN' : '中' }}</span>
    </button>
  </div>

  <div class="control-zoom">
    <button type="button" :aria-label="label('controls.zoomIn')" @click="$emit('zoom-in')"><Plus :size="21" /></button>
    <button type="button" :aria-label="label('controls.zoomOut')" @click="$emit('zoom-out')"><Minus :size="21" /></button>
    <button type="button" :aria-label="label('controls.bearing')" @click="$emit('reset-bearing')"><Focus :size="20" /></button>
  </div>
</template>
