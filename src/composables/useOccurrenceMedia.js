import { ref, watch } from 'vue'

const mediaRequests = new Map()

function isDisplayableImage(media) {
  const url = media?.identifier || media?.references || ''
  return media?.type === 'StillImage' || /\.(avif|jpe?g|png|webp)(\?|$)/i.test(url)
}

async function fetchOccurrenceThumbnail(record) {
  if (!record?.gbifID) return ''
  if (!mediaRequests.has(record.gbifID)) {
    const request = fetch(`https://api.gbif.org/v1/occurrence/${encodeURIComponent(record.gbifID)}`)
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        const media = payload?.media?.find(isDisplayableImage)
        return media?.identifier || media?.references || ''
      })
      .catch(() => '')
    mediaRequests.set(record.gbifID, request)
  }
  return mediaRequests.get(record.gbifID)
}

export function useOccurrenceMedia(recordSource) {
  const thumbnailUrl = ref('')
  watch(
    () => recordSource.value?.gbifID,
    async () => {
      thumbnailUrl.value = ''
      const record = recordSource.value
      const result = await fetchOccurrenceThumbnail(record)
      if (recordSource.value?.gbifID === record?.gbifID) thumbnailUrl.value = result
    },
    { immediate: true },
  )
  return { thumbnailUrl }
}
