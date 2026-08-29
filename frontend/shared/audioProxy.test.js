import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllowedAudio, parseAudioSourceUrl } from './audioProxy.js'

afterEach(() => vi.unstubAllGlobals())

describe('shared audio proxy validation', () => {
  it('accepts an extensionless URL on an allowlisted host', () => {
    expect(parseAudioSourceUrl('https://xeno-canto.org/media/download?id=42').hostname).toBe('xeno-canto.org')
  })

  it('validates the response MIME type before proxying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not audio', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))
    await expect(fetchAllowedAudio('https://xeno-canto.org/media/download?id=42')).rejects.toThrow('content type')
  })
})
