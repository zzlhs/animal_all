import { describe, expect, it } from 'vitest'
import { loadMapBuildConfig, loadObjectStorageConfig, loadPmtilesVerificationConfig } from './env.js'

describe('offline map tool configuration', () => {
  it('does not require database or active dataset settings', () => {
    expect(loadMapBuildConfig({})).toEqual({ pmtilesSourceLayer: 'gbif_occurrences' })
    expect(loadPmtilesVerificationConfig({ PMTILES_URL: 'https://cdn.example.test/map.pmtiles' })).toMatchObject({
      pmtilesUrl: 'https://cdn.example.test/map.pmtiles',
      objectStorageVerifyOrigin: '',
    })
    expect(loadObjectStorageConfig({ OBJECT_STORAGE_BUCKET: 'maps' })).toMatchObject({
      objectStorageBucket: 'maps',
      objectStorageRegion: 'auto',
    })
  })
})
