export function clusterOccurrences(records, zoom) {
  if (zoom >= 15) {
    return records.map(record => ({
      id: record.gbifID,
      records: [record],
      coordinates: [record.longitude, record.latitude],
    }))
  }

  // At the overview zoom the GBIF sample is substantially denser than the
  // reference collection. Group connected nearby observations together, as a
  // map clustering engine would, so adjacent bubble bounds never overlap.
  const threshold = Math.max(0.001, 0.02 / Math.pow(2, zoom - 10))
  const remaining = new Map(records.map(record => [record.gbifID, record]))
  const clusters = []

  while (remaining.size) {
    const [firstId, firstRecord] = remaining.entries().next().value
    remaining.delete(firstId)
    const grouped = [firstRecord]
    const queue = [firstRecord]

    while (queue.length) {
      const record = queue.pop()
      for (const [candidateId, candidate] of [...remaining]) {
        const distance = Math.hypot(
          record.longitude - candidate.longitude,
          record.latitude - candidate.latitude,
        )
        if (distance < threshold) {
          grouped.push(candidate)
          queue.push(candidate)
          remaining.delete(candidateId)
        }
      }
    }

    clusters.push({
      id: grouped.map(item => item.gbifID).sort().join('-'),
      records: grouped,
      coordinates: [
        grouped.reduce((sum, item) => sum + item.longitude, 0) / grouped.length,
        grouped.reduce((sum, item) => sum + item.latitude, 0) / grouped.length,
      ],
    })
  }

  return clusters
}

export function boundsFor(records) {
  const longitudes = records.map(record => record.longitude)
  const latitudes = records.map(record => record.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}
