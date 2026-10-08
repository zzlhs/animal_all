// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioProvider, useAudioPlayer } from './AudioContext.js'
import { FloatingAudioPlayer } from './FloatingAudioPlayer.js'
import { AudioPreparationError } from './audioCache.js'
const mock = vi.hoisted(() => ({ resolve: vi.fn(), play: vi.fn() }))
vi.mock('./audioCache.js', async importOriginal => ({ ...await importOriginal<typeof import('./audioCache.js')>(), resolveAudioForPlayback: mock.resolve }))
const elements: FakeAudio[] = []
class FakeAudio {
  src: string; currentTime = 0; duration = 12; paused = true; ended = false
  onplaying: any; onwaiting: any; onstalled: any; onpause: any; onended: any; onerror: any
  onloadedmetadata: any; ontimeupdate: any
  constructor(src: string) { this.src = src; elements.push(this) }
  play = vi.fn(async () => { await mock.play(); this.paused = false; this.onplaying?.() })
  pause = vi.fn(() => { this.paused = true; this.onpause?.() })
  load = vi.fn(); removeAttribute = vi.fn()
}
function Probe() {
  const player = useAudioPlayer()
  return <><button onClick={() => void player.playTrack({ id: 'track', mediaId: '1231', sourceUrl: 'https://xeno-canto.org/a.mp3', scientificName: 'Bird' })}>Start</button>
    <output data-testid="status">{player.status}</output><output data-testid="error">{player.errorMessage}</output>
    <button onClick={player.close}>Close</button><FloatingAudioPlayer language="en" /></>
}
beforeEach(() => {
  elements.length = 0; mock.resolve.mockReset(); mock.play.mockReset()
  mock.resolve.mockResolvedValue({ url: 'https://ik.imagekit.io/test/a.mp3', cacheHit: true, cacheStored: true })
  mock.play.mockResolvedValue(undefined); vi.stubGlobal('Audio', FakeAudio); URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup() { render(<AudioProvider><Probe /></AudioProvider>) }
describe('accurate occurrence audio state', () => {
  it('shows preparation instead of playing while the persistent job is unfinished', async () => {
    let finish!: (value: any) => void
    mock.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    setup(); fireEvent.click(screen.getByText('Start'))
    expect(screen.getByTestId('status').textContent).toBe('preparing')
    expect(screen.queryByText('Playing')).toBeNull()
    await act(async () => finish({ url: 'https://ik.imagekit.io/test/a.mp3' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'))
  })
  it('tracks actual buffering, pause and resume events', async () => {
    setup(); fireEvent.click(screen.getByText('Start'))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'))
    act(() => elements[0].onwaiting())
    expect(screen.getByTestId('status').textContent).toBe('buffering')
    act(() => elements[0].onplaying())
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByTestId('status').textContent).toBe('paused')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'))
  })
  it('reissues a download request from the floating retry button after preparation fails', async () => {
    mock.resolve.mockRejectedValueOnce(new AudioPreparationError('IDLE_TIMEOUT'))
    setup(); fireEvent.click(screen.getByText('Start'))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('failed'))
    expect(screen.getByTestId('error').textContent).toBe('media.idleTimeout')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'))
    expect(mock.resolve.mock.calls[1][3]).toEqual({ mediaId: '1231', retry: true })
  })
  it('distinguishes browser autoplay rejection and retries playback directly on a gesture', async () => {
    mock.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    setup(); fireEvent.click(screen.getByText('Start'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('media.autoplayBlocked'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('playing'))
    expect(mock.resolve).toHaveBeenCalledTimes(1)
  })
  it('does not start playback after closing an unfinished preparation', async () => {
    let finish!: (value: any) => void
    mock.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    setup(); fireEvent.click(screen.getByText('Start')); fireEvent.click(screen.getByText('Close'))
    await act(async () => finish({ url: 'https://ik.imagekit.io/test/a.mp3' }))
    expect(elements).toHaveLength(0)
    expect(screen.getByTestId('status').textContent).toBe('idle')
  })
})
