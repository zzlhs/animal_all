import { describe, it, expect } from 'vitest'
import {
  detectMediaKind,
  parseAndValidateAudioUrl,
  copyAudioHeaders,
  AUDIO_CONTENT_TYPE_PATTERN,
} from './index.js'

describe('Media Package', () => {
  it('detects media kinds accurately', () => {
    expect(detectMediaKind('audio/mp3', 'http://example.com/sound.mp3')).toBe('audio')
    expect(detectMediaKind(null, 'http://example.com/recording.wav')).toBe('audio')
    expect(detectMediaKind('video/mp4', 'http://example.com/video.mp4')).toBe('video')
    expect(detectMediaKind(null, 'http://example.com/clip.webm')).toBe('video')
    expect(detectMediaKind('image/jpeg', 'http://example.com/photo.jpg')).toBe('image')
    expect(detectMediaKind(null, 'http://example.com/photo.png')).toBe('image')
  })

  it('validates allowed audio hosts and rejects SSRF targets', () => {
    // Allowed host
    const valid = parseAndValidateAudioUrl('https://xeno-canto.org/sounds/test.mp3')
    expect(valid.hostname).toBe('xeno-canto.org')

    // Disallowed host
    expect(() => parseAndValidateAudioUrl('https://evil.com/sound.mp3')).toThrow('not in allowed list')

    // SSRF localhost
    expect(() => parseAndValidateAudioUrl('http://localhost/sound.mp3')).toThrow('restricted')
    expect(() => parseAndValidateAudioUrl('http://127.0.0.1/sound.mp3')).toThrow('restricted')

    // SSRF AWS metadata
    expect(() => parseAndValidateAudioUrl('http://169.254.169.254/latest/meta-data')).toThrow('restricted')

    // SSRF private IP
    expect(() => parseAndValidateAudioUrl('http://192.168.1.1/sound.mp3')).toThrow('restricted')
    expect(() => parseAndValidateAudioUrl('http://10.0.0.1/sound.mp3')).toThrow('restricted')
  })

  it('copies safe audio headers with nosniff security header', () => {
    const original = new Headers({
      'content-type': 'audio/mpeg',
      'content-length': '1048576',
      'accept-ranges': 'bytes',
      'x-custom-secret': 'secret',
    })

    const copied = copyAudioHeaders(original)
    expect(copied.get('content-type')).toBe('audio/mpeg')
    expect(copied.get('content-length')).toBe('1048576')
    expect(copied.get('accept-ranges')).toBe('bytes')
    expect(copied.get('X-Content-Type-Options')).toBe('nosniff')
    expect(copied.get('x-custom-secret')).toBeNull()
  })

  it('validates audio content type pattern', () => {
    expect(AUDIO_CONTENT_TYPE_PATTERN.test('audio/mpeg')).toBe(true)
    expect(AUDIO_CONTENT_TYPE_PATTERN.test('audio/ogg; codecs=opus')).toBe(true)
    expect(AUDIO_CONTENT_TYPE_PATTERN.test('application/octet-stream')).toBe(true)
    expect(AUDIO_CONTENT_TYPE_PATTERN.test('text/html')).toBe(false)
  })
})
