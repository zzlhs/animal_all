import { describe, expect, it, vi, afterEach } from 'vitest'
vi.mock('./db.server.js', async () => {
  const { AudioProxyService } = await import('@gbif-globe/domain')
  return { audioProxyService:new AudioProxyService() }
})
import { handleAudioProxyRequest } from './audioProxy.server.js'
afterEach(() => vi.unstubAllGlobals())
describe('audio HTTP adapter', () => {
  it('preserves partial responses and forwards the Range request', async () => {
    const upstream = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(new Uint8Array([1,2]), {status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-1/10','content-length':'2'}}))
    vi.stubGlobal('fetch',upstream)
    const result = await handleAudioProxyRequest(new Request('http://localhost/api/audio-proxy?url=https://xeno-canto.org/test.mp3',{headers:{Range:'bytes=0-1'}}))
    expect(result.status).toBe(206)
    expect(result.headers.get('content-range')).toBe('bytes 0-1/10')
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1,2]))
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('range')).toBe('bytes=0-1')
  })
  it('keeps HEAD responses bodyless and preserves 416', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response(null,{status:416,headers:{'content-range':'bytes */10'}})))
    const result=await handleAudioProxyRequest(new Request('http://localhost/api/audio-proxy?url=https://xeno-canto.org/test.mp3',{method:'HEAD'}))
    expect(result.status).toBe(416)
    expect(result.body).toBeNull()
  })
})
