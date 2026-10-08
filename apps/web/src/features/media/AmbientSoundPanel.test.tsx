// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AmbientTrack } from '@gbif-globe/contracts'
import { AudioProvider, useAudioPlayer } from './AudioContext.js'
import { AmbientSoundPanel } from './AmbientSoundPanel.js'
const mock = vi.hoisted(() => ({ resolve: vi.fn(), play: vi.fn() }))
vi.mock('./audioCache.js', async importOriginal => ({ ...await importOriginal<typeof import('./audioCache.js')>(), resolveAudioForPlayback: mock.resolve }))
const audios: FakeAudio[] = []
class FakeAudio {
  src: string; loop = false; volume = 1; currentTime = 0
  pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn()
  play = vi.fn(() => mock.play(this.src))
  constructor(src = '') { this.src = src; audios.push(this) }
}
const tracks: AmbientTrack[] = [1, 2, 3, 4, 5, 6].map(i => ({ id: String(i), sourceUrl: `https://xeno-canto.org/${i}.mp3`, title: `Bird ${i}`, subtitle: `Species ${i}`, scientificName: `Species ${i}` }))
function Probe() {
  const player = useAudioPlayer()
  return <><output data-testid="audio-state">{player.activeSource}:{String(player.isPlaying)}</output>
    <button onClick={() => void player.playTrack({ id: 'occ', sourceUrl: 'https://xeno-canto.org/occ.mp3' })}>Occurrence</button></>
}
function setup() { return render(<AudioProvider><AmbientSoundPanel tracks={tracks} isOpen language="en" onClose={() => {}} /><Probe /></AudioProvider>) }
beforeEach(() => {
  audios.length = 0; mock.resolve.mockReset(); mock.play.mockReset()
  mock.resolve.mockImplementation(async (url: string) => ({ url: `blob:${url}`, cacheHit: false, cacheStored: true }))
  mock.play.mockResolvedValue(undefined)
  vi.stubGlobal('Audio', FakeAudio)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('ambient playback', () => {
  it('does not expire the countdown while the first CDN playback is buffering', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    mock.play.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    expect(screen.getByTestId('audio-state').textContent).toBe('ambient:false')
    await act(async () => finish())
    expect(screen.getByTestId('audio-state').textContent).toBe('ambient:true')
  })
  it('plays a loop, pauses, resumes and stops real audio entries', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('ambient:true'))
    expect(audios[0].loop).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('ambient:false'))
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('ambient:true'))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(audios[0].pause).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('keeps a mix between two and four tracks and starts every selected source', async () => {
    setup(); fireEvent.click(screen.getByRole('tab', { name: 'Mixed calls' }))
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.filter(b => b.checked)).toHaveLength(3)
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1])
    expect(boxes.filter(b => b.checked)).toHaveLength(2)
    for (const index of [3, 4]) fireEvent.click(boxes[index])
    expect(boxes.filter(b => b.checked)).toHaveLength(4)
    expect(boxes[0].disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    await waitFor(() => expect(audios.filter(a => a.play.mock.calls.length)).toHaveLength(4))
  })
  it('shows failure and does not report playing when every source rejects', async () => {
    mock.play.mockRejectedValue(new Error('Source unavailable'))
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    await waitFor(() => expect(screen.getByText(/could not be played/)).toBeTruthy())
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('ambient:false'))
  })
  it('continues a partial mix and exposes the failed source', async () => {
    mock.play.mockImplementation(async (url: string) => { if (url.endsWith('1.mp3')) throw new Error('Unavailable') })
    setup(); fireEvent.click(screen.getByRole('tab', { name: 'Mixed calls' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('ambient:true'))
    expect(screen.getByText(/Some selected calls/)).toBeTruthy()
  })
  it('discards audio that finishes preparing after stop', async () => {
    let complete!: (value: unknown) => void
    mock.resolve.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await act(async () => { complete({ url: 'blob:late' }) })
    expect(audios[0].play).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late')
  })
  it('cancels a pending soundscape when an occurrence starts', async () => {
    let complete!: (value: unknown) => void
    mock.resolve.mockImplementation((url: string) => url.endsWith('occ.mp3') ? Promise.resolve({ url: 'blob:occ' }) : new Promise(resolve => { complete = resolve }))
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Play ambience' }))
    fireEvent.click(screen.getByRole('button', { name: 'Occurrence' }))
    await waitFor(() => expect(screen.getByTestId('audio-state').textContent).toBe('occurrence:true'))
    await act(async () => { complete({ url: 'blob:late' }) })
    expect(audios.find(a => a.src === 'blob:late')?.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('audio-state').textContent).toBe('occurrence:true')
  })
})
