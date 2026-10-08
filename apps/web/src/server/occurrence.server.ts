import { occurrenceParamsSchema, cellOccurrencesParamsSchema, coordinateOccurrencesParamsSchema, listQuerySchema } from '@gbif-globe/contracts'
import { isValidCell, getResolution } from 'h3-js'
import { DomainError } from '@gbif-globe/domain'
import { occurrenceService } from './db.server.js'
import { json, errorResponse } from './http.server.js'

const options = (request: Request) => listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
function cellParams(resolution: string, cellId: string) {
  const parsed = cellOccurrencesParamsSchema.parse({ resolution, cellId })
  if (!isValidCell(parsed.cellId) || getResolution(parsed.cellId) !== parsed.resolution) throw new DomainError(400, 'BAD_H3_CELL', 'Invalid H3 cell or resolution')
  return parsed
}
export async function handleOccurrenceRequest(request: Request, gbifId: string) {
  try {
    occurrenceParamsSchema.parse({ gbifId })
    const result = await occurrenceService.getOccurrence(gbifId, options(request).revision)
    return json(result.record, 200, { 'X-Dataset-Revision': result.datasetRevision })
  } catch (error) { return errorResponse(error) }
}
export async function handleCellOccurrencesRequest(request: Request, resolution: string, cellId: string) {
  try {
    const params = cellParams(resolution, cellId)
    const result = await occurrenceService.getCellOccurrences(params.resolution, params.cellId, options(request))
    return json(result)
  } catch (error) { return errorResponse(error) }
}
export async function handleCellSpeciesRequest(request: Request, resolution: string, cellId: string) {
  try {
    const params = cellParams(resolution, cellId)
    return json(await occurrenceService.getCellSpecies(params.resolution, params.cellId, options(request)))
  } catch (error) { return errorResponse(error) }
}
export async function handleCoordinateOccurrencesRequest(request: Request, latitude: string, longitude: string) {
  try {
    const params = coordinateOccurrencesParamsSchema.parse({ latitude, longitude })
    return json(await occurrenceService.getCoordinateOccurrences(params.latitude, params.longitude, options(request)))
  } catch (error) { return errorResponse(error) }
}
