import { basename, posix } from 'node:path'
import type { Readable } from 'node:stream'
import { parse, type Options as CsvParseOptions } from 'csv-parse'
import { XMLParser } from 'fast-xml-parser'
import iconv from 'iconv-lite'
import yauzl from 'yauzl'
import { ImportConstants } from '../config/api.constants.js'

interface OpenEntry {
  stream: Readable
  zipFile: yauzl.ZipFile
}

export interface DwcaSectionDescriptor {
  entryNames: readonly string[]
  encoding: string
  delimiter: string
  quote: string | false
  ignoreHeaderLines: number
  columns: Readonly<Record<string, number>> | null
}

export interface DwcaArchiveDescriptor {
  occurrence: DwcaSectionDescriptor
  media: DwcaSectionDescriptor | null
  usesMetaXml: boolean
}

function normalizedEntryName(value: string) {
  return archiveEntryName(value).toLowerCase()
}

function archiveEntryName(value: string) {
  return value.replaceAll('\\', '/').replace(/^(\.\/)+/, '')
}

function resolveArchiveLocation(metaEntryName: string, location: string) {
  const normalizedLocation = archiveEntryName(location.trim())
  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedLocation)) {
    throw new Error(`Remote DWCA location is not supported inside a ZIP import: ${location}`)
  }
  if (posix.isAbsolute(normalizedLocation)) {
    throw new Error(`DWCA location must be relative to meta.xml: ${location}`)
  }
  const metaDirectory = posix.dirname(archiveEntryName(metaEntryName))
  const resolved = posix.normalize(posix.join(metaDirectory, normalizedLocation))
  if (resolved === '..' || resolved.startsWith('../')) {
    throw new Error(`DWCA location escapes the archive root: ${location}`)
  }
  return resolved
}

function openResolvedZipEntry(archivePath: string, entryName: string): Promise<OpenEntry> {
  const wanted = normalizedEntryName(entryName)
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: false }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error(`Unable to open ${archivePath}`))
        return
      }

      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        zipFile.close()
        reject(error)
      }
      zipFile.once('error', fail)
      zipFile.on('entry', entry => {
        const candidate = normalizedEntryName(entry.fileName)
        if (candidate !== wanted) {
          zipFile.readEntry()
          return
        }
        settled = true
        zipFile.removeListener('error', fail)
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            zipFile.close()
            reject(streamError ?? new Error(`Unable to read ${entryName}`))
            return
          }
          resolve({ stream, zipFile })
        })
      })
      zipFile.once('end', () => fail(new Error(`${entryName} was not found in ${archivePath}`)))
      zipFile.readEntry()
    })
  })
}

function findZipEntry(archivePath: string, entryName: string): Promise<string | null> {
  const wanted = normalizedEntryName(entryName)
  const allowBasenameFallback = !wanted.includes('/')
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error(`Unable to open ${archivePath}`))
        return
      }
      const exactMatches: string[] = []
      const basenameMatches: string[] = []
      zipFile.once('error', reject)
      zipFile.on('entry', entry => {
        const candidate = normalizedEntryName(entry.fileName)
        if (candidate === wanted) exactMatches.push(entry.fileName)
        else if (allowBasenameFallback && basename(candidate) === basename(wanted)) basenameMatches.push(entry.fileName)
        zipFile.readEntry()
      })
      zipFile.once('end', () => {
        if (exactMatches.length > 1) {
          reject(new Error(`DWCA ZIP contains multiple entries matching ${entryName}: ${exactMatches.join(', ')}`))
          return
        }
        if (exactMatches[0]) {
          resolve(exactMatches[0])
          return
        }
        if (basenameMatches.length > 1) {
          reject(new Error(`DWCA ZIP entry ${entryName} is ambiguous: ${basenameMatches.join(', ')}`))
          return
        }
        resolve(basenameMatches[0] ?? null)
      })
      zipFile.readEntry()
    })
  })
}

async function openZipEntry(archivePath: string, entryName: string): Promise<OpenEntry> {
  const resolvedEntryName = await findZipEntry(archivePath, entryName)
  if (!resolvedEntryName) throw new Error(`${entryName} was not found in ${archivePath}`)
  return openResolvedZipEntry(archivePath, resolvedEntryName)
}

async function readZipEntryText(archivePath: string, entryName: string) {
  const { stream, zipFile } = await openZipEntry(archivePath, entryName)
  const chunks: Buffer[] = []
  try {
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    stream.destroy()
    zipFile.close()
  }
}

function localName(term: string) {
  const clean = term.trim().replace(/\/$/, '')
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('#')) + 1)
}

function decodeControlValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  return value
    .replaceAll('\\t', '\t')
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
}

function child(node: Record<string, unknown>, name: string) {
  const key = Object.keys(node).find(candidate => candidate.split(':').at(-1) === name)
  return key ? node[key] : undefined
}

function values<T>(value: T | T[] | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && '#text' in value) return String((value as { '#text': unknown })['#text'])
  return ''
}

function attribute(node: Record<string, unknown>, name: string) {
  return node[`@_${name}`]
}

function sectionDescriptor(
  node: Record<string, unknown>,
  kind: 'occurrence' | 'media',
  metaEntryName: string,
): DwcaSectionDescriptor {
  const files = child(node, 'files') as Record<string, unknown> | undefined
  const locationValue = files ? child(files, 'location') : undefined
  const locations = values(locationValue as unknown | unknown[] | undefined)
    .map(textValue)
    .filter(Boolean)
    .map(location => resolveArchiveLocation(metaEntryName, location))
  if (locations.length === 0) throw new Error(`DWCA meta.xml ${kind} section has no file location`)

  const columns: Record<string, number> = {}
  const identifier = child(node, kind === 'occurrence' ? 'id' : 'coreid')
  if (identifier && typeof identifier === 'object') {
    const index = Number(attribute(identifier as Record<string, unknown>, 'index'))
    if (Number.isInteger(index)) columns.gbifID = index
  }
  for (const field of values(child(node, 'field') as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const index = Number(attribute(field, 'index'))
    const term = String(attribute(field, 'term') ?? '')
    if (Number.isInteger(index) && term) columns[localName(term)] = index
  }

  const enclosed = attribute(node, 'fieldsEnclosedBy')
  const quote = enclosed === '' ? false : decodeControlValue(enclosed, '"')
  return {
    entryNames: Object.freeze(locations),
    encoding: String(attribute(node, 'encoding') || 'UTF-8'),
    delimiter: decodeControlValue(attribute(node, 'fieldsTerminatedBy'), '\t'),
    quote: quote || false,
    ignoreHeaderLines: Math.max(0, Number(attribute(node, 'ignoreHeaderLines')) || 0),
    columns: Object.keys(columns).length > 0 ? Object.freeze(columns) : null,
  }
}

function fallbackSection(entryName: string): DwcaSectionDescriptor {
  return {
    entryNames: Object.freeze([entryName]),
    encoding: 'UTF-8',
    delimiter: '\t',
    quote: '"',
    ignoreHeaderLines: 0,
    columns: null,
  }
}

export async function describeDwcaArchive(archivePath: string): Promise<DwcaArchiveDescriptor> {
  const metaEntry = await findZipEntry(archivePath, 'meta.xml')
  if (!metaEntry) {
    const occurrenceEntry = await findZipEntry(archivePath, ImportConstants.OCCURRENCE_ENTRY)
    if (!occurrenceEntry) throw new Error(`No meta.xml or ${ImportConstants.OCCURRENCE_ENTRY} was found in ${archivePath}`)
    const mediaEntry = await findZipEntry(archivePath, ImportConstants.MULTIMEDIA_ENTRY)
    return {
      occurrence: fallbackSection(occurrenceEntry),
      media: mediaEntry ? fallbackSection(mediaEntry) : null,
      usesMetaXml: false,
    }
  }

  const parsed = new XMLParser({ ignoreAttributes: false, trimValues: true }).parse(
    await readZipEntryText(archivePath, metaEntry),
  ) as Record<string, unknown>
  const archiveValue = child(parsed, 'archive')
  if (!archiveValue || typeof archiveValue !== 'object') throw new Error('DWCA meta.xml has no archive element')
  const archive = archiveValue as Record<string, unknown>
  const coreValue = child(archive, 'core')
  if (!coreValue || typeof coreValue !== 'object') throw new Error('DWCA meta.xml has no core section')
  const occurrence = sectionDescriptor(coreValue as Record<string, unknown>, 'occurrence', metaEntry)
  const extensions = values(child(archive, 'extension') as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const mediaNode = extensions.find(extension => localName(String(attribute(extension, 'rowType') ?? '')).toLowerCase() === 'multimedia')
  const media = mediaNode ? sectionDescriptor(mediaNode, 'media', metaEntry) : null

  return { occurrence, media, usesMetaXml: true }
}

export function createColumnMap(header: readonly string[]) {
  return Object.freeze(Object.fromEntries(header.map((name, index) => [localName(name.replace(/^\uFEFF/, '')), index])))
}

export function rowValue(row: readonly string[], columns: Readonly<Record<string, number>>, name: string) {
  const index = columns[name]
  if (index == null) return ''
  return row[index]?.trim() ?? ''
}

export async function* readDwcaRows(
  archivePath: string,
  section: DwcaSectionDescriptor | string,
): AsyncGenerator<{ row: string[]; columns: Readonly<Record<string, number>> }> {
  const descriptor = typeof section === 'string' ? fallbackSection(section) : section
  if (!iconv.encodingExists(descriptor.encoding)) throw new Error(`Unsupported DWCA encoding: ${descriptor.encoding}`)
  for (const entryName of descriptor.entryNames) {
    const { stream, zipFile } = await openZipEntry(archivePath, entryName)
    const decoded = stream.pipe(iconv.decodeStream(descriptor.encoding)) as unknown as Readable
    const parserOptions: CsvParseOptions = {
      delimiter: descriptor.delimiter,
      quote: descriptor.quote,
      escape: descriptor.quote || false,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }
    const parser = decoded.pipe(parse(parserOptions))
    let columns = descriptor.columns
    let ignoredRows = 0

    try {
      for await (const value of parser) {
        const row = value as string[]
        if (ignoredRows < descriptor.ignoreHeaderLines) {
          ignoredRows += 1
          continue
        }
        if (!columns) {
          columns = createColumnMap(row)
          continue
        }
        yield { row, columns }
      }
    } finally {
      parser.destroy()
      decoded.destroy()
      stream.destroy()
      zipFile.close()
    }
  }
}
