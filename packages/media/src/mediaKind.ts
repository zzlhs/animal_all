import type { MediaKind } from '@gbif-globe/contracts'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.opus'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv'])

export function detectMediaKind(format?: string | null, identifier?: string | null): MediaKind {
  const normalizedFormat = String(format || '').toLowerCase().trim()
  if (normalizedFormat.startsWith('audio/')) return 'audio'
  if (normalizedFormat.startsWith('video/')) return 'video'
  if (normalizedFormat.startsWith('image/')) return 'image'

  const id = String(identifier || '').toLowerCase()
  for (const ext of AUDIO_EXTENSIONS) {
    if (id.endsWith(ext) || id.includes(`${ext}?`)) return 'audio'
  }
  for (const ext of VIDEO_EXTENSIONS) {
    if (id.endsWith(ext) || id.includes(`${ext}?`)) return 'video'
  }

  return 'image'
}
