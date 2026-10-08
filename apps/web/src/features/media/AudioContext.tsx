import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { AudioPlaybackStatus, OccurrenceRecord } from '@gbif-globe/contracts'
import { resolveAudioForPlayback, audioErrorMessage } from './audioCache.js'

export interface ActiveTrack {
  id: string; sourceUrl: string; mediaId?: string; scientificName?: string; vernacularName?: string
  thumbnail?: string; gbifID?: string; record?: OccurrenceRecord
}
export interface AmbientState {
  title: string; subtitle: string; durationMinutes: number; remainingSeconds: number
  isPlaying: boolean; isPaused: boolean; isLoading: boolean; mode: 'single' | 'mix'
  status?: AudioPlaybackStatus; errorMessage?: string
}
interface AmbientHandlers { togglePlayback: () => void; stop: () => void; pause: () => void }
export interface AudioContextValue {
  activeSource: 'occurrence' | 'ambient' | 'none'; currentTrack: ActiveTrack | null
  status: AudioPlaybackStatus; isPlaying: boolean; isLoading: boolean; isEnded: boolean
  currentTime: number; duration: number; progressPercent: number; isVisible: boolean
  ambientState: AmbientState; errorMessage: string; cacheResult: 'none' | 'hit' | 'stored' | 'failed'
  playTrack: (track: ActiveTrack, retry?: boolean) => Promise<void>; togglePlay: () => void
  seek: (seconds: number) => void; close: () => void
  registerAmbientHandlers: (handlers: AmbientHandlers) => void
  updateAmbientState: (partial: Partial<AmbientState>) => void
  onLocateTrack?: (record: OccurrenceRecord) => void
  setOnLocateTrack: (cb: (record: OccurrenceRecord) => void) => void
}
const AudioContext = createContext<AudioContextValue | null>(null)
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [activeSource, setActiveSource] = useState<'occurrence' | 'ambient' | 'none'>('none')
  const source = useRef<'occurrence' | 'ambient' | 'none'>('none')
  const [currentTrack, setCurrentTrack] = useState<ActiveTrack | null>(null)
  const [status, setStatus] = useState<AudioPlaybackStatus>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [cacheResult, setCacheResult] = useState<'none' | 'hit' | 'stored' | 'failed'>('none')
  const [ambientState, setAmbientState] = useState<AmbientState>({ title: '', subtitle: '', durationMinutes: 30,
    remainingSeconds: 1800, isPlaying: false, isPaused: false, isLoading: false, mode: 'single', status: 'idle' })
  const audio = useRef<HTMLAudioElement | null>(null)
  const handlers = useRef<AmbientHandlers | null>(null)
  const generation = useRef(0)
  const download = useRef<AbortController | null>(null)
  const onLocate = useRef<((record: OccurrenceRecord) => void) | null>(null)
  const release = useCallback(() => {
    const element = audio.current
    if (!element) return
    element.onplaying = element.onwaiting = element.onstalled = element.onpause = element.onended = element.onerror = null
    element.onloadedmetadata = element.ontimeupdate = null
    element.pause()
    if (element.src.startsWith('blob:')) URL.revokeObjectURL(element.src)
    element.removeAttribute('src'); element.load(); audio.current = null
  }, [])
  const playTrack = useCallback(async (track: ActiveTrack, retry = true) => {
    const sequence = ++generation.current
    download.current?.abort(); download.current = new AbortController()
    const signal = download.current.signal
    release(); handlers.current?.pause()
    source.current = 'occurrence'; setActiveSource('occurrence'); setCurrentTrack(track)
    setStatus('preparing'); setErrorMessage(''); setCacheResult('none'); setIsVisible(true)
    setCurrentTime(0); setDuration(0)
    try {
      const resolved = await resolveAudioForPlayback(track.sourceUrl, '/api/audio-proxy', signal, { mediaId: track.mediaId, retry })
      if (sequence !== generation.current || signal.aborted) {
        if (resolved.url.startsWith('blob:')) URL.revokeObjectURL(resolved.url)
        return
      }
      setCacheResult(resolved.cacheHit ? 'hit' : 'stored'); setStatus('buffering')
      const element = new Audio(resolved.url); audio.current = element
      const current = () => sequence === generation.current && source.current === 'occurrence'
      element.onloadedmetadata = () => { if (current()) setDuration(Number.isFinite(element.duration) ? element.duration : 0) }
      element.ontimeupdate = () => { if (current()) setCurrentTime(element.currentTime) }
      element.onplaying = () => { if (current()) { setStatus('playing'); setErrorMessage('') } }
      element.onwaiting = element.onstalled = () => { if (current() && !element.paused) setStatus('buffering') }
      element.onpause = () => { if (current() && !element.ended) setStatus('paused') }
      element.onended = () => { if (current()) setStatus('ended') }
      element.onerror = () => {
        if (!current()) return
        setStatus('failed')
        setErrorMessage(element.error?.code === 4 || element.error?.code === 3 ? 'media.unsupportedAudio' : 'media.networkError')
      }
      await element.play()
      if (current()) setStatus('playing')
    } catch (reason) {
      if (sequence !== generation.current || signal.aborted) return
      setStatus('failed'); setCacheResult('failed'); setErrorMessage(audioErrorMessage(reason))
    }
  }, [release])

  const togglePlay = useCallback(() => {
    if (activeSource === 'ambient') { handlers.current?.togglePlayback(); return }
    if (!currentTrack || status === 'preparing') return
    if ((status === 'failed' && errorMessage !== 'media.autoplayBlocked') || !audio.current) { void playTrack(currentTrack, true); return }
    const element = audio.current, sequence = generation.current
    if (status === 'playing' || status === 'buffering') { element.pause(); setStatus('paused'); return }
    if (status === 'ended') element.currentTime = 0
    setStatus('buffering'); setErrorMessage('')
    void element.play().then(() => { if (sequence === generation.current) setStatus('playing') })
      .catch(reason => { if (sequence === generation.current) { setStatus('failed'); setErrorMessage(audioErrorMessage(reason)) } })
  }, [activeSource, currentTrack, status, errorMessage, playTrack])
  const seek = useCallback((seconds: number) => {
    if (audio.current && Number.isFinite(seconds)) { audio.current.currentTime = seconds; setCurrentTime(seconds) }
  }, [])
  const close = useCallback(() => {
    generation.current++; download.current?.abort()
    if (source.current === 'ambient') handlers.current?.stop()
    release(); setStatus('idle'); setErrorMessage(''); setIsVisible(false)
    source.current = 'none'; setActiveSource('none')
  }, [release])
  const registerAmbientHandlers = useCallback((next: AmbientHandlers) => { handlers.current = next }, [])
  const updateAmbientState = useCallback((partial: Partial<AmbientState>) => {
    if (partial.isLoading || (partial.isPlaying && !partial.isPaused) || partial.status === 'failed') {
      if (source.current !== 'ambient') {
        generation.current++; download.current?.abort(); release(); setStatus('idle')
      }
      source.current = 'ambient'; setActiveSource('ambient'); setIsVisible(true)
    } else if (partial.isPlaying === false && !partial.isPaused && !partial.isLoading && source.current === 'ambient') {
      source.current = 'none'; setActiveSource('none'); setIsVisible(false)
    }
    setAmbientState(prev => ({ ...prev, ...partial }))
  }, [release])
  const setOnLocateTrack = useCallback((cb: (record: OccurrenceRecord) => void) => { onLocate.current = cb }, [])
  useEffect(() => () => { generation.current++; download.current?.abort(); release() }, [release])
  const effectiveStatus = activeSource === 'ambient' ? ambientState.status || (ambientState.isLoading ? 'preparing' : ambientState.isPaused ? 'paused' : ambientState.isPlaying ? 'playing' : 'idle') : status
  const progressPercent = activeSource === 'ambient'
    ? Math.min(100, Math.max(0, ((ambientState.durationMinutes * 60 - ambientState.remainingSeconds) / (ambientState.durationMinutes * 60)) * 100))
    : duration > 0 ? currentTime / duration * 100 : 0
  return <AudioContext.Provider value={{ activeSource, currentTrack, status: effectiveStatus,
    isPlaying: effectiveStatus === 'playing', isLoading: effectiveStatus === 'preparing' || effectiveStatus === 'buffering',
    isEnded: effectiveStatus === 'ended', currentTime, duration, progressPercent, isVisible, ambientState, cacheResult,
    errorMessage: activeSource === 'ambient' ? ambientState.errorMessage || '' : errorMessage,
    playTrack, togglePlay, seek, close, registerAmbientHandlers, updateAmbientState,
    onLocateTrack: record => onLocate.current?.(record), setOnLocateTrack }}>{children}</AudioContext.Provider>
}
export function useAudioPlayer() {
  const value = useContext(AudioContext)
  if (!value) throw new Error('useAudioPlayer must be used within an AudioProvider')
  return value
}
