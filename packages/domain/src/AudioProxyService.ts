import { fetchAllowedAudioStream, copyAudioHeaders } from '@gbif-globe/media'

export class AudioProxyService {
  async handleProxyRequest(
    rawUrl: string,
    options: {
      method?: 'GET' | 'HEAD'
      range?: string
      signal?: AbortSignal
      allowedHosts?: string[]
    } = {},
  ): Promise<{ response: Response; headers: Headers }> {
    const upstream = await fetchAllowedAudioStream(rawUrl, options)
    const headers = copyAudioHeaders(upstream.headers)
    return { response: upstream, headers }
  }
}
