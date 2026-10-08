import { getPool, AudioJobRepository } from '@gbif-globe/db'
import { AudioDownloadWorker, audioWorkerConfigured } from '@gbif-globe/media/audio-worker'

if (!audioWorkerConfigured()) throw new Error('Configure IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT before starting the audio worker')
const pool = getPool()
const worker = new AudioDownloadWorker(new AudioJobRepository(pool))
worker.start(true)
console.log('Audio worker running: playback priority, detail priority; storage: ImageKit')
let closing = false
async function close() {
  if (closing) return
  closing = true
  await worker.stop(); await pool.end()
}
process.once('SIGINT', () => { void close() })
process.once('SIGTERM', () => { void close() })
