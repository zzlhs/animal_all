import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import app from './dist/server/server.js'

const root = fileURLToPath(new URL('./dist/client/', import.meta.url))
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    let file = resolve(root, '.' + decodeURIComponent(url.pathname))
    if ((req.method === 'GET' || req.method === 'HEAD') && file.startsWith(root.replace(/\/$/, '') + sep)) {
      let info = await stat(file).catch(() => null)
      if (info?.isFile()) {
        const contentType = contentTypes[extname(file)] || 'application/octet-stream'
        const compressed = /\.(js|css|json|svg)$/.test(file)
        let encoding = ''
        if (compressed && !req.headers.range) {
          const accepted = new Map((req.headers['accept-encoding'] || '').split(',').map(value => {
            const [name, quality] = value.trim().split(';')
            return [name, quality?.trim().startsWith('q=') ? Number(quality.trim().slice(2)) : 1]
          }))
          for (const candidate of ['br', 'gzip']) if ((accepted.get(candidate) || 0) > 0) {
            const path = file + (candidate === 'br' ? '.br' : '.gz')
            const packed = await stat(path).catch(() => null)
            if (packed?.isFile()) { encoding = candidate; file = path; info = packed; break }
          }
        }
        const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}-${encoding}"`
        const cacheHeaders = {
          ETag: etag,
          'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          ...(compressed ? { Vary: 'Accept-Encoding' } : {}),
          ...(encoding ? { 'Content-Encoding': encoding } : {}),
        }
        if (req.headers['if-none-match'] === etag && !req.headers.range) {
          res.writeHead(304, cacheHeaders); res.end(); return
        }
        let start = 0, end = info.size - 1, status = 200
        if (req.method === 'GET' && req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return
          }
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]))
          end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
          if (start > end || start >= info.size) {
            res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return
          }
          status = 206
        }
        res.writeHead(status, {
          'Content-Type': contentType,
          'Content-Length': Math.max(0, end - start + 1),
          'Accept-Ranges': 'bytes',
          ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
          ...cacheHeaders,
          'X-Content-Type-Options': 'nosniff',
        })
        if (req.method === 'HEAD' || info.size === 0) res.end()
        else await pipeline(createReadStream(file, { start, end }), res)
        return
      }
    }
    const init = { method: req.method, headers: req.headers, signal: controller.signal }
    if (req.method !== 'GET' && req.method !== 'HEAD') Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' })
    const response = await app.fetch(new Request(url, init))
    const headers = Object.fromEntries(response.headers)
    const cookies = response.headers.getSetCookie()
    if (cookies.length) headers['set-cookie'] = cookies
    res.writeHead(response.status, headers)
    if (!response.body || req.method === 'HEAD') res.end()
    else await pipeline(Readable.fromWeb(response.body), res)
  } catch (error) {
    if (controller.signal.aborted) return
    console.error('HTTP request failed', error)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.end('Internal server error')
  }
})
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.info('GBIF web listening', server.address())
  if (process.env.AUDIO_WORKER_EMBEDDED !== 'false' && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
    void app.fetch(new Request('http://localhost/api/audio/jobs')).then(response => {
      if (!response.ok) console.error('Audio worker startup failed:', response.status)
    }).catch(error => console.error('Audio worker startup failed:', error.message))
  }
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0))
  setTimeout(() => { server.closeAllConnections(); process.exit(0) }, 10000).unref()
})
