import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type {
  MetaResponse,
  OccurrenceRecord,
  PageResult,
  AmbientTrack,
  FilterType,
} from '@gbif-globe/contracts'

export const metaQueryOptions = () =>
  queryOptions({
    queryKey: ['meta'],
    queryFn: async ({ signal }): Promise<MetaResponse> => {
      const res = await fetch('/api/v1/meta', { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch metadata: ${res.statusText}`)
      }
      return res.json()
    },
    staleTime: 30_000,
  })

export const occurrenceDetailQueryOptions = (revision: string, gbifId: string) =>
  queryOptions({
    queryKey: ['occurrence', revision, gbifId],
    queryFn: async ({ signal }): Promise<OccurrenceRecord> => {
      const url = new URL(`/api/v1/occurrences/${encodeURIComponent(gbifId)}`, window.location.origin)
      if (revision) url.searchParams.set('revision', revision)
      const res = await fetch(url.toString(), { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch occurrence ${gbifId}: ${res.statusText}`)
      }
      return res.json()
    },
    staleTime: 60_000,
    enabled: Boolean(gbifId),
  })

export interface CellOccurrencesParams {
  revision: string
  resolution: number
  cellId: string
  speciesKey?: string
  filter?: FilterType | string
  limit?: number
}

export const cellOccurrencesInfiniteQueryOptions = (params: CellOccurrencesParams) =>
  infiniteQueryOptions({
    queryKey: [
      'cell-occurrences',
      params.revision,
      params.resolution,
      params.cellId,
      params.speciesKey ?? null,
      params.filter ?? 'all',
    ],
    queryFn: async ({ pageParam, signal }): Promise<PageResult<OccurrenceRecord>> => {
      const url = new URL(
        `/api/v1/cells/${params.resolution}/${encodeURIComponent(params.cellId)}/occurrences`,
        window.location.origin,
      )
      if (params.revision) url.searchParams.set('revision', params.revision)
      if (params.speciesKey) url.searchParams.set('speciesKey', params.speciesKey)
      if (params.filter && params.filter !== 'all') url.searchParams.set('filter', params.filter)
      if (params.limit) url.searchParams.set('limit', String(params.limit))
      if (pageParam) url.searchParams.set('cursor', pageParam as string)

      const res = await fetch(url.toString(), { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch cell occurrences: ${res.statusText}`)
      }
      return res.json()
    },
    maxPages: 5,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(params.cellId),
  })

export interface CoordinateOccurrencesParams {
  revision: string
  latitude: number
  longitude: number
  filter?: FilterType | string
  limit?: number
}

export const coordinateOccurrencesInfiniteQueryOptions = (params: CoordinateOccurrencesParams) =>
  infiniteQueryOptions({
    queryKey: [
      'coordinate-occurrences',
      params.revision,
      params.latitude,
      params.longitude,
      params.filter ?? 'all',
    ],
    queryFn: async ({ pageParam, signal }): Promise<PageResult<OccurrenceRecord>> => {
      const url = new URL(
        `/api/v1/coordinates/${params.latitude}/${params.longitude}/occurrences`,
        window.location.origin,
      )
      if (params.revision) url.searchParams.set('revision', params.revision)
      if (params.filter && params.filter !== 'all') url.searchParams.set('filter', params.filter)
      if (params.limit) url.searchParams.set('limit', String(params.limit))
      if (pageParam) url.searchParams.set('cursor', pageParam as string)

      const res = await fetch(url.toString(), { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch coordinate occurrences: ${res.statusText}`)
      }
      return res.json()
    },
    maxPages: 5,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

export const ambientTracksQueryOptions = (revision?: string, language = 'zh') =>
  queryOptions({
    queryKey: ['ambient-tracks', revision, language],
    queryFn: async ({ signal }): Promise<AmbientTrack[]> => {
      const res = await fetch(`/api/v1/ambient-tracks?lang=${encodeURIComponent(language)}${revision ? `&revision=${encodeURIComponent(revision)}` : ''}`,  { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch ambient tracks: ${res.statusText}`)
      }
      return res.json()
    },
    staleTime: 300_000,
  })
