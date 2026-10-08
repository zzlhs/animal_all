import { BasemapConstants as B } from '../features/globe/basemap.js'
import { DiskResourceCache, resourceResponse } from './resourceCache.server.js'
import { fetchResource } from './resourceFetch.server.js'
import { ResourceCacheConstants as C } from './resource.constants.js'
import { gzipSync } from 'node:zlib'

const cache = new DiskResourceCache('basemap', { ttlMs: C.BASEMAP_TTL_MS, maxBytes: C.BASEMAP_CACHE_BYTES, concurrency: 8 })
export function basemapResourcePath(path: string) {
  if (path.includes('..') || path.includes('\\') || /[?#\x00-\x1f]/.test(path)) return null
  if (/^planet\/[a-zA-Z0-9_-]+\/\d{1,2}\/\d+\/\d+\.pbf$/.test(path)
    || /^natural_earth\/ne2sr\/\d\/\d+\/\d+\.png$/.test(path)
    || /^fonts\/[a-zA-Z0-9 ,_-]+\/\d+-\d+\.pbf$/.test(path)
    || /^sprites\/ofm_[a-zA-Z0-9_-]+\/ofm(?:@2x)?\.(?:json|png)$/.test(path)) return path
  return null
}
export async function handleBasemapRequest(request: Request, rawPath: string) {
  const path = basemapResourcePath(rawPath)
  if (!path) return new Response('Not found', { status: 404 })
  try {
    const result = await cache.get(`gzip-v1:${path}`, async () => {
      const resource = await fetchResource(`${B.ORIGIN}/${path}`, { maxBytes: C.MAX_BASEMAP_RESOURCE_BYTES, contentType: /^(image\/png|application\/|text\/)/i, allowedHost: new URL(B.ORIGIN).hostname })
      const contentType = path.endsWith('.pbf') ? 'application/x-protobuf' : path.endsWith('.png') ? 'image/png' : 'application/json'
      return path.endsWith('.png') ? { ...resource, contentType } : { body: gzipSync(resource.body), contentType, contentEncoding: 'gzip' as const }
    })
    const immutable = path.startsWith('planet/') || path.startsWith('sprites/')
    return resourceResponse(request, result.resource, immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=604800, stale-while-revalidate=86400', result.hit)
  } catch {
    return new Response('Basemap temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
  }
}
