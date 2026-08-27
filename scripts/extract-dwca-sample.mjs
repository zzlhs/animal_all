#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { createInterface } from 'node:readline'

const archivePath = process.argv[2]
const outputPath = process.argv[3] || 'public/data/occurrences.json'
const sampleSize = Number(process.argv[4] || 100)
const audioSampleSize = Number(process.argv[5] || 0)

if (!archivePath) {
  console.error('Usage: node scripts/extract-dwca-sample.mjs <archive.zip> [output.json] [sample-size] [audio-sample-size]')
  process.exit(1)
}

function startZipEntry(entry) {
  const child = spawn('unzip', ['-p', archivePath, entry], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  return { child, lines }
}

function closeZipEntry({ child, lines }) {
  lines.close()
  child.stdout.destroy()
  child.kill('SIGTERM')
}

function parseLine(line) {
  return line.replace(/\r$/, '').split('\t')
}

function columnMap(header) {
  return Object.fromEntries(header.map((name, index) => [name.replace(/^\uFEFF/, ''), index]))
}

function value(row, columns, name) {
  const item = row[columns[name]]
  return item == null ? '' : item.trim()
}

function numberOrNull(raw) {
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function integerOrNull(raw) {
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function listValue(raw) {
  return raw.split(';').map(item => item.trim()).filter(Boolean)
}

function mediaUrl(media) {
  return media.identifier || media.references || media.source || ''
}

function isAudioMedia(media) {
  const type = media.type.toLowerCase()
  const format = media.format.toLowerCase()
  const url = mediaUrl(media).toLowerCase()
  return type.includes('sound')
    || format.startsWith('audio/')
    || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)(?:[?#]|$)/i.test(url)
}

function occurrenceFromRow(row, columns, index, sampleGroup) {
  const latitude = numberOrNull(value(row, columns, 'decimalLatitude'))
  const longitude = numberOrNull(value(row, columns, 'decimalLongitude'))
  return {
    index,
    sampleGroup,
    gbifID: value(row, columns, 'gbifID'),
    occurrenceID: value(row, columns, 'occurrenceID'),
    datasetKey: value(row, columns, 'datasetKey'),
    datasetName: value(row, columns, 'datasetName'),
    scientificName: value(row, columns, 'scientificName'),
    verbatimScientificName: value(row, columns, 'verbatimScientificName'),
    kingdom: value(row, columns, 'kingdom'),
    phylum: value(row, columns, 'phylum'),
    class: value(row, columns, 'class'),
    order: value(row, columns, 'order'),
    family: value(row, columns, 'family'),
    genus: value(row, columns, 'genus'),
    species: value(row, columns, 'species') || null,
    taxonRank: value(row, columns, 'taxonRank'),
    countryCode: value(row, columns, 'countryCode'),
    continent: value(row, columns, 'continent'),
    stateProvince: value(row, columns, 'stateProvince'),
    county: value(row, columns, 'county'),
    municipality: value(row, columns, 'municipality'),
    locality: value(row, columns, 'locality'),
    latitude,
    longitude,
    hasCoordinates: latitude !== null && longitude !== null,
    coordinateUncertaintyInMeters: numberOrNull(value(row, columns, 'coordinateUncertaintyInMeters')),
    coordinatePrecision: numberOrNull(value(row, columns, 'coordinatePrecision')),
    eventDate: value(row, columns, 'eventDate'),
    year: integerOrNull(value(row, columns, 'year')),
    basisOfRecord: value(row, columns, 'basisOfRecord'),
    occurrenceStatus: value(row, columns, 'occurrenceStatus'),
    mediaTypes: listValue(value(row, columns, 'mediaType')),
    license: value(row, columns, 'license'),
    references: value(row, columns, 'references'),
    rightsHolder: value(row, columns, 'rightsHolder'),
    media: [],
  }
}

async function readOccurrenceSample() {
  const stream = startZipEntry('occurrence.txt')
  let columns = null
  const rows = []
  let occurrenceRow = 0

  try {
    for await (const line of stream.lines) {
      if (!columns) {
        columns = columnMap(parseLine(line))
        continue
      }
      if (!line || rows.length >= sampleSize) break

      const row = parseLine(line)
      occurrenceRow += 1
      rows.push(occurrenceFromRow(row, columns, occurrenceRow, 'first-100'))
    }
  } finally {
    closeZipEntry(stream)
  }

  if (!columns || rows.length === 0) throw new Error('occurrence.txt did not contain any records')
  return rows
}

async function readOccurrenceAudioSample(candidateIds, excludedIds) {
  if (!audioSampleSize || candidateIds.size === 0) return []

  const stream = startZipEntry('occurrence.txt')
  let columns = null
  let occurrenceRow = 0
  const rows = []
  const selectedIds = new Set()

  try {
    for await (const line of stream.lines) {
      if (!columns) {
        columns = columnMap(parseLine(line))
        continue
      }
      if (!line || rows.length >= audioSampleSize) break

      const row = parseLine(line)
      occurrenceRow += 1
      const gbifID = value(row, columns, 'gbifID')
      if (excludedIds.has(gbifID) || !candidateIds.has(gbifID) || selectedIds.has(gbifID)) continue

      const record = occurrenceFromRow(row, columns, occurrenceRow, 'audio-20')
      if (!record.hasCoordinates) continue

      rows.push(record)
      selectedIds.add(gbifID)
    }
  } finally {
    closeZipEntry(stream)
  }

  return rows
}

function mediaFromRow(row, columns) {
  return {
    type: value(row, columns, 'type'),
    format: value(row, columns, 'format'),
    identifier: value(row, columns, 'identifier'),
    references: value(row, columns, 'references'),
    title: value(row, columns, 'title'),
    description: value(row, columns, 'description'),
    source: value(row, columns, 'source'),
    created: value(row, columns, 'created'),
    creator: value(row, columns, 'creator'),
    contributor: value(row, columns, 'contributor'),
    publisher: value(row, columns, 'publisher'),
    license: value(row, columns, 'license'),
    rightsHolder: value(row, columns, 'rightsHolder'),
  }
}

async function readLinkedMedia(recordIds, audioCandidateLimit) {
  const stream = startZipEntry('multimedia.txt')
  const linked = new Map()
  const audioCandidates = new Map()
  let columns = null

  try {
    for await (const line of stream.lines) {
      if (!columns) {
        columns = columnMap(parseLine(line))
        continue
      }
      if (!line) continue

      const row = parseLine(line)
      const gbifID = value(row, columns, 'gbifID')
      if (!gbifID) continue
      const media = mediaFromRow(row, columns)

      if (recordIds.has(gbifID)) {
        const records = linked.get(gbifID) || []
        records.push(media)
        linked.set(gbifID, records)
      }

      if (isAudioMedia(media)) {
        const records = audioCandidates.get(gbifID)
        if (records) {
          records.push(media)
        } else if (audioCandidates.size < audioCandidateLimit) {
          audioCandidates.set(gbifID, [media])
        }
      }
    }
  } finally {
    closeZipEntry(stream)
  }

  return { linked, audioCandidates }
}

const baseRecords = await readOccurrenceSample()
const baseRecordIds = new Set(baseRecords.map(record => record.gbifID))
const audioCandidateLimit = audioSampleSize > 0 ? Math.max(audioSampleSize * 12, 200) : 0
const { linked: baseMediaByRecord, audioCandidates } = await readLinkedMedia(baseRecordIds, audioCandidateLimit)
const audioRecords = await readOccurrenceAudioSample(new Set(audioCandidates.keys()), baseRecordIds)
const records = [...baseRecords, ...audioRecords]
const mediaByRecord = new Map(baseMediaByRecord)
for (const record of audioRecords) {
  mediaByRecord.set(record.gbifID, audioCandidates.get(record.gbifID) || [])
}

for (const record of records) {
  record.media = mediaByRecord.get(record.gbifID) || []
  record.mediaTypes = [...new Set([
    ...record.mediaTypes,
    ...record.media.map(media => media.type).filter(Boolean),
  ])]
}

const mediaItems = records.reduce((total, record) => total + record.media.length, 0)
const mediaRecords = records.filter(record => record.media.length > 0).length
const plottableRecords = records.filter(record => record.hasCoordinates).length
const mediaTypeCounts = {}
for (const record of records) {
  for (const media of record.media) {
    const type = media.type || 'Unknown'
    mediaTypeCounts[type] = (mediaTypeCounts[type] || 0) + 1
  }
}

const payload = {
  meta: {
    source: basename(archivePath),
    rowsSampled: records.length,
    plottableRecords,
    recordsWithoutCoordinates: records.length - plottableRecords,
    mediaRecords,
    mediaItems,
    baseRowsSampled: baseRecords.length,
    audioRowsSampled: audioRecords.length,
    audioCandidateRecords: audioCandidates.size,
    mediaTypeCounts,
    mediaNote: 'Media URLs come from the DWCA multimedia.txt extension and are bundled in this local preview sample.',
  },
  records,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify(payload.meta, null, 2))
