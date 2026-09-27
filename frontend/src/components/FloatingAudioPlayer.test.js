import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingAudioPlayer from './FloatingAudioPlayer.vue'
import { useGlobalAudioPlayer } from '../composables/useGlobalAudioPlayer.js'
import * as audioCache from '../media/audioCache.js'

vi.mock('../media/audioCache.js', () => ({
  resolveAudioForPlayback: vi.fn(),
}))

describe('FloatingAudioPlayer', () => {
  let player

  beforeEach(() => {
    vi.stubGlobal('Audio', class MockAudio {
      constructor() {
        this.src = ''
        this.currentTime = 0
        this.duration = 45
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

  it('renders nothing when idle and no track is active', () => {
    const wrapper = mount(FloatingAudioPlayer, { props: { language: 'zh' } })
    expect(wrapper.find('.floating-audio-player').exists()).toBe(false)
  })

  it('renders track info and controls when a track is playing', async () => {
    const wrapper = mount(FloatingAudioPlayer, { props: { language: 'zh' } })

    const mockRecord = { gbifID: '12345678', latitude: 30, longitude: 120 }
    await player.playTrack({
      id: 'test-audio',
      sourceUrl: 'https://example.com/test.mp3',
      scientificName: 'Turdus merula',
      vernacularName: '乌鸫',
      thumbnail: 'https://example.com/cover.jpg',
      gbifID: '12345678',
      record: mockRecord,
    })

    expect(wrapper.find('.floating-audio-player').exists()).toBe(true)
    expect(wrapper.find('.floating-audio-player__title').text()).toBe('乌鸫')
    expect(wrapper.find('.floating-audio-player__subtitle').text()).toBe('Turdus merula')
    expect(wrapper.find('.floating-audio-player__cover').attributes('src')).toBe('https://example.com/cover.jpg')
    expect(wrapper.find('.floating-audio-player__equalizer').classes()).toContain('is-playing')

    // Locate button emits locate-track
    const locateBtn = wrapper.find('.floating-audio-player__locate-btn')
    expect(locateBtn.exists()).toBe(true)
    expect(locateBtn.text()).toContain('地图定位')
    await locateBtn.trigger('click')
    expect(wrapper.emitted('locate-track')).toBeTruthy()
    expect(wrapper.emitted('locate-track')[0][0]).toEqual(mockRecord)

    // GBIF link is rendered
    const gbifLink = wrapper.find('.floating-audio-player__gbif-link')
    expect(gbifLink.exists()).toBe(true)
    expect(gbifLink.attributes('href')).toBe('https://www.gbif.org/occurrence/12345678')

    // Close button dismisses player
    await wrapper.find('.floating-audio-player__close').trigger('click')
    expect(player.isVisible.value).toBe(false)
    expect(wrapper.find('.floating-audio-player').exists()).toBe(false)
  })

  it('renders ambient sound info and controls when ambient sound is active', async () => {
    const wrapper = mount(FloatingAudioPlayer, { props: { language: 'zh' } })

    const toggleSpy = vi.fn()
    const stopSpy = vi.fn()
    player.registerAmbientHandlers({
      togglePlayback: toggleSpy,
      stop: stopSpy,
      pause: vi.fn(),
    })

    player.updateAmbientState({
      isPlaying: true,
      isPaused: false,
      isLoading: false,
      mode: 'mix',
      title: '鸟鸣环境声',
      subtitle: '混合鸟鸣 (3种)',
      remainingSeconds: 1700,
      durationMinutes: 30,
      progressPercent: 5.5,
      trackCount: 3,
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.find('.floating-audio-player').exists()).toBe(true)
    expect(wrapper.find('.floating-audio-player').classes()).toContain('is-ambient')
    expect(wrapper.find('.floating-audio-player__title').text()).toBe('鸟鸣环境声')
    expect(wrapper.find('.floating-audio-player__subtitle').text()).toBe('混合鸟鸣 (3种)')
    expect(wrapper.find('.floating-audio-player__badge').text()).toContain('自然声景')

    // Click settings button emits open-ambient-settings
    await wrapper.find('.floating-audio-player__settings-btn').trigger('click')
    expect(wrapper.emitted('open-ambient-settings')).toHaveLength(1)

    // Click play/pause toggles ambient playback
    await wrapper.find('.floating-audio-player__play-btn').trigger('click')
    expect(toggleSpy).toHaveBeenCalled()

    // Close button stops ambient sound
    await wrapper.find('.floating-audio-player__close').trigger('click')
    expect(stopSpy).toHaveBeenCalled()
    expect(player.isVisible.value).toBe(false)
  })
})

