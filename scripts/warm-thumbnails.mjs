import './run.mjs'
import { pool } from '../apps/web/src/server/db.server.ts'
import { cachedImage } from '../apps/web/src/server/images.server.ts'

const args = Object.fromEntries(process.argv.slice(2).map(argument => argument.replace(/^--/, '').split('=')))
const limit = Number(args.limit || 500), after = args.after || '0'
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000 || !/^\d+$/.test(after)) throw new Error('Use --limit=1..10000 and a numeric --after media ID')
let succeeded = 0, failed = 0
try {
  const { rows } = await pool.query(`SELECT m.id::text FROM media m JOIN datasets d ON d.id=m.dataset_id
    JOIN map_releases mr ON mr.dataset_revision=d.revision JOIN active_map_release active ON active.release_id=mr.id
    WHERE m.id > $1::bigint AND LOWER(COALESCE(m.format, '')) LIKE 'image/%' ORDER BY m.id LIMIT $2`, [after, limit])
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (index < rows.length) {
      const row = rows[index++]
      try { if (await cachedImage(row.id, 'pin')) succeeded++ }
      catch { failed++ }
    }
  }))
  console.log(JSON.stringify({ succeeded, failed, lastMediaId: rows.at(-1)?.id, nextCommand: rows.length ? `npm run media:thumbnails -- --limit=${limit} --after=${rows.at(-1).id}` : null }))
} finally { await pool.end() }
