import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DatasetRepository, OccurrenceRepository, withReadSnapshot } from '@gbif-globe/db'
import { DomainError } from '@gbif-globe/domain'
import { bigintIdSchema, MapInteractionConstants as C } from '@gbif-globe/contracts'
import { errorResponse } from '../server/http.server.js'

export const Route = createFileRoute('/api/v1/map-records')({ server: { handlers: { GET: async ({ request }) => {
  try {
    const query = new URL(request.url).searchParams
    const revision = z.string().uuid().parse(query.get('revision'))
    const ids = z.array(bigintIdSchema).max(C.MAX_RICH_MARKERS).parse((query.get('ids') || '').split(',').filter(Boolean))
    const overview = query.get('overview') === 'true'
    const result = await withReadSnapshot(async client => {
      const dataset = await new DatasetRepository().findReadableDataset(client, revision)
      if (!dataset) throw new DomainError(410, 'REVISION_UNAVAILABLE', 'Dataset unavailable')
      if (overview && dataset.plottableCount > C.MAX_RICH_MARKERS) throw new DomainError(400, 'MAP_LIMIT_EXCEEDED', 'Use the vector map for this dataset')
      if (overview) return { datasetRevision: dataset.revision, items: await new OccurrenceRepository().listSmallMap(client, dataset.id, C.MAX_RICH_MARKERS) }
      return { datasetRevision: dataset.revision, items: await new OccurrenceRepository().findByIds(client, dataset.id, [...new Set(ids)]) }
    })
    return Response.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) { return errorResponse(error) }
} } } })
