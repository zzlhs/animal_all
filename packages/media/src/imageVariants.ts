import type { OccurrenceMediaItem } from '@gbif-globe/contracts'

export const ImageVariantConstants = Object.freeze({
  PIN_WIDTH: 128,
  PREVIEW_WIDTH: 640,
  WEBP_QUALITY: 78,
  VERSION: 'v1',
})
export type ImageVariant = 'pin' | 'preview'

export function imageVariantPath(id: string, variant: ImageVariant) {
  return `/api/media/${encodeURIComponent(id)}/${variant}?v=${ImageVariantConstants.VERSION}`
}

// Prefer the provider's smaller file before resizing, so a cache miss also avoids the original download.
export function nativeImageVariant(raw: string, variant: ImageVariant): string {
  try {
    const url = new URL(raw)
    if ((url.hostname === 'inaturalist-open-data.s3.amazonaws.com' || url.hostname === 'static.inaturalist.org') && /^\/photos\/\d+\/(original|large|medium|small|square)\.[a-z]+$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/(original|large|medium|small|square)\./, `/${variant === 'pin' ? 'small' : 'medium'}.`)
      return url.href
    }
  } catch {}
  return raw
}

export function imageDisplayUrl(image: OccurrenceMediaItem | undefined, variant: ImageVariant) {
  if (!image || image.kind !== 'image') return ''
  return (variant === 'preview' ? image.previewUrl : image.thumbnailUrl) || imageVariantPath(image.id, variant)
}
