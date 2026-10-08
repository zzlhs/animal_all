import { audioProxyService } from './db.server.js'

export async function handleAudioProxyRequest(request: Request): Promise<Response> {
  const method = request.method
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const sourceUrl = url.searchParams.get('url')

  if (!sourceUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter', code: 'BAD_REQUEST' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const range = request.headers.get('range') || undefined

  try {
    const { response, headers } = await audioProxyService.handleProxyRequest(sourceUrl, {
      method: method as 'GET' | 'HEAD',
      range,
      signal: request.signal,
      allowedHosts: process.env.AUDIO_PROXY_ALLOWED_HOSTS?.split(",").map(host => host.trim()).filter(Boolean),
    })
    return new Response(method === "HEAD" ? null : response.body, { status: response.status, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let status = 502
    if (message.includes('Invalid') || message.includes('restricted') || message.includes('not in allowed list') || message.includes('not allowed')) {
      status = 400
    }
    return new Response(JSON.stringify({ error: message, code: status === 400 ? 'BAD_REQUEST' : 'BAD_GATEWAY' }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
