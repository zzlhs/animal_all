import type pg from 'pg'
import { DomainError } from './errors.js'
import type { AmbientTrack } from '@gbif-globe/contracts'
import { DatasetRepository, OccurrenceRepository, getPool, withReadSnapshot } from '@gbif-globe/db'

export class AmbientTrackService {
  constructor(private readonly occurrenceRepo = new OccurrenceRepository(), private readonly datasetRepo = new DatasetRepository(), private readonly pool: pg.Pool = getPool()) {}
  async getAmbientTracks(language = 'zh', revision?: string): Promise<AmbientTrack[]> {
    return withReadSnapshot(async client => {
      const dataset = await this.datasetRepo.findReadableDataset(client, revision)
      if (!dataset) throw new DomainError(revision ? 410 : 503, 'NO_ACTIVE_RELEASE', 'No readable dataset is published')
      const { rows } = await client.query<{ gbif_id: string }>(`SELECT gbif_id::text FROM occurrences
        WHERE dataset_id=$1 AND has_audio ORDER BY gbif_id LIMIT 100`, [dataset.id])
      const tracks: AmbientTrack[] = []
      const seen = new Set<string>()
      const records = await this.occurrenceRepo.findByIds(client, dataset.id, rows.map(row => row.gbif_id))
      for (const record of records) for (const media of record.media.filter(item => item.kind === 'audio')) {
        if (seen.has(media.url) || tracks.length >= 100) continue
        seen.add(media.url)
        tracks.push({ id: media.id, title: language.startsWith('zh') ? record.vernacularName || record.species || record.scientificName : record.species || record.scientificName,
          subtitle: record.scientificName, scientificName: record.scientificName, sourceUrl: media.url,
          license: media.license ?? undefined, creator: media.creator ?? undefined, gbifId: record.gbifId,
          thumbnailUrl: record.media.find(item => item.kind === 'image')?.thumbnailUrl || record.media.find(item => item.kind === 'image')?.url })
      }
      return tracks
    }, this.pool)
  }
}
