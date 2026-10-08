import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { runMigrations } from './migrate.js'
import { AudioJobRepository } from './repositories/AudioJobRepository.js'
import { AudioQueueConstants as C } from '@gbif-globe/contracts'

const connectionString = process.env.TEST_DATABASE_URL
const suite = connectionString ? describe : describe.skip
suite('durable audio queue in PostgreSQL', () => {
  let pool: pg.Pool, admin: pg.Pool, repository: AudioJobRepository
  const schema = `audio_queue_${Date.now()}`
  let ids: string[]
  beforeAll(async () => {
    if (!new URL(connectionString!).pathname.endsWith('_test')) throw new Error('Use an isolated database ending in _test')
    admin = new pg.Pool({ connectionString }); await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema},public` })
    await runMigrations(undefined, pool)
    const dataset = (await pool.query("INSERT INTO datasets(version,source_archive,status) VALUES('audio-test','fixture','ready') RETURNING id")).rows[0].id
    await pool.query("INSERT INTO occurrences(dataset_id,gbif_id,scientific_name) VALUES($1,1,'Bird'),($1,2,'Bird')", [dataset])
    const result = await pool.query(`INSERT INTO media(dataset_id,occurrence_gbif_id,format,identifier)
      SELECT $1,CASE WHEN n=2 THEN 2 ELSE 1 END,'audio/mpeg',source FROM UNNEST($2::text[]) WITH ORDINALITY AS sources(source,n) RETURNING id::text`,
      [dataset, ['https://xeno-canto.org/a.mp3', 'https://xeno-canto.org/a.mp3', 'https://xeno-canto.org/b.mp3', 'https://xeno-canto.org/c.mp3', 'https://xeno-canto.org/d.mp3']])
    ids = result.rows.map(r => r.id); repository = new AudioJobRepository(pool)
  }, 60_000)
  beforeEach(async () => {
    await pool.query('TRUNCATE audio_download_jobs RESTART IDENTITY')
    await pool.query("UPDATE media SET imagekit_url=NULL,imagekit_file_id=NULL,sync_status='pending'")
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() }
  })
  it('deduplicates simultaneous detail requests and elevates playback without duplicating a job', async () => {
    const requests = await Promise.all(ids.slice(0, 2).map(id => repository.enqueue({ mediaIds: [id], priority: C.DETAIL_PRIORITY })))
    expect(requests[0][0].id).toBe(requests[1][0].id)
    const promoted = await repository.enqueue({ mediaIds: [ids[1]], priority: C.PLAYBACK_PRIORITY })
    expect(promoted[0].priority).toBe(C.PLAYBACK_PRIORITY)
    expect((await repository.snapshot()).totals.total).toBe(1)
  })
  it('claims playback first and reserves capacity while one detail job is active', async () => {
    await repository.enqueue({ mediaIds: ids.slice(2), priority: C.DETAIL_PRIORITY })
    const detail = await repository.claim()
    expect(detail?.priority).toBe(C.DETAIL_PRIORITY)
    expect(await repository.claim()).toBeNull()
    await repository.enqueue({ mediaIds: [ids[0]], priority: C.PLAYBACK_PRIORITY })
    expect((await repository.claim())?.priority).toBe(C.PLAYBACK_PRIORITY)
    expect(await repository.claim()).toBeNull()
  })
  it('enforces concurrency across multiple workers', async () => {
    await repository.enqueue({ mediaIds: ids, priority: C.PLAYBACK_PRIORITY })
    const claims = await Promise.all(Array.from({ length: 8 }, () => new AudioJobRepository(pool).claim()))
    expect(claims.filter(Boolean)).toHaveLength(C.CONCURRENCY)
    expect(new Set(claims.filter(Boolean).map(job => job!.id)).size).toBe(C.CONCURRENCY)
  })
  it('recovers interrupted work and rejects stale completion', async () => {
    await repository.enqueue({ mediaIds: [ids[0]], priority: C.PLAYBACK_PRIORITY })
    const old = (await repository.claim())!
    await pool.query("UPDATE audio_download_jobs SET lease_until=NOW()-INTERVAL '1 minute'")
    const recovered = (await repository.claim())!
    expect(recovered.id).toBe(old.id); expect(recovered.attempts).toBe(2); expect(recovered.leaseToken).not.toBe(old.leaseToken)
    await repository.complete(old, { url: 'https://ik.imagekit.io/stale.mp3', fileId: 'stale', size: 10 })
    expect((await repository.find(old.id))?.playbackUrl).toBeNull()
    await repository.complete(recovered, { url: 'https://ik.imagekit.io/ready.mp3', fileId: 'ready', size: 100 })
    const media = await pool.query('SELECT imagekit_url FROM media WHERE id=ANY($1::bigint[])', [ids.slice(0, 2)])
    expect(media.rows.every(row => row.imagekit_url === 'https://ik.imagekit.io/ready.mp3')).toBe(true)
    expect((await repository.snapshot()).totals.storedBytes).toBe(100)
  })
  it('retries failed downloads and never redownloads a completed upload', async () => {
    const [job] = await repository.enqueue({ mediaIds: [ids[0]], priority: C.DETAIL_PRIORITY })
    await repository.fail((await repository.claim())!, 'SOURCE_NOT_FOUND', 'HTTP 404', false)
    expect((await repository.find(job.id))?.status).toBe('failed')
    await repository.enqueue({ mediaIds: [ids[0]], priority: C.PLAYBACK_PRIORITY, retry: true })
    const next = (await repository.claim())!
    expect(next.attempts).toBe(1)
    await repository.complete(next, { url: 'https://ik.imagekit.io/ready.mp3', fileId: 'ready', size: 100 })
    const ready = await repository.enqueue({ mediaIds: [ids[1]], priority: C.PLAYBACK_PRIORITY, retry: true })
    expect(ready[0].status).toBe('ready'); expect(await repository.claim()).toBeNull()
  })
})
