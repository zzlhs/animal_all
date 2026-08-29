<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, X } from '@lucide/vue'
import { translate } from '../i18n.js'

const props = defineProps({
  images: { type: Array, default: () => [] },
  scientificName: { type: String, default: '' },
  language: { type: String, default: 'en' },
})

const emit = defineEmits(['interaction-start', 'interaction-end'])
const activeIndex = ref(0)
const isOpen = ref(false)
const activeImage = computed(() => props.images[activeIndex.value] || null)

function open(index = 0) {
  activeIndex.value = Math.max(0, Math.min(index, props.images.length - 1))
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function move(offset) {
  if (!props.images.length) return
  activeIndex.value = (activeIndex.value + offset + props.images.length) % props.images.length
}

function onKeydown(event) {
  if (!isOpen.value) return
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowLeft') move(-1)
  if (event.key === 'ArrowRight') move(1)
}

watch(isOpen, value => {
  if (value) {
    document.addEventListener('keydown', onKeydown)
    emit('interaction-start')
  } else {
    document.removeEventListener('keydown', onKeydown)
    emit('interaction-end')
  }
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="image-gallery">
    <button
      v-if="images.length"
      type="button"
      class="image-gallery__hero"
      :aria-label="translate(language, 'media.openGallery')"
      @click="open(0)"
    >
      <img :src="images[0].url" :alt="images[0].title || scientificName" />
      <span v-if="images.length > 1" class="occurrence-card__media-count">
        <ImageIcon :size="12" /> {{ translate(language, 'media.imageCount', { count: images.length }) }}
      </span>
    </button>
    <div v-else class="image-gallery__placeholder">
      <ImageIcon :size="34" />
    </div>

    <div v-if="images.length > 1" class="image-gallery__thumbs" :aria-label="translate(language, 'media.galleryThumbs')">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        type="button"
        :class="{ 'is-active': index === activeIndex }"
        :aria-label="translate(language, 'media.openImage', { index: index + 1 })"
        @click="open(index)"
      >
        <img :src="image.url" :alt="image.title || scientificName" loading="lazy" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen && activeImage"
        class="image-lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="translate(language, 'media.galleryDialog')"
        @click.self="close"
        @mouseenter="$emit('interaction-start')"
      >
        <button type="button" class="image-lightbox__close" :aria-label="translate(language, 'media.closeGallery')" @click="close">
          <X :size="22" />
        </button>
        <button
          v-if="images.length > 1"
          type="button"
          class="image-lightbox__nav image-lightbox__nav--previous"
          :aria-label="translate(language, 'media.previousImage')"
          @click="move(-1)"
        >
          <ChevronLeft :size="28" />
        </button>
        <figure>
          <img :src="activeImage.url" :alt="activeImage.title || scientificName" />
          <figcaption>
            <span>{{ activeIndex + 1 }} / {{ images.length }}<template v-if="activeImage.title"> · {{ activeImage.title }}</template></span>
            <a
              :href="activeImage.source || activeImage.references || activeImage.url"
              target="_blank"
              rel="noreferrer"
            >
              {{ translate(language, 'media.openOriginal') }} <ExternalLink :size="14" />
            </a>
          </figcaption>
        </figure>
        <button
          v-if="images.length > 1"
          type="button"
          class="image-lightbox__nav image-lightbox__nav--next"
          :aria-label="translate(language, 'media.nextImage')"
          @click="move(1)"
        >
          <ChevronRight :size="28" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
