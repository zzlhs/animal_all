import { latLngToCell } from 'h3-js'
import { ImportConstants, MapDataConstants } from '../config/api.constants.js'
import { rowValue } from './dwca-reader.js'

function numberOrNull(value: string) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integerOrNull(value: string) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function uuidOrNull(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function validCoordinate(latitude: number | null, longitude: number | null) {
  return latitude != null && longitude != null
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180
}

function httpUrlOrEmpty(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ImportConstants.MEDIA_URL_PROTOCOLS.includes(
      url.protocol as typeof ImportConstants.MEDIA_URL_PROTOCOLS[number],
    ) ? url.href : ''
  } catch {
    return ''
  }
}

export interface SpeciesImportRecord {
  speciesKey: string
  scientificName: string
  acceptedScientificName: string
  kingdom: string
  phylum: string
  className: string
  orderName: string
  family: string
  genus: string
  taxonRank: string
}

export interface OccurrenceImportRecord {
  gbifId: string
  occurrenceId: string
  speciesKey: string | null
  scientificName: string
  datasetKey: string | null
  datasetName: string
  countryCode: string
  continent: string
  stateProvince: string
  county: string
  municipality: string
  locality: string
  latitude: number | null
  longitude: number | null
  coordinateUncertaintyMeters: number | null
  coordinatePrecision: number | null
  eventDate: string
  eventYear: number | null
  basisOfRecord: string
  occurrenceStatus: string
  license: string
  referencesUrl: string
  rightsHolder: string
  h3: Readonly<Record<number, string | null>>
  rawData: Readonly<Record<string, unknown>>
  species: SpeciesImportRecord | null
}

export interface MediaImportRecord {
  gbifId: string
  mediaType: string
  format: string
  identifier: string
  sourceUrl: string
  referencesUrl: string
  title: string
  description: string
  created: string
  creator: string
  contributor: string
  publisher: string
  license: string
  rightsHolder: string
}

export function parseOccurrenceRow(
  row: readonly string[],
  columns: Readonly<Record<string, number>>,
  kingdomFilter: string,
): OccurrenceImportRecord | null {
  const kingdom = rowValue(row, columns, 'kingdom')
  if (kingdom !== kingdomFilter) return null
  const gbifId = rowValue(row, columns, 'gbifID')
  const scientificName = rowValue(row, columns, 'scientificName')
  if (!/^\d+$/.test(gbifId) || !scientificName) return null

  const latitude = numberOrNull(rowValue(row, columns, 'decimalLatitude'))
  const longitude = numberOrNull(rowValue(row, columns, 'decimalLongitude'))
  const hasValidCoordinate = validCoordinate(latitude, longitude)
  const speciesKeyValue = rowValue(row, columns, 'speciesKey')
  const speciesKey = /^\d+$/.test(speciesKeyValue) ? speciesKeyValue : null
  const h3 = Object.fromEntries(MapDataConstants.SUPPORTED_H3_RESOLUTIONS.map(resolution => [
    resolution,
    hasValidCoordinate ? latLngToCell(latitude!, longitude!, resolution) : null,
  ]))
  const speciesName = rowValue(row, columns, 'species') || scientificName

  return {
    gbifId,
    occurrenceId: rowValue(row, columns, 'occurrenceID'),
    speciesKey,
    scientificName,
    datasetKey: uuidOrNull(rowValue(row, columns, 'datasetKey')),
    datasetName: rowValue(row, columns, 'datasetName'),
    countryCode: rowValue(row, columns, 'countryCode'),
    continent: rowValue(row, columns, 'continent'),
    stateProvince: rowValue(row, columns, 'stateProvince'),
    county: rowValue(row, columns, 'county'),
    municipality: rowValue(row, columns, 'municipality'),
    locality: rowValue(row, columns, 'locality'),
    latitude: hasValidCoordinate ? latitude : null,
    longitude: hasValidCoordinate ? longitude : null,
    coordinateUncertaintyMeters: numberOrNull(rowValue(row, columns, 'coordinateUncertaintyInMeters')),
    coordinatePrecision: numberOrNull(rowValue(row, columns, 'coordinatePrecision')),
    eventDate: rowValue(row, columns, 'eventDate'),
    eventYear: integerOrNull(rowValue(row, columns, 'year')),
    basisOfRecord: rowValue(row, columns, 'basisOfRecord'),
    occurrenceStatus: rowValue(row, columns, 'occurrenceStatus'),
    license: rowValue(row, columns, 'license'),
    referencesUrl: httpUrlOrEmpty(rowValue(row, columns, 'references')),
    rightsHolder: rowValue(row, columns, 'rightsHolder'),
    h3,
    rawData: {
      acceptedScientificName: rowValue(row, columns, 'acceptedScientificName'),
      verbatimScientificName: rowValue(row, columns, 'verbatimScientificName'),
      vernacularName: rowValue(row, columns, 'vernacularName'),
      country: rowValue(row, columns, 'country'),
      language: rowValue(row, columns, 'language'),
      kingdom,
      phylum: rowValue(row, columns, 'phylum'),
      className: rowValue(row, columns, 'class'),
      orderName: rowValue(row, columns, 'order'),
      family: rowValue(row, columns, 'family'),
      genus: rowValue(row, columns, 'genus'),
      speciesName,
      taxonRank: rowValue(row, columns, 'taxonRank'),
    },
    species: speciesKey ? {
      speciesKey,
      scientificName: speciesName,
      acceptedScientificName: rowValue(row, columns, 'acceptedScientificName'),
      kingdom,
      phylum: rowValue(row, columns, 'phylum'),
      className: rowValue(row, columns, 'class'),
      orderName: rowValue(row, columns, 'order'),
      family: rowValue(row, columns, 'family'),
      genus: rowValue(row, columns, 'genus'),
      taxonRank: rowValue(row, columns, 'taxonRank'),
    } : null,
  }
}

export function parseMediaRow(row: readonly string[], columns: Readonly<Record<string, number>>): MediaImportRecord | null {
  const gbifId = rowValue(row, columns, 'gbifID')
  if (!/^\d+$/.test(gbifId)) return null
  const values = Object.fromEntries(ImportConstants.MEDIA_URL_FIELDS.map(field => [
    field,
    httpUrlOrEmpty(rowValue(row, columns, field)),
  ]))
  const identifier = values.identifier || values.references || values.source
  if (!identifier) return null
  return {
    gbifId,
    mediaType: rowValue(row, columns, 'type'),
    format: rowValue(row, columns, 'format'),
    identifier,
    sourceUrl: values.source ?? '',
    referencesUrl: values.references ?? '',
    title: rowValue(row, columns, 'title'),
    description: rowValue(row, columns, 'description'),
    created: rowValue(row, columns, 'created'),
    creator: rowValue(row, columns, 'creator'),
    contributor: rowValue(row, columns, 'contributor'),
    publisher: rowValue(row, columns, 'publisher'),
    license: rowValue(row, columns, 'license'),
    rightsHolder: rowValue(row, columns, 'rightsHolder'),
  }
}
