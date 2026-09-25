import { recordMedia } from '../composables/useOccurrenceMedia.js'
import { AmbientSoundConstants } from './ambientSound.constants.js'

function displayNameFor(record) {
  return String(record?.vernacularName || record?.species || record?.scientificName || record?.gbifID || '').trim()
}

export function collectAmbientTracks(records = []) {
  const sourceUrls = new Set()

  return records.flatMap(record => recordMedia(record).flatMap(media => {
    if (media.kind !== 'audio' || !media.url || sourceUrls.has(media.url)) return []
    sourceUrls.add(media.url)

    return [{
      id: `ambient-${media.id}`,
      sourceUrl: media.url,
      displayName: displayNameFor(record),
      scientificName: String(record?.scientificName || '').trim(),
      speciesKey: String(record?.species || record?.scientificName || record?.gbifID || media.id),
    }]
  }))
}

export function defaultAmbientMixTrackIds(tracks, count = AmbientSoundConstants.DEFAULT_MIX_TRACK_COUNT) {
  const selectedIds = []
  const speciesKeys = new Set()

  for (const track of tracks) {
    const speciesKey = track.speciesKey || track.id
    if (speciesKeys.has(speciesKey)) continue
    speciesKeys.add(speciesKey)
    selectedIds.push(track.id)
    if (selectedIds.length >= count) break
  }

  return selectedIds
}

export function normalizeAmbientTrackIds(trackIds, tracks, maximum = AmbientSoundConstants.MAX_MIX_TRACK_COUNT) {
  const availableIds = new Set(tracks.map(track => track.id))
  return [...new Set(trackIds)].filter(id => availableIds.has(id)).slice(0, maximum)
}

export function ambientVolumePerTrack(masterVolume, trackCount) {
  const volume = Number.isFinite(masterVolume) ? Math.min(1, Math.max(0, masterVolume)) : 0
  return volume / Math.max(1, trackCount)
}
