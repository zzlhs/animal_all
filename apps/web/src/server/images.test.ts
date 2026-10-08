import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { rm } from 'node:fs/promises'
const state = vi.hoisted(() => {
  const root=`/private/tmp/gbif-image-test-${process.pid}-${Date.now()}`
  process.env.RESOURCE_CACHE_DIR=root
  return {root,query:vi.fn(),fetch:vi.fn()}
})
vi.mock('./db.server.js',() => ({pool:{query:state.query}}))
vi.mock('./resourceFetch.server.js',() => ({fetchResource:state.fetch}))
import { handleImageRequest } from './images.server.js'
beforeAll(async () => {
  state.fetch.mockResolvedValue({body:await sharp({create:{width:2048,height:1536,channels:3,background:'#44aa88'}}).jpeg().toBuffer(),contentType:'image/jpeg'})
  state.query.mockResolvedValue({rows:[{identifier:'https://inaturalist-open-data.s3.amazonaws.com/photos/123/original.jpeg',format:'image/jpeg'}]})
})
afterAll(async () => { await rm(state.root,{recursive:true,force:true}) })
describe('image HTTP variants', () => {
  it('returns a real 128 px WebP and reuses its encoded bytes', async () => {
    const request=new Request('https://example.com/api/media/123/pin')
    const response=await handleImageRequest(request,'123','pin')
    expect(response.status).toBe(200)
    const body=Buffer.from(await response.arrayBuffer())
    expect(await sharp(body).metadata()).toMatchObject({format:'webp',width:128,height:128})
    expect(body.byteLength).toBeLessThan(10000)
    expect((await handleImageRequest(request,'123','pin')).headers.get('X-Resource-Cache')).toBe('HIT')
    expect(state.fetch).toHaveBeenCalledOnce()
    expect(state.fetch.mock.calls[0][0]).toContain('/small.jpeg')
  })
  it('rejects arbitrary variants and media IDs before querying the database', async () => {
    const calls=state.query.mock.calls.length
    expect((await handleImageRequest(new Request('https://example.com/image'),'../../../etc','pin')).status).toBe(404)
    expect((await handleImageRequest(new Request('https://example.com/image'),'123','original')).status).toBe(404)
    expect(state.query.mock.calls.length).toBe(calls)
  })
})
