import { DataApiConstants, DataModeConstants } from './data.constants.js'

function normalizedBaseUrl(value) {
  return String(value || DataApiConstants.DEFAULT_BASE_URL).replace(/\/$/, '')
}

const requestedMode = String(import.meta.env.VITE_DATA_MODE || '').toLowerCase()

export const runtimeConfig = Object.freeze({
  dataMode: requestedMode === DataModeConstants.API ? DataModeConstants.API : DataModeConstants.SAMPLE,
  apiBaseUrl: normalizedBaseUrl(import.meta.env.VITE_API_BASE_URL),
  pmtilesUrl: String(import.meta.env.VITE_PMTILES_URL || '').trim(),
  pmtilesSourceLayer: String(import.meta.env.VITE_PMTILES_SOURCE_LAYER || 'gbif_occurrences').trim(),
})

export const usesScalableData = runtimeConfig.dataMode === DataModeConstants.API
