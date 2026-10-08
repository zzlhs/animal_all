import { createFileRoute } from '@tanstack/react-router'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'

async function serve(request: Request, filename: string) {
  if (!/^[a-f0-9-]{36}\.pmtiles$/.test(filename)) return new Response('Not found', { status: 404 })
  const path = resolve(process.env.MAP_STORAGE_DIR || resolve(process.env.GBIF_PROJECT_ROOT || process.cwd(), 'data/maps'), filename)
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return new Response('Not found', { status: 404 })
  const headers = new Headers({ 'Content-Type': 'application/vnd.pmtiles', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges' })
  let start = 0, end = info.size - 1, status = 200
  const range = request.headers.get('range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
    if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
    else start = Math.max(0, info.size - Number(match[2]))
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status, headers })
}
export const Route = createFileRoute('/api/maps/$filename')({ server: { handlers: {
  GET: ({ request, params }) => serve(request, params.filename), HEAD: ({ request, params }) => serve(request, params.filename),
} } })
