const worker = {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)
    const originalPath = requestUrl.pathname

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
