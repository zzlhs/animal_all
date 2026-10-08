import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { ResourceCacheConstants as C } from './resource.constants.js'

const restricted = new BlockList()
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4]] as const) restricted.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) restricted.addSubnet(address, prefix, 'ipv6')

export async function validatePublicResourceUrl(raw: string, allowedHost?: string) {
  const url = new URL(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port)) || (allowedHost && host !== allowedHost)) throw new Error('Unsupported resource URL')
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true })
  if (!addresses.length || addresses.some(({ address, family }) => restricted.check(address, family === 6 ? 'ipv6' : 'ipv4') || (address.startsWith('::ffff:') && restricted.check(address.slice(7), 'ipv4')))) throw new Error('Restricted resource host')
  return url
}

export async function fetchResource(raw: string, options: { maxBytes: number; contentType: RegExp; allowedHost?: string }) {
  const signal = AbortSignal.timeout(C.FETCH_TIMEOUT_MS)
  let url = await validatePublicResourceUrl(raw, options.allowedHost)
  for (let redirect = 0; redirect <= C.MAX_REDIRECTS; redirect++) {
    const response = await fetch(url, { signal, redirect: 'manual', headers: { 'User-Agent': 'gbif-globe/3.0 resource-cache', Accept: '*/*' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location) throw new Error('Resource redirect has no destination')
      url = await validatePublicResourceUrl(new URL(location, url).href, options.allowedHost)
      continue
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!response.ok || !options.contentType.test(contentType) || Number(response.headers.get('content-length')) > options.maxBytes) {
      await response.body?.cancel()
      throw new Error(`Resource unavailable (${response.status})`)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Resource has no content')
    const chunks: Uint8Array[] = []
    let received = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > options.maxBytes) throw new Error('Resource exceeds size limit')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    return { body: Buffer.concat(chunks), contentType }
  }
  throw new Error('Resource exceeded redirect limit')
}
