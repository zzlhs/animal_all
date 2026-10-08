import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { DiskResourceCache, resourceResponse } from './resourceCache.server.js'
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory,{recursive:true,force:true}))) })
async function cache(options = {}) {
  const root=await mkdtemp(resolve(tmpdir(),'gbif-cache-test-'));directories.push(root)
  return new DiskResourceCache('images',{root,ttlMs:10000,maxBytes:1000,concurrency:1,...options})
}
const resource = { body:new Uint8Array([1,2,3]),contentType:'image/webp' }
describe('persistent resource cache', () => {
  it('shares concurrent generation and reuses it after the cache instance restarts', async () => {
    const first=await cache()
    const load=vi.fn(async () => { await new Promise(resolve => setTimeout(resolve,10)); return resource })
    await Promise.all([first.get('same',load),first.get('same',load)])
    expect(load).toHaveBeenCalledOnce()
    const restarted=new DiskResourceCache('images',{root:resolve(first.directory,'..'),ttlMs:10000,maxBytes:1000,concurrency:1})
    expect((await restarted.get('same',load)).hit).toBe(true)
    expect(load).toHaveBeenCalledOnce()
  })
  it('does not persist a failed download and limits retry storms', async () => {
    const store=await cache(),load=vi.fn(async () => { throw new Error('upstream unavailable') })
    await expect(store.get('bad',load)).rejects.toThrow('upstream')
    await expect(store.get('bad',load)).rejects.toThrow('temporarily unavailable')
    expect(load).toHaveBeenCalledOnce()
  })
  it('expires old content and honors HTTP revalidation', async () => {
    const store=await cache({ttlMs:1}),load=vi.fn(async () => resource)
    await store.get('expired',load);await new Promise(resolve => setTimeout(resolve,5));await store.get('expired',load)
    expect(load).toHaveBeenCalledTimes(2)
    const response=resourceResponse(new Request('https://example.com/image'),resource,'public, max-age=60',true)
    const conditional=resourceResponse(new Request('https://example.com/image',{headers:{'If-None-Match':response.headers.get('etag')!}}),resource,'public, max-age=60',true)
    expect(conditional.status).toBe(304)
    expect(conditional.body).toBeNull()
  })
  it('serves cached compressed tiles only to clients that accept gzip', async () => {
    const tile={body:gzipSync(resource.body),contentType:'application/x-protobuf',contentEncoding:'gzip' as const}
    const compressed=resourceResponse(new Request('https://example.com/tile',{headers:{'Accept-Encoding':'gzip, br'}}),tile,'public, max-age=60',true)
    expect(compressed.headers.get('content-encoding')).toBe('gzip')
    expect([...gunzipSync(Buffer.from(await compressed.arrayBuffer()))]).toEqual([1,2,3])
    const plain=resourceResponse(new Request('https://example.com/tile',{headers:{'Accept-Encoding':'gzip;q=0'}}),tile,'public, max-age=60',true)
    expect(plain.headers.get('content-encoding')).toBeNull()
    expect([...new Uint8Array(await plain.arrayBuffer())]).toEqual([1,2,3])
  })
})
