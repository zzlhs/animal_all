import { getPool, DatasetRepository, OccurrenceRepository, MapReleaseRepository } from '@gbif-globe/db'
import {
  MetaService,
  OccurrenceService,
  AudioProxyService,
  AmbientTrackService,
} from '@gbif-globe/domain'

export const pool = getPool()

export const datasetRepo = new DatasetRepository()
export const occurrenceRepo = new OccurrenceRepository()
export const releaseRepo = new MapReleaseRepository()

export const metaService = new MetaService(datasetRepo, releaseRepo, pool)
export const occurrenceService = new OccurrenceService(occurrenceRepo, datasetRepo, pool)
export const audioProxyService = new AudioProxyService()
export const ambientTrackService = new AmbientTrackService()
