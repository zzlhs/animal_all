import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, readdir, unlink, utimes, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { ResourceCacheConstants as C } from './resource.constants.js'

export interface CachedResource { body: Uint8Array; contentType: string; contentEncoding?: 'gzip' }
interface CacheMeta { contentType: string; contentEncoding?: 'gzip'; createdAt: number; bytes: number }

export class DiskResourceCache {
  private pending = new Map<string, Promise<CachedResource>>()
  private failures = new Map<string, number>()
  private active = 0
  private queue: Array<() => void> = []
  private pruning = false
  private lastPrune = 0
  readonly directory: string
  constructor(namespace: string, private options: { ttlMs: number; maxBytes: number; concurrency: number; root?: string }) {
    this.directory = resolve(options.root || process.env.RESOURCE_CACHE_DIR || resolve(process.env.GBIF_PROJECT_ROOT || process.cwd(), 'data/cache'), namespace)
  }
  private paths(key: string) {
    const hash = createHash('sha256').update(key).digest('hex')
    return { meta: resolve(this.directory, `${hash}.json`), body: resolve(this.directory, `${hash}.bin`) }
  }
  async get(key: string, loader: () => Promise<CachedResource>): Promise<{ resource: CachedResource; hit: boolean }> {
    const paths = this.paths(key)
    try {
      const meta = JSON.parse(await readFile(paths.meta, 'utf8')) as CacheMeta
      if (Date.now() - meta.createdAt < this.options.ttlMs) {
        const body = await readFile(paths.body)
        void utimes(paths.meta, new Date(), new Date()).catch(() => {})
        return { resource: { body, contentType: meta.contentType, contentEncoding: meta.contentEncoding }, hit: true }
      }
    } catch {}
    const existing = this.pending.get(key)
    if (existing) return { resource: await existing, hit: true }
    if ((this.failures.get(key) || 0) > Date.now()) throw new Error('Resource temporarily unavailable')
    if (this.queue.length >= C.MAX_QUEUE) throw new Error('Resource queue is full')
    const task = this.load(key, loader)
    this.pending.set(key, task)
    try { return { resource: await task, hit: false } }
    finally { this.pending.delete(key) }
  }
  private async load(key: string, loader: () => Promise<CachedResource>) {
    if (this.active >= this.options.concurrency) await new Promise<void>(resolve => this.queue.push(resolve))
    else this.active++
    try {
      const resource = await loader()
      if (resource.body.byteLength > this.options.maxBytes) throw new Error('Resource exceeds cache capacity')
      await mkdir(this.directory, { recursive: true })
      const paths = this.paths(key), suffix = `.${randomUUID()}.tmp`
      try {
        await writeFile(paths.body + suffix, resource.body)
        await writeFile(paths.meta + suffix, JSON.stringify({ contentType: resource.contentType, contentEncoding: resource.contentEncoding, createdAt: Date.now(), bytes: resource.body.byteLength }))
        await rename(paths.body + suffix, paths.body)
        await rename(paths.meta + suffix, paths.meta)
      } finally {
        await Promise.all([unlink(paths.body + suffix).catch(() => {}), unlink(paths.meta + suffix).catch(() => {})])
      }
      this.failures.delete(key)
      void this.prune().catch(() => {})
      return resource
    } catch (error) {
      if (this.failures.size >= C.MAX_QUEUE) this.failures.delete(this.failures.keys().next().value!)
      this.failures.set(key, Date.now() + C.FAILURE_RETRY_MS)
      throw error
    } finally {
      const next = this.queue.shift()
      if (next) next()
      else this.active--
    }
  }
  async prune(force = false) {
    if (this.pruning || (!force && Date.now() - this.lastPrune < C.PRUNE_INTERVAL_MS)) return
    this.pruning = true; this.lastPrune = Date.now()
    try {
      const names = (await readdir(this.directory)).filter(name => name.endsWith('.json'))
      const entries = []
      for (const name of names) {
        try {
          const path = resolve(this.directory, name)
          const meta = JSON.parse(await readFile(path, 'utf8')) as CacheMeta
          const info = await stat(path)
          entries.push({ ...meta, path, accessedAt: info.mtimeMs })
        } catch {}
      }
      entries.sort((a, b) => Number(Date.now() - b.createdAt >= this.options.ttlMs) - Number(Date.now() - a.createdAt >= this.options.ttlMs) || a.accessedAt - b.accessedAt)
      let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
      let count = entries.length
      for (const entry of entries) {
        if (bytes <= this.options.maxBytes && count <= C.MAX_CACHE_ENTRIES && Date.now() - entry.createdAt < this.options.ttlMs) continue
        await unlink(entry.path).catch(() => {})
        await unlink(entry.path.replace(/\.json$/, '.bin')).catch(() => {})
        bytes -= entry.bytes
        count--
      }
    } finally { this.pruning = false }
  }
}

export function resourceResponse(request: Request, resource: CachedResource, cacheControl: string, hit: boolean) {
  const acceptsGzip = (request.headers.get('accept-encoding') || '').split(',').some(value => /^gzip(?:;|$)/.test(value.trim()) && !/;\s*q=0(?:\.0*)?$/.test(value.trim()))
  const compressed = resource.contentEncoding === 'gzip'
  const body = compressed && !acceptsGzip ? gunzipSync(resource.body) : resource.body
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  const headers = { 'Content-Type': resource.contentType, 'Cache-Control': cacheControl, ETag: etag, 'X-Resource-Cache': hit ? 'HIT' : 'MISS', 'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, Content-Length, X-Resource-Cache',
    ...(compressed ? { Vary: 'Accept-Encoding' } : {}), ...(compressed && acceptsGzip ? { 'Content-Encoding': 'gzip' } : {}) }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(request.method === 'HEAD' ? null : body as BodyInit, { headers: { ...headers, 'Content-Length': String(body.byteLength) } })
}
