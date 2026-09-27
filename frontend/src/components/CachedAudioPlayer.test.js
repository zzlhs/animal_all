import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CachedAudioPlayer from './CachedAudioPlayer.vue'
import { useGlobalAudioPlayer } from '../composables/useGlobalAudioPlayer.js'
import * as audioCache from '../media/audioCache.js'

vi.mock('../media/audioCache.js', () => ({
  resolveAudioForPlayback: vi.fn(),
}))

describe('CachedAudioPlayer', () => {
  let player

  beforeEach(() => {
    vi.stubGlobal('Audio', class MockAudio {
      constructor() {
        this.src = ''
        this.currentTime = 0
        this.duration = 30
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
      createObjectURL: vi.fn(() => 'blob:mock-url'),
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

  it('renders and delegates playback to the global player without stopping on unmount', async () => {
    const wrapper = mount(CachedAudioPlayer, {
      props: {
        sourceUrl: 'https://example.com/bird.mp3',
        record: { gbifID: 1001, scientificName: 'Turdus merula', vernacularName: '乌鸫' },
        language: 'zh',
      },
    })

    expect(wrapper.find('button').text()).toContain('缓存并播放')

    await wrapper.find('button').trigger('click')

    expect(player.isPlaying.value).toBe(true)
    expect(player.currentTrack.value.scientificName).toBe('Turdus merula')
    expect(wrapper.find('button').classes()).toContain('is-playing')

    // Unmounting CachedAudioPlayer (e.g. mouse leaving card) MUST NOT stop audio!
    wrapper.unmount()
    expect(player.isPlaying.value).toBe(true)
  })
})
