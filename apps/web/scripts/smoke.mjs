import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const port = 4317
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', data => { output += data })
child.stderr.on('data', data => { output += data })
try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`)
    try { ready = (await fetch(`${base}/api/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert(ready, `Server did not listen: ${output}`)
  const page = await fetch(base)
  const html = await page.text()
  assert.equal(page.status, 200)
  assert(html.includes('globe-page'))
  assert(!output.includes('No QueryClient set'), output)
  assert(!output.includes('Error in render'), output)
  const asset = html.match(/(?:src|href)="([^\"]+\.js)"/)[1]
  const js = await fetch(new URL(asset, base), {headers:{'Accept-Encoding':'br, gzip'}})
  assert.equal(js.status, 200)
  assert.match(js.headers.get('content-type'), /javascript/)
  assert.equal(js.headers.get('content-encoding'), 'br')
  assert.match(js.headers.get('cache-control'), /immutable/)
  const cached = await fetch(new URL(asset, base), {headers:{'If-None-Match':js.headers.get('etag'),'Accept-Encoding':'br, gzip'}})
  assert.equal(cached.status,304)
  const range = await fetch(new URL(asset, base), {headers:{Range:'bytes=0-63'}})
  assert.equal(range.status,206)
  assert.equal(range.headers.get('content-encoding'),null)
  assert.equal((await range.arrayBuffer()).byteLength,64)
  const invalid = await fetch(`${base}/api/v1/occurrences/9223372036854775808`)
  assert.equal(invalid.status, 400)
  const proxy = await fetch(`${base}/api/audio-proxy?url=http://127.0.0.1/private`)
  assert.equal(proxy.status, 400)
  const detail = await fetch(`${base}/occurrence/1`)
  assert.equal(detail.status, 200)
  assert(!output.includes('window is not defined'), output)
  console.log('PASS: HTTP listen, SSR home/detail, Brotli + immutable assets, ETag + byte ranges, ID validation, audio proxy validation')
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
}
