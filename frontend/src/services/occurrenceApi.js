import { DataApiConstants } from '../config/data.constants.js'
import { runtimeConfig } from '../config/runtime.js'

async function request(path, { signal } = {}) {
  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`Occurrence API request failed with status ${response.status}`)
  return response.json()
}

function pageQuery({ limit = DataApiConstants.DEFAULT_LIST_LIMIT, cursor, speciesKey, filter } = {}) {
  const parameters = new URLSearchParams({ limit: String(limit) })
  if (cursor) parameters.set('cursor', cursor)
  if (speciesKey) parameters.set('speciesKey', speciesKey)
  if (filter) parameters.set('filter', filter)
  return parameters.toString()
}

export const occurrenceApi = Object.freeze({
  getMeta(options) {
    return request(DataApiConstants.META_ROUTE, options)
  },
  async getOccurrence(gbifId, options) {
    const payload = await request(`${DataApiConstants.OCCURRENCES_ROUTE}/${encodeURIComponent(gbifId)}`, options)
    return payload.occurrence
  },
  listCellSpecies(resolution, cellId, options = {}) {
    return request(`${DataApiConstants.CELLS_ROUTE}/${resolution}/${encodeURIComponent(cellId)}/species?${pageQuery(options)}`, options)
  },
  listCellOccurrences(resolution, cellId, options = {}) {
    return request(`${DataApiConstants.CELLS_ROUTE}/${resolution}/${encodeURIComponent(cellId)}/occurrences?${pageQuery(options)}`, options)
  },
  listCoordinateOccurrences(latitude, longitude, options = {}) {
    return request(`${DataApiConstants.COORDINATES_ROUTE}/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}/occurrences?${pageQuery(options)}`, options)
  },
})
