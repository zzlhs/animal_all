import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { GlobeLoadingConstants as C } from './loading.constants.js'

export function useMarkerRecords(revision: string | undefined, ids: string[], overview: boolean) {
  const client = useQueryClient()
  const unique = [...new Set(ids)].sort()
  const batches = overview ? [[]] : Array.from({ length: Math.ceil(unique.length / C.RECORD_BATCH_SIZE) }, (_, index) => unique.slice(index * C.RECORD_BATCH_SIZE, (index + 1) * C.RECORD_BATCH_SIZE))
  const results = useQueries({ queries: batches.map(batch => ({
    queryKey: ['marker-records', revision, overview ? 'overview' : batch.join(',')],
    enabled: Boolean(revision && (overview || batch.length)),
    staleTime: C.RECORD_STALE_MS,
    gcTime: C.RECORD_STALE_MS,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const known = batch.map(id => client.getQueryData<OccurrenceRecord>(['map-record', revision, id])).filter((record): record is OccurrenceRecord => Boolean(record))
      const missing = batch.filter(id => !known.some(record => record.gbifId === id))
      if (!overview && !missing.length) return { datasetRevision: revision, items: known }
      const response = await fetch(`/api/v1/map-records?revision=${revision}${overview ? '&overview=true' : `&ids=${missing.join(',')}`}`, { signal })
      if (!response.ok) throw new Error('地图详情加载失败 / Map records unavailable')
      const result = await response.json() as { datasetRevision: string; items: OccurrenceRecord[] }
      if (result.datasetRevision !== revision) throw new Error('地图数据版本已更新 / Map data updated')
      for (const record of result.items) client.setQueryData(['map-record', revision, record.gbifId], record)
      // Keep representative metadata bounded as the user explores more locations.
      for (const prefix of ['marker-records', 'map-record']) {
        const limit = prefix === 'marker-records' ? C.MAX_RECORD_BATCHES : C.MAX_RECORD_BATCHES * C.RECORD_BATCH_SIZE
        const queries = client.getQueryCache().findAll({ queryKey: [prefix] }).filter(query => !query.getObserversCount()).sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt)
        const excess = client.getQueryCache().findAll({ queryKey: [prefix] }).length - limit
        for (const query of queries.slice(0, Math.max(0, excess))) client.getQueryCache().remove(query)
      }
      return { datasetRevision: revision, items: [...known, ...result.items] }
    },
  })) })
  const records = new Map<string, OccurrenceRecord>()
  for (const id of unique) {
    const cached = client.getQueryData<OccurrenceRecord>(['map-record', revision, id])
    if (cached) records.set(id, cached)
  }
  for (const result of results) if (result.data && result.data.datasetRevision === revision) for (const record of result.data.items) records.set(record.gbifId, record)
  return { records, error: results.find(result => result.error)?.error, refetch: () => Promise.all(results.map(result => result.refetch())) }
}
