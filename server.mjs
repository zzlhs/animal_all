import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function sendFile(res, filePath, pathname) {
  const body = await fs.readFile(filePath)
  const immutable = pathname.startsWith('/assets/')
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(body)
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
    await sendFile(res, filePath, pathname)
  } catch {
    try {
      await sendFile(res, path.join(siteDir, 'index.html'), '/index.html')
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Run npm run build before starting the production server.')
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, node: process.version }))
    return
  }
  await serveSite(req, res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`GBIF Photo Globe: http://localhost:${port}`)
})
