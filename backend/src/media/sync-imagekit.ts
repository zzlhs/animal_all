import { fileURLToPath } from 'node:url'
import ImageKit from '@imagekit/nodejs'
import type { Pool, QueryResultRow } from 'pg'
import { MediaSyncConstants } from '../config/api.constants.js'
import { loadConfig } from '../config/env.js'
import { createPool } from '../db/pool.js'

export type MediaKind = typeof MediaSyncConstants.SUPPORTED_MEDIA_KINDS[number]

export interface MediaSyncRow extends QueryResultRow {
  id: string
  gbif_id: string
  media_type: string | null
  format: string | null
  identifier: string
  sync_attempts: number
}

function cliNumber(name: string, fallback: number) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  const index = process.argv.indexOf(name)
  const rawValue = inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined)
  const value = Number(rawValue ?? fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

export function mediaKind(row: Pick<MediaSyncRow, 'format' | 'media_type'>): MediaKind | null {
  const format = row.format?.toLowerCase() ?? ''
  const type = row.media_type?.toLowerCase() ?? ''
  if (format.startsWith('image/') || type.includes('stillimage') || type === 'image') return 'image'
  if (format.startsWith('audio/') || type.includes('sound') || type === 'audio') return 'audio'
  if (format.startsWith('video/') || type.includes('movingimage') || type === 'video') return 'video'
  return null
}

export function mediaKindSql(enabledKinds: ReadonlySet<string>) {
  const clauses = {
    image: "(LOWER(COALESCE(m.format, '')) LIKE 'image/%' OR LOWER(COALESCE(m.media_type, '')) LIKE '%stillimage%' OR LOWER(COALESCE(m.media_type, '')) = 'image')",
    audio: "(LOWER(COALESCE(m.format, '')) LIKE 'audio/%' OR LOWER(COALESCE(m.media_type, '')) LIKE '%sound%' OR LOWER(COALESCE(m.media_type, '')) = 'audio')",
    video: "(LOWER(COALESCE(m.format, '')) LIKE 'video/%' OR LOWER(COALESCE(m.media_type, '')) LIKE '%movingimage%' OR LOWER(COALESCE(m.media_type, '')) LIKE '%video%')",
  } as const
  const selected = MediaSyncConstants.SUPPORTED_MEDIA_KINDS
    .filter(kind => enabledKinds.has(kind))
    .map(kind => clauses[kind])
  if (selected.length === 0) throw new Error('At least one ImageKit media type must be enabled')
  return `(${selected.join(' OR ')})`
}

function extensionFor(row: MediaSyncRow) {
  const known = MediaSyncConstants.EXTENSION_BY_FORMAT[row.format?.toLowerCase() ?? '']
  if (known) return known
  try {
    const extension = new URL(row.identifier).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]
    if (extension) return extension.toLowerCase()
  } catch {}
  return 'bin'
}

function normalizedFolder(folder: string, datasetVersion: string, kind: MediaKind) {
  return `/${[folder, datasetVersion, `${kind}s`]
    .flatMap(value => value.split('/'))
    .filter(Boolean)
    .map(value => value.replace(/[^a-z0-9_-]/gi, '_'))
    .join('/')}`
}

async function runWithConcurrency<T>(items: readonly T[], concurrency: number, task: (item: T) => Promise<void>) {
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]!
      await task(item)
    }
  })
  await Promise.all(workers)
}

async function claimRows(
  pool: Pool,
  datasetVersion: string,
  enabledKinds: ReadonlySet<string>,
  maxAttempts: number,
  limit: number,
) {
  return pool.query<MediaSyncRow>(`
    WITH candidates AS (
      SELECT m.id
      FROM media m
      JOIN datasets d ON d.id = m.dataset_id AND d.status = 'ready'
      WHERE d.version = $1
        AND m.imagekit_url IS NULL
        AND m.sync_attempts < $2
        AND ${mediaKindSql(enabledKinds)}
        AND (
          m.sync_status = 'pending'
          OR (m.sync_status = 'failed' AND (m.sync_next_attempt_at IS NULL OR m.sync_next_attempt_at <= NOW()))
          OR (m.sync_status = 'processing' AND m.sync_started_at < NOW() - INTERVAL '30 minutes')
        )
      ORDER BY COALESCE(m.sync_next_attempt_at, '-infinity'::timestamptz), m.id
      FOR UPDATE OF m SKIP LOCKED
      LIMIT $3
    )
    UPDATE media m
    SET
      sync_status = 'processing',
      sync_attempts = m.sync_attempts + 1,
      sync_started_at = NOW(),
      sync_error = NULL
    FROM candidates
    WHERE m.id = candidates.id
    RETURNING
      m.id::text,
      m.occurrence_gbif_id::text AS gbif_id,
      m.media_type,
      m.format,
      m.identifier,
      m.sync_attempts
  `, [datasetVersion, maxAttempts, limit])
}

export function retryAt(attempt: number, baseDelaySeconds: number) {
  const delaySeconds = Math.min(baseDelaySeconds * (2 ** Math.max(0, attempt - 1)), 86_400)
  return new Date(Date.now() + delaySeconds * 1000)
}

async function syncImageKit() {
  const config = loadConfig()
  if (!config.imageKitPrivateKey) throw new Error('IMAGEKIT_PRIVATE_KEY is required for media sync')
  if (!config.imageKitUrlEndpoint) throw new Error('IMAGEKIT_URL_ENDPOINT is required for media sync')
  const enabledKinds = new Set(config.imageKitSyncMediaTypes)
  const unknownKinds = [...enabledKinds].filter(kind => !MediaSyncConstants.SUPPORTED_MEDIA_KINDS.includes(kind as MediaKind))
  if (unknownKinds.length) throw new Error(`Unsupported IMAGEKIT_SYNC_MEDIA_TYPES: ${unknownKinds.join(', ')}`)

  const requestedLimit = cliNumber('--limit', MediaSyncConstants.DEFAULT_LIMIT)
  const imageKit = new ImageKit({ privateKey: config.imageKitPrivateKey })
  const pool = createPool(config)
  let attempted = 0
  let uploaded = 0
  let failed = 0

  try {
    if (process.argv.includes('--reset-failed')) {
      const reset = await pool.query(`
        UPDATE media m
        SET
          sync_status = 'pending',
          sync_attempts = 0,
          sync_error = NULL,
          sync_next_attempt_at = NULL,
          sync_started_at = NULL
        FROM datasets d
        WHERE d.id = m.dataset_id
          AND d.version = $1
          AND d.status = 'ready'
          AND m.imagekit_url IS NULL
          AND (
            m.sync_status = 'failed'
            OR (m.sync_status = 'processing' AND m.sync_started_at < NOW() - INTERVAL '30 minutes')
          )
          AND ${mediaKindSql(enabledKinds)}
      `, [config.activeDatasetVersion])
      console.log(`Reset ${reset.rowCount ?? 0} failed ImageKit queue records`)
    }
    while (attempted < requestedLimit) {
      const batchLimit = Math.min(MediaSyncConstants.DEFAULT_BATCH_SIZE, requestedLimit - attempted)
      const result = await claimRows(
        pool,
        config.activeDatasetVersion,
        enabledKinds,
        config.imageKitSyncMaxAttempts,
        batchLimit,
      )
      if (result.rows.length === 0) break
      attempted += result.rows.length

      await runWithConcurrency(result.rows, config.imageKitSyncConcurrency, async row => {
        const kind = mediaKind(row)
        if (!kind) return
        try {
          const response = await imageKit.files.upload({
            file: row.identifier,
            fileName: `${row.gbif_id}-${row.id}.${extensionFor(row)}`,
            folder: normalizedFolder(config.imageKitFolder, config.activeDatasetVersion, kind),
            useUniqueFileName: false,
            overwriteFile: true,
            isPrivateFile: false,
            tags: ['gbif', kind, `dataset-${config.activeDatasetVersion}`],
          })
          if (!response.url) throw new Error('ImageKit upload returned no public URL')
          await pool.query(`
            UPDATE media
            SET
              imagekit_url = $1,
              imagekit_file_id = $2,
              sync_status = 'synced',
              sync_error = NULL,
              sync_next_attempt_at = NULL,
              sync_started_at = NULL,
              synced_at = NOW()
            WHERE id = $3::bigint
          `, [response.url, response.fileId ?? null, row.id])
          uploaded += 1
          console.log(`Synced media ${row.id} (${kind})`)
        } catch (error) {
          failed += 1
          const message = error instanceof Error ? error.message : String(error)
          await pool.query(`
            UPDATE media
            SET
              sync_status = 'failed',
              sync_error = $1,
              sync_next_attempt_at = $2,
              sync_started_at = NULL
            WHERE id = $3::bigint
          `, [message.slice(0, 2_000), retryAt(row.sync_attempts, config.imageKitSyncRetryDelaySeconds), row.id])
          console.error(`Failed to sync media ${row.id}: ${message}`)
        }
      })
    }
  } finally {
    await pool.end()
  }

  console.log(`ImageKit sync complete: ${uploaded} uploaded, ${failed} failed, ${attempted} attempted`)
  if (failed > 0) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncImageKit().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
