<script setup>
import { inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { MapContextKey } from '../map/context.js'

const props = defineProps({
  lngLat: { type: Array, required: true },
})

const context = inject(MapContextKey)
const element = ref(null)
let marker = null

watch(
  [() => context.ready.value, () => props.lngLat[0], () => props.lngLat[1]],
  async ([isReady]) => {
    if (!isReady) return
    await nextTick()
    if (!marker) {
      marker = new context.mapLibrary.value.Marker({
        element: element.value,
        anchor: 'center',
        // Do not leave DOM markers visible on the back side of the globe.
        opacityWhenCovered: 0,
      })
        .setLngLat(props.lngLat)
        .addTo(context.map.value)
    } else {
      marker.setLngLat(props.lngLat)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => marker?.remove())
</script>

<template>
  <div ref="element" class="map-marker-host"><slot /></div>
</template>
