import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalAudioPlayer } from './useGlobalAudioPlayer.js'
import * as audioCache from '../media/audioCache.js'

vi.mock('../media/audioCache.js', () => ({
  resolveAudioForPlayback: vi.fn(),
}))

describe('useGlobalAudioPlayer', () => {
  let player

  beforeEach(() => {
    vi.stubGlobal('Audio', class MockAudio {
      constructor() {
        this.src = ''
        this.currentTime = 0
        this.duration = 60
        this.listeners = {}
      }
      addEventListener(event, handler) {
        this.listeners[event] = handler
      }
      play() {
        this.listeners.play?.()
        return Promise.resolve()
      }
      pause() {
        this.listeners.pause?.()
      }
      load() {}
      removeAttribute() {}
    })

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-audio'),
      revokeObjectURL: vi.fn(),
    })

    audioCache.resolveAudioForPlayback.mockResolvedValue({
      blob: new Blob(['mock']),
      cacheHit: true,
      cacheStored: true,
    })

    player = useGlobalAudioPlayer()
  })

  afterEach(() => {
    player.close()
    vi.restoreAllMocks()
  })

  it('manages track loading, playing and pausing state', async () => {
    expect(player.isVisible.value).toBe(false)
    expect(player.isPlaying.value).toBe(false)

    await player.playTrack({
      id: 'track-1',
      sourceUrl: 'https://example.com/bird.mp3',
      scientificName: 'Turdus merula',
      vernacularName: '乌鸫',
    })

    expect(player.isVisible.value).toBe(true)
    expect(player.isPlaying.value).toBe(true)
    expect(player.currentTrack.value.vernacularName).toBe('乌鸫')

    player.pause()
    expect(player.isPlaying.value).toBe(false)
    expect(player.isPaused.value).toBe(true)

    player.resume()
    expect(player.isPlaying.value).toBe(true)

    player.close()
    expect(player.isVisible.value).toBe(false)
    expect(player.currentTrack.value).toBeNull()
  })

  it('seeks and handles progress', async () => {
    await player.playTrack({
      id: 'track-2',
      sourceUrl: 'https://example.com/robin.mp3',
    })

    player.seek(30)
    expect(player.currentTime.value).toBe(30)
  })

  it('coordinates ambient sound and occurrence playback', async () => {
    const pauseAmbientSpy = vi.fn()
    player.registerAmbientHandlers({
      pause: pauseAmbientSpy,
      togglePlayback: vi.fn(),
      stop: vi.fn(),
    })

    // Ambient sound starts playing
    player.updateAmbientState({
      isPlaying: true,
      mode: 'single',
      remainingSeconds: 600,
      durationMinutes: 10,
    })
    expect(player.activeSource.value).toBe('ambient')
    expect(player.isVisible.value).toBe(true)

    // User plays an occurrence track -> pauses ambient sound
    await player.playTrack({
      id: 'track-3',
      sourceUrl: 'https://example.com/cuckoo.mp3',
    })
    expect(pauseAmbientSpy).toHaveBeenCalled()
    expect(player.activeSource.value).toBe('occurrence')
  })
})
