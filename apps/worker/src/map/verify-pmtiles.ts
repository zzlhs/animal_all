import { fileURLToPath } from 'node:url'
import { open } from 'node:fs/promises'
import { ObjectStorageConstants } from '../config/api.constants.js'
import { loadPmtilesVerificationConfig } from '../config/env.js'

function cliValue(name: string, fallback: string) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

export async function verifyRemotePmtiles(url: string, origin = '') {
  if (!url) throw new Error('A PMTiles URL is required')
  const endByte = ObjectStorageConstants.PMTILES_HEADER_LENGTH_BYTES - 1
  const headers = new Headers({ Range: `bytes=0-${endByte}` })
  if (origin) headers.set('Origin', origin)
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(ObjectStorageConstants.VERIFY_TIMEOUT_MILLISECONDS),
  })
  if (response.status !== 206) throw new Error(`PMTiles host did not honor Range: expected 206, received ${response.status}`)
  const contentRange = response.headers.get('content-range') || ''
  if (!contentRange.startsWith(`bytes 0-${endByte}/`)) throw new Error(`Invalid PMTiles Content-Range: ${contentRange || 'missing'}`)
  if (origin) {
    const allowedOrigin = response.headers.get('access-control-allow-origin') || ''
    if (allowedOrigin !== '*' && allowedOrigin !== origin) throw new Error(`PMTiles CORS does not allow ${origin}`)
  }
  const header = new Uint8Array(await response.arrayBuffer())
  if (header.byteLength !== ObjectStorageConstants.PMTILES_HEADER_LENGTH_BYTES) {
    throw new Error(`Invalid PMTiles header length: ${header.byteLength}`)
  }
  verifyPmtilesHeader(header)
  return { contentRange, contentType: response.headers.get('content-type') || '' }
}

export function verifyPmtilesHeader(header: Uint8Array) {
  const magic = new TextDecoder().decode(header.subarray(0, ObjectStorageConstants.PMTILES_MAGIC.length))
  if (magic !== ObjectStorageConstants.PMTILES_MAGIC || header[7] !== ObjectStorageConstants.PMTILES_SPEC_VERSION) {
    throw new Error('Object is not a PMTiles v3 archive')
  }
}

export async function verifyLocalPmtiles(path: string) {
  const file = await open(path, 'r')
  try {
    const header = Buffer.alloc(ObjectStorageConstants.PMTILES_HEADER_LENGTH_BYTES)
    const result = await file.read(header, 0, header.byteLength, 0)
    if (result.bytesRead !== header.byteLength) {
      throw new Error(`Invalid PMTiles header length: ${result.bytesRead}`)
    }
    verifyPmtilesHeader(header)
  } finally {
    await file.close()
  }
}

async function runFromCli() {
  const config = loadPmtilesVerificationConfig()
  const url = cliValue('--url', config.pmtilesUrl)
  const origin = cliValue('--origin', config.objectStorageVerifyOrigin)
  const result = await verifyRemotePmtiles(url, origin)
  console.log(`Verified PMTiles v3 Range response: ${result.contentRange}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFromCli().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
