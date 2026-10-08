import type { OccurrenceRecord } from '@gbif-globe/contracts'
const Clustering = { EXACT_ZOOM: 15, BASE_ZOOM: 10, BASE_DISTANCE: .02, MIN_DISTANCE: .001 }
// Used only for datasets below the bounded DOM marker limit. Large datasets stay in PMTiles.
export function clusterOccurrences(records: OccurrenceRecord[], zoom: number) {
  const threshold = zoom >= Clustering.EXACT_ZOOM ? 0 : Math.max(Clustering.MIN_DISTANCE, Clustering.BASE_DISTANCE / 2 ** (zoom - Clustering.BASE_ZOOM))
  const remaining = new Map(records.map(record => [record.gbifId, record]))
  const clusters = []
  while (remaining.size) {
    const [id, first] = remaining.entries().next().value!
    remaining.delete(id)
    const grouped = [first], queue = [first]
    while (queue.length) {
      const record = queue.pop()!
      for (const [candidateId, candidate] of remaining) {
        if (Math.hypot(record.decimalLongitude - candidate.decimalLongitude, record.decimalLatitude - candidate.decimalLatitude) < threshold) {
          grouped.push(candidate); queue.push(candidate); remaining.delete(candidateId)
        }
      }
    }
    clusters.push({ id: grouped.map(item => item.gbifId).sort().join('-'), records: grouped,
      coordinates: [grouped.reduce((sum, r) => sum + r.decimalLongitude, 0) / grouped.length,
        grouped.reduce((sum, r) => sum + r.decimalLatitude, 0) / grouped.length] as [number, number] })
  }
  return clusters
}
