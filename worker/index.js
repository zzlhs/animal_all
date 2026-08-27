import { AudioProxyConstants } from '../shared/audioProxy.constants.js'
import { copyAudioResponseHeaders, fetchAllowedAudio } from '../shared/audioProxy.js'

async function proxyAudio(request, requestUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    })
  }

  try {
    const upstream = await fetchAllowedAudio(requestUrl.searchParams.get('url'), {
      method: request.method,
      range: request.headers.get('range'),
      signal: request.signal,
    })
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: copyAudioResponseHeaders(upstream.headers),
    })
  } catch {
    return Response.json({ error: 'Audio source is unavailable' }, { status: 400 })
  }
}

const worker = {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)
    const originalPath = requestUrl.pathname

    if (originalPath === AudioProxyConstants.ROUTE) return proxyAudio(request, requestUrl)

    if (originalPath === '/api/health') {
      return Response.json({ ok: true, runtime: 'sites' })
    }

    if (originalPath === '/') requestUrl.pathname = '/index.html'
    let response = await env.ASSETS.fetch(new Request(requestUrl, request))

    const acceptsHtml = request.headers.get('accept')?.includes('text/html')
    if (response.status === 404 && acceptsHtml) {
      requestUrl.pathname = '/index.html'
      response = await env.ASSETS.fetch(new Request(requestUrl, request))
    }

    return response
  },
}

export default worker
