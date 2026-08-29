import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import type { DatabaseClient } from './db/pool.js'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost/test',
  ACTIVE_DATASET_VERSION: 'test-version',
})

const applications: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(applications.splice(0).map(application => application.close()))
  vi.unstubAllGlobals()
})

describe('health route', () => {
  it('reports an available database', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, database: 'available' })
  })

  it('reports an unavailable database', async () => {
    const database = { query: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ ok: false, database: 'unavailable' })
  })
})

describe('request validation', () => {
  it('rejects an audio source outside the allowlist', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({
      method: 'GET',
      url: '/api/audio-proxy?url=https%3A%2F%2Fexample.test%2Frecording.mp3',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'Audio source is not allowed' })
  })

  it('rejects an invalid H3 cell before querying the database', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const application = await buildApp({ config, database: { query } as unknown as DatabaseClient })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/v1/cells/5/not-a-cell/occurrences' })

    expect(response.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects invalid exact coordinates before querying the database', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const application = await buildApp({ config, database: { query } as unknown as DatabaseClient })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/v1/coordinates/91/181/occurrences' })

    expect(response.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('allows extensionless audio when the upstream MIME type is audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '120' },
    })))
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({
      method: 'HEAD',
      url: '/api/audio-proxy?url=https%3A%2F%2Fxeno-canto.org%2Fmedia%2Fdownload%3Fid%3D42',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('audio/mpeg')
  })

  it('rejects an allowlisted URL that returns HTML instead of audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({
      method: 'HEAD',
      url: '/api/audio-proxy?url=https%3A%2F%2Fxeno-canto.org%2Fmedia%2Fdownload%3Fid%3D42',
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('dataset readiness', () => {
  it('does not expose importing dataset metadata as ready', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          version: 'test-version',
          revision: '11111111-1111-4111-8111-111111111111',
          status: 'importing',
          occurrence_count: '0',
          plottable_count: '0',
          species_count: '0',
          media_count: '0',
          aves_count: '0',
          insecta_count: '0',
          audio_occurrence_count: '0',
          updated_at: new Date('2026-08-28T00:00:00Z'),
        }],
      }),
    } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/v1/meta' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ error: 'Active dataset is not ready', status: 'importing' })
  })

  it('returns the immutable revision for a ready dataset', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          version: 'test-version',
          revision: '11111111-1111-4111-8111-111111111111',
          status: 'ready',
          occurrence_count: '1',
          plottable_count: '1',
          species_count: '1',
          media_count: '0',
          aves_count: '1',
          insecta_count: '0',
          audio_occurrence_count: '0',
          updated_at: new Date('2026-08-28T00:00:00Z'),
        }],
      }),
    } as unknown as DatabaseClient
    const application = await buildApp({ config, database })
    applications.push(application)

    const response = await application.inject({ method: 'GET', url: '/api/v1/meta' })

    expect(response.statusCode).toBe(200)
    expect(response.json().dataset).toMatchObject({
      version: 'test-version',
      revision: '11111111-1111-4111-8111-111111111111',
      status: 'ready',
    })
  })
})
