import { AudioProxyConstants } from '../../shared/audioProxy.constants.js'
import { AudioCacheConstants } from './audioCache.constants.js'

let databasePromise = null

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted'))
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
  })
}

function openAudioCacheDatabase() {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(AudioCacheConstants.DATABASE_NAME, AudioCacheConstants.DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(AudioCacheConstants.STORE_NAME)) {
        database.createObjectStore(AudioCacheConstants.STORE_NAME, {
          keyPath: AudioCacheConstants.KEY_PATH,
        })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error || new Error('Unable to open the audio cache'))
    }
    request.onblocked = () => {
      databasePromise = null
      reject(new Error('Audio cache upgrade is blocked'))
    }
  })

  return databasePromise
}

async function readAllAudioEntries() {
  const database = await openAudioCacheDatabase()
  const transaction = database.transaction(AudioCacheConstants.STORE_NAME, 'readonly')
  const completed = transactionDone(transaction)
  const entries = await requestResult(transaction.objectStore(AudioCacheConstants.STORE_NAME).getAll())
  await completed
  return entries
}

async function deleteAudioEntries(sourceUrls) {
  if (!sourceUrls.length) return
  const database = await openAudioCacheDatabase()
  const transaction = database.transaction(AudioCacheConstants.STORE_NAME, 'readwrite')
  const store = transaction.objectStore(AudioCacheConstants.STORE_NAME)
  for (const sourceUrl of sourceUrls) store.delete(sourceUrl)
  await transactionDone(transaction)
}

async function writeAudioEntry(entry) {
  const database = await openAudioCacheDatabase()
  const transaction = database.transaction(AudioCacheConstants.STORE_NAME, 'readwrite')
  transaction.objectStore(AudioCacheConstants.STORE_NAME).put(entry)
  await transactionDone(transaction)
}

export function selectAudioCacheKeysToDelete(entries, now = Date.now()) {
  const expiredBefore = now - AudioCacheConstants.MAX_IDLE_MILLISECONDS
  const keysToDelete = new Set()

  for (const entry of entries) {
    const hasValidAccessTime = Number.isFinite(entry?.lastAccessedAt)
    if (!entry?.sourceUrl || !entry?.blob || !hasValidAccessTime || entry.lastAccessedAt < expiredBefore) {
      if (entry?.sourceUrl) keysToDelete.add(entry.sourceUrl)
    }
  }

  const activeEntries = entries
    .filter(entry => entry?.sourceUrl && entry?.blob && !keysToDelete.has(entry.sourceUrl))
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)
  const overflowCount = Math.max(0, activeEntries.length - AudioCacheConstants.MAX_ENTRIES)

  for (const entry of activeEntries.slice(0, overflowCount)) keysToDelete.add(entry.sourceUrl)
  return [...keysToDelete]
}

export async function pruneAudioCache(now = Date.now()) {
  const entries = await readAllAudioEntries()
  await deleteAudioEntries(selectAudioCacheKeysToDelete(entries, now))
}

async function readCachedAudio(sourceUrl, now = Date.now()) {
  const database = await openAudioCacheDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AudioCacheConstants.STORE_NAME, 'readwrite')
    const store = transaction.objectStore(AudioCacheConstants.STORE_NAME)
    const request = store.get(sourceUrl)
    let cachedEntry = null

    request.onsuccess = () => {
      const entry = request.result
      const isExpired = !entry?.blob
        || !Number.isFinite(entry.lastAccessedAt)
        || now - entry.lastAccessedAt > AudioCacheConstants.MAX_IDLE_MILLISECONDS
      if (!entry) return
      if (isExpired) {
        store.delete(sourceUrl)
        return
      }

      entry.lastAccessedAt = now
      store.put(entry)
      cachedEntry = entry
    }
    request.onerror = () => reject(request.error || new Error('Unable to read cached audio'))
    transaction.oncomplete = () => resolve(cachedEntry)
    transaction.onabort = () => reject(transaction.error || new Error('Audio cache read was aborted'))
    transaction.onerror = () => reject(transaction.error || new Error('Audio cache read failed'))
  })
}

async function cacheAudio(sourceUrl, blob, now = Date.now()) {
  const entry = {
    sourceUrl,
    blob,
    size: blob.size,
    mimeType: blob.type,
    cachedAt: now,
    lastAccessedAt: now,
  }

  try {
    await writeAudioEntry(entry)
  } catch (error) {
    if (error?.name !== 'QuotaExceededError') throw error
    const entries = await readAllAudioEntries()
    const oldestEntry = entries.sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)[0]
    if (!oldestEntry) throw error
    await deleteAudioEntries([oldestEntry.sourceUrl])
    await writeAudioEntry(entry)
  }

  await pruneAudioCache(now)
}

function audioProxyUrl(sourceUrl) {
  const url = new URL(AudioProxyConstants.ROUTE, window.location.origin)
  url.searchParams.set('url', sourceUrl)
  return url.href
}

function audioMimeType(sourceUrl, responseType) {
  if (responseType?.startsWith('audio/')) return responseType.split(';')[0]
  const extension = new URL(sourceUrl).pathname.split('.').pop()?.toLowerCase()
  return AudioCacheConstants.MIME_TYPES_BY_EXTENSION[extension] || 'application/octet-stream'
}

async function downloadAudio(sourceUrl, signal) {
  const response = await fetch(audioProxyUrl(sourceUrl), {
    headers: { Accept: 'audio/*,application/octet-stream;q=0.9' },
    signal,
  })
  if (!response.ok) throw new Error(`Audio download failed with status ${response.status}`)

  const responseType = response.headers.get('content-type') || ''
  if (responseType.includes('text/html') || responseType.includes('application/json')) {
    throw new Error('Audio source returned a non-audio response')
  }

  const bytes = await response.arrayBuffer()
  if (!bytes.byteLength) throw new Error('Audio source returned an empty file')
  return new Blob([bytes], { type: audioMimeType(sourceUrl, responseType) })
}

export async function resolveAudioForPlayback(sourceUrl, { signal } = {}) {
  let cachedEntry = null
  try {
    cachedEntry = await readCachedAudio(sourceUrl)
  } catch {
    // Playback can continue even when this browser has disabled IndexedDB.
  }
  if (cachedEntry) return { blob: cachedEntry.blob, cacheHit: true, cacheStored: true }

  const blob = await downloadAudio(sourceUrl, signal)
  let cacheStored = false
  try {
    await cacheAudio(sourceUrl, blob)
    cacheStored = true
  } catch {
    // The downloaded blob remains playable even if the storage quota is full.
  }

  return { blob, cacheHit: false, cacheStored }
}

export function initializeAudioCache() {
  void pruneAudioCache().catch(() => {})
}
