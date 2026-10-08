import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { AudioQueueConstants as C, type AudioJob, type AudioQueueSnapshot } from '@gbif-globe/contracts'
import { getPool, withTransaction } from '../pool.js'

const AUDIO_SQL = "(LOWER(COALESCE(m.format, '')) LIKE 'audio/%' OR LOWER(COALESCE(m.media_type, '')) IN ('sound', 'audio'))"
export interface ClaimedAudioJob extends AudioJob {
  sourceUrl: string
  sourceHash: string
  leaseToken: string
}
function publicJob(row: Record<string, any>): AudioJob {
  return { id: String(row.id), status: row.status, priority: row.priority, attempts: row.attempts,
    receivedBytes: Number(row.received_bytes), totalBytes: row.total_bytes === null ? null : Number(row.total_bytes),
    storedBytes: Number(row.stored_bytes), playbackUrl: row.playback_url, errorCode: row.error_code,
    errorMessage: row.error_message, nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }
}

export class AudioJobRepository {
  constructor(private readonly pool: pg.Pool = getPool()) {}

  async enqueue(input: { mediaIds?: string[]; sourceUrl?: string; priority: number; retry?: boolean }): Promise<AudioJob[]> {
    return withTransaction(async client => {
      const { rows } = await client.query(`SELECT m.id::text, m.identifier, m.imagekit_url, m.imagekit_file_id
        FROM media m JOIN datasets d ON d.id=m.dataset_id
        WHERE d.status IN ('ready', 'retired') AND ${AUDIO_SQL}
          AND (${input.mediaIds ? 'm.id=ANY($1::bigint[])' : '(m.identifier=$1 OR m.imagekit_url=$1)'})
        ORDER BY m.id LIMIT $2`, [input.mediaIds ?? input.sourceUrl, C.MAX_ENQUEUE])
      if (!rows.length || (input.mediaIds && rows.length !== new Set(input.mediaIds).size)) {
        throw new Error('AUDIO_NOT_FOUND')
      }
      const jobs = new Map<string, AudioJob>()
      for (const media of rows) {
        const hash = createHash('sha256').update(media.identifier).digest('hex')
        const ready = Boolean(media.imagekit_url)
        const result = await client.query(`INSERT INTO audio_download_jobs
          (source_hash, source_url, media_id, priority, status, playback_url, imagekit_file_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (source_hash) DO UPDATE SET
            priority=GREATEST(audio_download_jobs.priority, EXCLUDED.priority),
            status=CASE WHEN EXCLUDED.playback_url IS NOT NULL THEN 'ready'
              WHEN $8 AND audio_download_jobs.status='failed' THEN 'queued' ELSE audio_download_jobs.status END,
            playback_url=COALESCE(EXCLUDED.playback_url,audio_download_jobs.playback_url),
            imagekit_file_id=COALESCE(EXCLUDED.imagekit_file_id,audio_download_jobs.imagekit_file_id),
            attempts=CASE WHEN $8 AND audio_download_jobs.status='failed' THEN 0 ELSE audio_download_jobs.attempts END,
            error_code=CASE WHEN EXCLUDED.playback_url IS NOT NULL OR ($8 AND audio_download_jobs.status='failed') THEN NULL ELSE audio_download_jobs.error_code END,
            error_message=CASE WHEN EXCLUDED.playback_url IS NOT NULL OR ($8 AND audio_download_jobs.status='failed') THEN NULL ELSE audio_download_jobs.error_message END,
            next_attempt_at=CASE WHEN $8 THEN NULL ELSE audio_download_jobs.next_attempt_at END,
            updated_at=NOW()
          RETURNING *`, [hash, media.identifier, media.id, input.priority, ready ? 'ready' : 'queued',
          media.imagekit_url, media.imagekit_file_id, input.retry ?? false])
        const job = publicJob(result.rows[0]); jobs.set(job.id, job)
        // A second record with the same source also shares a completed upload.
        if (job.playbackUrl) await client.query(`UPDATE media SET imagekit_url=$1, imagekit_file_id=$2,
          sync_status='synced', synced_at=COALESCE(synced_at,NOW()) WHERE id=$3`,
          [job.playbackUrl, result.rows[0].imagekit_file_id, media.id])
      }
      return [...jobs.values()]
    }, this.pool)
  }

  async find(id: string): Promise<AudioJob | null> {
    const result = await this.pool.query('SELECT * FROM audio_download_jobs WHERE id=$1::bigint', [id])
    return result.rows[0] ? publicJob(result.rows[0]) : null
  }

  async claim(): Promise<ClaimedAudioJob | null> {
    return withTransaction(async client => {
      // Serialize just the claim decision across embedded servers and CLI workers.
      await client.query('SELECT pg_advisory_xact_lock($1)', [C.CLAIM_LOCK])
      await client.query(`UPDATE audio_download_jobs SET status=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
        error_code='WORKER_INTERRUPTED', error_message='Download worker stopped before completion', lease_token=NULL,
        lease_until=NULL, next_attempt_at=NULL, updated_at=NOW()
        WHERE status IN ('downloading','uploading') AND lease_until < NOW()`, [C.MAX_ATTEMPTS])
      const { rows: counts } = await client.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE priority=$1)::int AS details FROM audio_download_jobs
        WHERE status IN ('downloading','uploading') AND lease_until >= NOW()`, [C.DETAIL_PRIORITY])
      if (counts[0].total >= C.CONCURRENCY) return null
      const { rows } = await client.query(`SELECT * FROM audio_download_jobs
        WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=NOW())
          AND (priority=$1 OR $2::boolean)
        ORDER BY priority DESC, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`,
        [C.PLAYBACK_PRIORITY, counts[0].details < C.DETAIL_CONCURRENCY])
      if (!rows[0]) return null
      const token = randomUUID()
      const result = await client.query(`UPDATE audio_download_jobs SET status='downloading', attempts=attempts+1,
        received_bytes=0,total_bytes=NULL,lease_token=$1,lease_until=NOW()+$2*INTERVAL '1 millisecond',
        error_code=NULL,error_message=NULL,next_attempt_at=NULL,updated_at=NOW() WHERE id=$3 RETURNING *`,
        [token, C.LEASE_MS, rows[0].id])
      const row = result.rows[0]
      return { ...publicJob(row), sourceUrl: row.source_url, sourceHash: row.source_hash, leaseToken: token }
    }, this.pool)
  }

  async progress(job: ClaimedAudioJob, status: 'downloading' | 'uploading', received: number, total: number | null): Promise<boolean> {
    const result = await this.pool.query(`UPDATE audio_download_jobs SET status=$1,received_bytes=$2,total_bytes=$3,
      lease_until=NOW()+$4*INTERVAL '1 millisecond',updated_at=NOW()
      WHERE id=$5 AND lease_token=$6::uuid AND status IN ('downloading','uploading')`,
      [status, received, total, C.LEASE_MS, job.id, job.leaseToken])
    return Boolean(result.rowCount)
  }

  async complete(job: ClaimedAudioJob, result: { url: string; fileId: string; size: number }) {
    return withTransaction(async client => {
      const updated = await client.query(`UPDATE audio_download_jobs SET status='ready',playback_url=$1,imagekit_file_id=$2,
        stored_bytes=$3,received_bytes=$3,total_bytes=$3,error_code=NULL,error_message=NULL,next_attempt_at=NULL,
        lease_token=NULL,lease_until=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE id=$4 AND lease_token=$5::uuid AND status IN ('downloading','uploading')`,
        [result.url, result.fileId, result.size, job.id, job.leaseToken])
      if (!updated.rowCount) return
      await client.query(`UPDATE media m SET imagekit_url=$1,imagekit_file_id=$2,sync_status='synced',
        sync_error=NULL,sync_next_attempt_at=NULL,sync_started_at=NULL,synced_at=NOW()
        WHERE m.identifier=$3 AND ${AUDIO_SQL}`, [result.url, result.fileId, job.sourceUrl])
    }, this.pool)
  }

  async fail(job: ClaimedAudioJob, code: string, message: string, retryable: boolean) {
    const retry = retryable && job.attempts < C.MAX_ATTEMPTS
    await this.pool.query(`UPDATE audio_download_jobs SET status=$1,error_code=$2,error_message=$3,
      next_attempt_at=CASE WHEN $4::boolean THEN NOW()+$5*INTERVAL '1 millisecond' ELSE NULL END,
      lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$6 AND lease_token=$7::uuid`,
      [retry ? 'queued' : 'failed', code, message.slice(0, 500), retry, C.RETRY_DELAY_MS * 2 ** (job.attempts - 1), job.id, job.leaseToken])
  }

  async snapshot(): Promise<Pick<AudioQueueSnapshot, 'totals' | 'jobs' | 'workerActive'>> {
    const { rows: totals } = await this.pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='ready')::int AS ready, COUNT(*) FILTER (WHERE status='queued')::int AS queued,
      COUNT(*) FILTER (WHERE status='downloading')::int AS downloading, COUNT(*) FILTER (WHERE status='uploading')::int AS uploading,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed, COALESCE(SUM(stored_bytes),0)::text AS stored_bytes,
      COALESCE(BOOL_OR(lease_until>=NOW()),false) AS worker_active FROM audio_download_jobs`)
    const { rows } = await this.pool.query(`SELECT j.*,m.occurrence_gbif_id::text AS gbif_id,
      o.scientific_name FROM audio_download_jobs j JOIN media m ON m.id=j.media_id
      JOIN occurrences o ON o.dataset_id=m.dataset_id AND o.gbif_id=m.occurrence_gbif_id
      ORDER BY (j.status IN ('downloading','uploading')) DESC, j.updated_at DESC, j.id DESC LIMIT ${C.SNAPSHOT_LIMIT}`)
    const row = totals[0]
    return { totals: { total: row.total, ready: row.ready, queued: row.queued, downloading: row.downloading,
      uploading: row.uploading, failed: row.failed, storedBytes: Number(row.stored_bytes) }, workerActive: row.worker_active,
      jobs: rows.map(r => ({ ...publicJob(r), mediaId: String(r.media_id), gbifId: r.gbif_id,
        scientificName: r.scientific_name, sourceHost: new URL(r.source_url).hostname })) }
  }
}
