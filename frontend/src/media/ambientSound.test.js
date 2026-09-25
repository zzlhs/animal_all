import { describe, expect, it } from 'vitest'
import {
  ambientVolumePerTrack,
  collectAmbientTracks,
  defaultAmbientMixTrackIds,
  normalizeAmbientTrackIds,
} from './ambientSound.js'

describe('ambient sound helpers', () => {
  const tracks = [
    { id: 'one', speciesKey: 'species-a' },
    { id: 'two', speciesKey: 'species-a' },
    { id: 'three', speciesKey: 'species-b' },
    { id: 'four', speciesKey: 'species-c' },
  ]

  it('keeps only playable audio sources and avoids duplicate URLs', () => {
    const result = collectAmbientTracks([
      {
        gbifID: '1',
        scientificName: 'Bird one',
        media: [
          { type: 'Sound', identifier: 'https://example.test/one.mp3' },
          { type: 'Sound', identifier: 'https://example.test/one.mp3' },
          { type: 'StillImage', identifier: 'https://example.test/one.jpg' },
        ],
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ displayName: 'Bird one', sourceUrl: 'https://example.test/one.mp3' })
  })

  it('builds a varied default mix and keeps selections valid', () => {
    expect(defaultAmbientMixTrackIds(tracks, 3)).toEqual(['one', 'three', 'four'])
    expect(normalizeAmbientTrackIds(['one', 'one', 'missing', 'three', 'four'], tracks, 2)).toEqual(['one', 'three'])
  })

  it('shares master volume safely between simultaneous tracks', () => {
    expect(ambientVolumePerTrack(0.6, 3)).toBeCloseTo(0.2)
    expect(ambientVolumePerTrack(2, 2)).toBeCloseTo(0.5)
  })
})
