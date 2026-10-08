import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { latLngToCell } from 'h3-js'
import { runMigrations } from './migrate.js'
import { DatasetRepository } from './repositories/DatasetRepository.js'
import { OccurrenceRepository } from './repositories/OccurrenceRepository.js'
import { MapReleaseRepository } from './repositories/MapReleaseRepository.js'
import { OccurrenceService } from '../../domain/src/OccurrenceService.js'
import { AmbientTrackService } from '../../domain/src/AmbientTrackService.js'
import { ReleaseService } from '../../domain/src/ReleaseService.js'
import { rebuildAggregates } from '../../../apps/worker/src/import/rebuild-aggregates.js'

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('PostGIS migration and release integration', () => {
  let pool: pg.Pool
  let admin: pg.Pool
  const schema = `repair_${Date.now()}`
  let datasetId: string
  let revision: string
  let unpublished: string
  let releaseId: string
  const cells = Array.from({ length: 7 }, (_, i) => latLngToCell(0, 0, i + 2))
  let service: OccurrenceService
  beforeAll(async () => {
    if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use an isolated database ending in _test')
    admin = new pg.Pool({ connectionString: url })
    await admin.query('CREATE EXTENSION IF NOT EXISTS postgis')
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` })
    await runMigrations(undefined, pool)
    expect(await runMigrations(undefined, pool)).toEqual([])
    await pool.query("INSERT INTO species (species_key,scientific_name,class_name) VALUES (10,'Species A','Insecta'),(11,'Species B','Insecta')")
    const d = await pool.query("INSERT INTO datasets (version,source_archive,status) VALUES ('test-v1','fixture','ready') RETURNING id::text,revision::text")
    datasetId = d.rows[0].id; revision = d.rows[0].revision
    for (let i = 1; i <= 4; i++) {
      await pool.query(`INSERT INTO occurrences (dataset_id,gbif_id,species_key,scientific_name,decimal_latitude,decimal_longitude,
        raw_data,h3_r2,h3_r3,h3_r4,h3_r5,h3_r6,h3_r7,h3_r8)
        VALUES ($1,$2,$3,$4,0,0,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [datasetId, String(i), i === 4 ? null : i === 3 ? '11' : '10', `Species ${i}`, JSON.stringify({ className: i === 3 ? 'Insecta' : 'Aves', vernacularName: 'Fixture' }), ...cells])
    }
    await pool.query(`INSERT INTO media (dataset_id,occurrence_gbif_id,media_type,format,identifier) VALUES
      ($1,1,'Sound','audio/mpeg','https://example.com/a.mp3'),($1,1,'Sound','audio/mpeg','https://example.com/b.mp3'),($1,3,'Sound','audio/mpeg','https://example.com/c.mp3')`, [datasetId])
    const client = await pool.connect()
    try { await rebuildAggregates(client, datasetId, 8) } finally { client.release() }
    const releases = new ReleaseService(new DatasetRepository(), new MapReleaseRepository(), pool)
    releaseId = (await releases.publishRelease({ datasetRevision: revision, pmtilesUrl: 'https://example.com/test-v1.pmtiles', sourceLayer: 'gbif_occurrences', featureSchemaVersion: 2, objectSha256: 'a'.repeat(64), objectSizeBytes: 128, manifest: {}, validatedAt: new Date() })).id
    unpublished = (await pool.query("INSERT INTO datasets (version,source_archive,status) VALUES ('unpublished','fixture','ready') RETURNING revision::text")).rows[0].revision
    service = new OccurrenceService(new OccurrenceRepository(), new DatasetRepository(), pool)
  }, 60000)
  afterAll(async () => {
    await pool?.end()
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() }
  })
  it('selects the active release, not the newest ready dataset', async () => {
    const record = await service.getOccurrence('1')
    expect(record.datasetRevision).toBe(revision)
    expect(record.record.media).toHaveLength(2)
  })
  it('does not expose an unpublished revision', async () => {
    await expect(service.getOccurrence('1', unpublished)).rejects.toMatchObject({ status: 410 })
  })
  it('materializes audio record counts independently from audio assets', async () => {
    const result = await service.getCellOccurrences(8, cells[6], { revision, filter: 'audio' })
    expect(result.items.map(r => r.gbifId)).toEqual(['1','3'])
    expect(result.total).toBe(2)
    const r = await pool.query('SELECT audio_count,audio_occurrence_count FROM species_cells WHERE dataset_id=$1 AND species_key=10', [datasetId])
    expect(Number(r.rows[0].audio_count)).toBe(2)
    expect(Number(r.rows[0].audio_occurrence_count)).toBe(1)
  })
  it('returns all audio assets once and batch loads marker records from the snapshot', async () => {
    const tracks = await new AmbientTrackService(new OccurrenceRepository(), new DatasetRepository(), pool).getAmbientTracks('en', revision)
    expect(tracks).toHaveLength(3)
    expect(tracks.map(track => track.gbifId)).toEqual(['1','1','3'])
    const small = await new OccurrenceRepository().listSmallMap(pool, datasetId, 160)
    expect(small).toHaveLength(4)
    expect(small.find(record => record.gbifId === '1')?.media).toHaveLength(2)
  })
  it('queries the real r8 schema and keeps total on empty last page', async () => {
    const first = await service.getCellSpecies(8, cells[6], { revision, limit: 1 })
    expect(first.items[0].sampleGbifId).toBe('1')
    const next = await service.getCellSpecies(8, cells[6], { revision, limit: 1, cursor: first.nextCursor! })
    expect(next.items[0].speciesKey).toBe('11')
    expect(next.total).toBe(2)
  })
  it('applies coordinate filters and respects classification snapshots', async () => {
    const birds = await service.getCoordinateOccurrences(0, 0, { revision, filter: 'Aves' })
    expect(birds.items.map(r => r.gbifId)).toEqual(['1','2','4'])
    const insects = await service.getCellOccurrences(8, cells[6], { revision, filter: 'Insecta' })
    expect(insects.items.map(r => r.gbifId)).toEqual(['3'])
  })
  it('paginates and rejects cross-filter cursor reuse', async () => {
    const first = await service.getCoordinateOccurrences(0, 0, { revision, filter: 'Aves', limit: 1 })
    const next = await service.getCoordinateOccurrences(0, 0, { revision, filter: 'Aves', limit: 1, cursor: first.nextCursor! })
    expect(next.items[0].gbifId).toBe('2')
    await expect(service.getCoordinateOccurrences(0,0,{revision, filter:'audio',cursor:first.nextCursor!})).rejects.toThrow('scope')
  })
  it('keeps unknown species available without mixing identified species', async () => {
    const result = await service.getCellOccurrences(8, cells[6], { revision, unknownSpecies: true })
    expect(result.items.map(r => r.gbifId)).toEqual(['4'])
  })
  it('permits retained retired releases and checks rollback targets', async () => {
    await pool.query("UPDATE datasets SET status='retired' WHERE id=$1", [datasetId])
    expect((await service.getOccurrence('1',revision)).record.gbifId).toBe('1')
    const releaseService = new ReleaseService(new DatasetRepository(),new MapReleaseRepository(),pool)
    await releaseService.rollbackRelease(releaseId)
    await expect(releaseService.rollbackRelease('999999')).rejects.toThrow('unavailable')
  })
})
