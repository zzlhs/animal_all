import sharp from 'sharp'
import { bigintIdSchema } from '@gbif-globe/contracts'
import { detectMediaKind, ImageVariantConstants as I, nativeImageVariant, type ImageVariant } from '@gbif-globe/media'
import { pool } from './db.server.js'
import { DiskResourceCache, resourceResponse } from './resourceCache.server.js'
import { fetchResource } from './resourceFetch.server.js'
import { ResourceCacheConstants as C } from './resource.constants.js'

const cache = new DiskResourceCache('images', { ttlMs: C.IMAGE_TTL_MS, maxBytes: C.IMAGE_CACHE_BYTES, concurrency: 4 })
export async function cachedImage(id: string, variant: ImageVariant) {
  const { rows } = await pool.query(`SELECT m.identifier, m.imagekit_url, m.format FROM media m
    JOIN datasets d ON d.id = m.dataset_id WHERE m.id = $1::bigint AND d.status IN ('ready', 'retired') LIMIT 1`, [id])
  const item = rows[0]
  if (!item || detectMediaKind(item.format, item.identifier) !== 'image') return null
  const source = item.imagekit_url || item.identifier
  return cache.get(`${I.VERSION}:${variant}:${source}`, async () => {
    const fetchOptions = { maxBytes: C.MAX_IMAGE_SOURCE_BYTES, contentType: /^image\/(jpeg|png|webp|gif|avif|tiff)/i }
    const smallSource = nativeImageVariant(source, variant)
    const upstream = await fetchResource(smallSource, fetchOptions).catch(error => {
      if (smallSource === source) throw error
      return fetchResource(source, fetchOptions)
    })
    const width = variant === 'pin' ? I.PIN_WIDTH : I.PREVIEW_WIDTH
    const body = await sharp(upstream.body, { limitInputPixels: C.MAX_IMAGE_PIXELS, animated: false }).rotate()
      .resize({ width, ...(variant === 'pin' ? { height: width, fit: 'cover' as const } : {}), withoutEnlargement: true })
      .webp({ quality: I.WEBP_QUALITY }).toBuffer()
    return { body, contentType: 'image/webp' }
  })
}
export async function handleImageRequest(request: Request, rawId: string, rawVariant: string) {
  const id = bigintIdSchema.safeParse(rawId)
  if (!id.success || !['pin', 'preview'].includes(rawVariant)) return new Response('Not found', { status: 404 })
  try {
    const result = await cachedImage(id.data, rawVariant as ImageVariant)
    if (!result) return new Response('Not found', { status: 404 })
    return resourceResponse(request, result.resource, 'public, max-age=86400, stale-while-revalidate=604800', result.hit)
  } catch {
    return new Response('Image temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
  }
}
