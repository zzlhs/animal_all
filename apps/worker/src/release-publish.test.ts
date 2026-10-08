import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateRelease, runPublish } from './release-publish.js'
import { pmtilesFixture } from './map/pmtiles.fixture.js'
const revision = '11111111-1111-4111-8111-111111111111'
let folder: string
let stored: Buffer
async function fixture(change = {}) {
  folder = await mkdtemp(join(tmpdir(), 'gbif-release-test-'))
  stored = pmtilesFixture(revision)
  await writeFile(join(folder, 'test.pmtiles'), stored)
  const manifest = { datasetRevision: revision, localPath: 'test.pmtiles', pmtilesUrl: 'https://cdn.example.com/test.pmtiles', sourceLayer: 'gbif_occurrences', featureSchemaVersion: 2,
    sha256: createHash('sha256').update(stored).digest('hex'), size: stored.length, verifyOrigin: 'https://globe.example.com', sampleTiles: [{ z: 0, x: 0, y: 0 }], ...change }
  const path = join(folder, 'release.json')
  await writeFile(path, JSON.stringify(manifest))
  vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
    const headers = { 'content-length': String(stored.length), 'access-control-allow-origin': '*', 'etag': 'fixture' }
    if (init?.method === 'HEAD') return new Response(null, { headers })
    const range = new Headers(init?.headers).get('range')
    if (range) {
      const [,startText,endText] = range.match(/bytes=(\d+)-(\d+)/)!
      const start = Number(startText), end = Math.min(Number(endText), stored.length - 1)
      return new Response(new Uint8Array(stored.subarray(start,end+1)), { status:206, headers: { ...headers, 'content-length':String(end-start+1), 'content-range':`bytes ${start}-${end}/${stored.length}` } })
    }
    return new Response(new Uint8Array(stored), { headers })
  }))
  return path
}
afterEach(async () => { vi.unstubAllGlobals(); if (folder) await rm(folder,{recursive:true,force:true}) })
describe('publication gate', () => {
  it('verifies a real archive and dry run does not require or write a database', async () => {
    const path = await fixture()
    expect((await validateRelease(path)).datasetRevision).toBe(revision)
    await runPublish({ manifestPath:path,dryRun:true })
  })
  it('rejects placeholder hashes before any remote request', async () => {
    const path = await fixture({ sha256:'manual-hash' })
    await expect(validateRelease(path)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects remote bytes differing from the verified local artifact', async () => {
    const path = await fixture()
    stored = Buffer.from(stored); stored[stored.length-1] ^= 1
    await expect(validateRelease(path)).rejects.toThrow('content does not match')
  })
  it('rejects a valid archive belonging to another dataset revision', async () => {
    const path = await fixture({datasetRevision:'22222222-2222-4222-8222-222222222222'})
    await expect(validateRelease(path)).rejects.toThrow('revision/schema')
  })
  it('requires real HTTP Range support', async () => {
    const path = await fixture()
    vi.stubGlobal('fetch',vi.fn(async (_input,init) => new Response(init?.method==='HEAD'?null:new Uint8Array(stored),{headers:{'content-length':String(stored.length)}})))
    await expect(validateRelease(path)).rejects.toThrow('expected 206')
  })
})
