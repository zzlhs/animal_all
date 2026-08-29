import { ref, watch } from 'vue'
import { MediaUrlConstants } from '../config/data.constants.js'

export function mediaUrl(media) {
  for (const value of [media?.identifier, media?.references]) {
    if (!value) continue
    try {
      const url = new URL(value)
      if (MediaUrlConstants.ALLOWED_PROTOCOLS.includes(url.protocol)) return url.href
    } catch {}
  }
  return ''
}

export function mediaKind(media) {
  const type = String(media?.type || '').toLowerCase()
  const format = String(media?.format || '').toLowerCase()
  const url = mediaUrl(media).toLowerCase()

  if (type.includes('sound') || format.startsWith('audio/') || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)([?#]|$)/i.test(url)) return 'audio'
  if (type.includes('movingimage') || type.includes('video') || format.startsWith('video/') || /\.(avi|m4v|mov|mp4|ogv|webm)([?#]|$)/i.test(url)) return 'video'
  if (type.includes('stillimage') || format.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)([?#]|$)/i.test(url)) return 'image'
  return 'other'
}

export function recordMedia(record) {
  if (!Array.isArray(record?.media)) return []
  return record.media
    .map((media, index) => ({
      ...media,
      id: `${record.gbifID || 'record'}-media-${index}`,
      kind: mediaKind(media),
      url: mediaUrl(media),
    }))
    .filter(media => media.url)
}

export function useOccurrenceMedia(recordSource) {
  const thumbnailUrl = ref('')
  watch(
    () => recordSource.value?.gbifID,
    () => {
      thumbnailUrl.value = ''
      const record = recordSource.value
      thumbnailUrl.value = recordMedia(record).find(media => media.kind === 'image')?.url || ''
    },
    { immediate: true },
  )
  return { thumbnailUrl }
}
