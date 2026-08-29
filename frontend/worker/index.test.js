import { describe, expect, it, vi } from 'vitest'
import worker from './index.js'

function assets() {
  return {
    fetch: vi.fn(async request => {
      const pathname = new URL(request.url).pathname
      return pathname === '/index.html'
        ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
        : new Response('Not found', { status: 404 })
    }),
  }
}

describe('Sites worker', () => {
  it('serves health for GET and HEAD only', async () => {
    const env = { ASSETS: assets() }
    const getResponse = await worker.fetch(new Request('https://example.test/api/health'), env)
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({ ok: true, runtime: 'sites' })

    const headResponse = await worker.fetch(new Request('https://example.test/api/health', { method: 'HEAD' }), env)
    expect(headResponse.status).toBe(200)
    expect(await headResponse.text()).toBe('')

    const postResponse = await worker.fetch(new Request('https://example.test/api/health', { method: 'POST' }), env)
    expect(postResponse.status).toBe(405)
    expect(postResponse.headers.get('allow')).toBe('GET, HEAD')
  })

  it('uses the SPA fallback only for HTML navigation', async () => {
    const assetBinding = assets()
    const htmlResponse = await worker.fetch(new Request('https://example.test/species/example', {
      headers: { Accept: 'text/html' },
    }), { ASSETS: assetBinding })
    expect(htmlResponse.status).toBe(200)
    expect(assetBinding.fetch).toHaveBeenCalledTimes(2)

    const missingAsset = await worker.fetch(new Request('https://example.test/assets/missing.png', {
      headers: { Accept: 'image/png' },
    }), { ASSETS: assetBinding })
    expect(missingAsset.status).toBe(404)
  })
})
