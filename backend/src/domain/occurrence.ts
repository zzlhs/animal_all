export interface MediaItem {
  id: string
  type: string
  format: string
  identifier: string
  source: string
  references: string
  title: string
  description: string
  created: string
  creator: string
  contributor: string
  publisher: string
  license: string
  rightsHolder: string
}

export interface OccurrenceRecord {
  gbifID: string
  occurrenceID: string
  speciesKey: string | null
  datasetKey: string
  datasetName: string
  scientificName: string
  vernacularName: string
  dataLanguage: string
  kingdom: string
  phylum: string
  class: string
  order: string
  family: string
  genus: string
  species: string | null
  taxonRank: string
  countryCode: string
  country: string
  continent: string
  stateProvince: string
  county: string
  municipality: string
  locality: string
  latitude: number
  longitude: number
  hasCoordinates: boolean
  coordinateUncertaintyInMeters: number | null
  coordinatePrecision: number | null
  eventDate: string
  year: number | null
  basisOfRecord: string
  occurrenceStatus: string
  license: string
  references: string
  rightsHolder: string
  aggregateCount?: number
  media: MediaItem[]
}

export interface PageResult<Item> {
  items: Item[]
  total: number
  nextCursor: string | null
}
