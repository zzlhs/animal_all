import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { AudioProxyConstants } from './shared/audioProxy.constants.js'
import { copyAudioResponseHeaders, fetchAllowedAudio } from './shared/audioProxy.js'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function isInsideSite(filePath) {
  return filePath === siteDir || filePath.startsWith(`${siteDir}${path.sep}`)
}

async function sendFile(req, res, filePath, pathname) {
  const body = await fs.readFile(filePath)
  const immutable = pathname.startsWith('/assets/')
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

async function serveSite(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname)
  const requested = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(siteDir, `.${requested}`)

  if (!isInsideSite(filePath)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden')
    return
  }

  try {
    await sendFile(req, res, filePath, pathname)
  } catch {
    if (!String(req.headers.accept || '').includes('text/html')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
      return
    }
    try {
      await sendFile(req, res, path.join(siteDir, 'index.html'), '/index.html')
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Run npm run build before starting the production server.')
    }
  }
}

async function proxyAudio(req, res, requestUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }
  try {
    const upstream = await fetchAllowedAudio(requestUrl.searchParams.get('url'), {
      method: req.method,
      range: req.headers.range,
    })
    const headers = Object.fromEntries(copyAudioResponseHeaders(upstream.headers))
    res.writeHead(upstream.status, headers)
    if (req.method === 'HEAD' || !upstream.body) {
      res.end()
      return
    }
    Readable.fromWeb(upstream.body).pipe(res)
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Audio source is unavailable' }))
  }
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (requestUrl.pathname === AudioProxyConstants.ROUTE) {
    await proxyAudio(req, res, requestUrl)
    return
  }
  if (requestUrl.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, node: process.version }))
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }
  await serveSite(req, res)
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch(() => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Invalid request' }))
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`GBIF Photo Globe: http://localhost:${port}`)
})
