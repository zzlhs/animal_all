import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyLocalPmtiles, verifyRemotePmtiles } from './verify-pmtiles.js'

afterEach(() => vi.unstubAllGlobals())

describe('remote PMTiles verification', () => {
  it('requires byte ranges and a valid v3 header', async () => {
    const header = new Uint8Array(127)
    header.set(new TextEncoder().encode('PMTiles'))
    header[7] = 3
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(header, {
      status: 206,
      headers: { 'Content-Range': 'bytes 0-126/4096', 'Content-Type': 'application/vnd.pmtiles' },
    })))
    await expect(verifyRemotePmtiles('https://cdn.example.test/map.pmtiles')).resolves.toMatchObject({
      contentRange: 'bytes 0-126/4096',
    })
  })

  it('rejects hosts that ignore Range requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(127), { status: 200 })))
    await expect(verifyRemotePmtiles('https://cdn.example.test/map.pmtiles')).rejects.toThrow('expected 206')
  })
})

describe('local PMTiles verification', () => {
  it('accepts a complete PMTiles v3 header and rejects another file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gbif-pmtiles-'))
    try {
      const validPath = join(directory, 'valid.pmtiles')
      const invalidPath = join(directory, 'invalid.pmtiles')
      const header = new Uint8Array(127)
      header.set(new TextEncoder().encode('PMTiles'))
      header[7] = 3
      await writeFile(validPath, header)
      await writeFile(invalidPath, new Uint8Array(127))

      await expect(verifyLocalPmtiles(validPath)).resolves.toBeUndefined()
      await expect(verifyLocalPmtiles(invalidPath)).rejects.toThrow('not a PMTiles v3 archive')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
