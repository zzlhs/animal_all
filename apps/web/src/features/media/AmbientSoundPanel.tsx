import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, Clock3, Pause, Play, Square, Volume2, Waves, X } from 'lucide-react'
import { useAudioPlayer } from './AudioContext.js'
import { resolveAudioForPlayback, audioErrorMessage } from './audioCache.js'
import { translate } from '../../i18n/i18n.js'
import type { AmbientTrack } from '@gbif-globe/contracts'

type State = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error'
interface Entry { audio: HTMLAudioElement; url: string; buffering?: boolean }
const EMPTY_TRACKS: AmbientTrack[] = []
const Settings = { DURATIONS: [15, 30, 60, 90], MIN_MIX: 2, MAX_MIX: 4 }
export function AmbientSoundPanel({ tracks = EMPTY_TRACKS, language = 'en', isOpen, loading = false, error, onClose }: {
  tracks?: AmbientTrack[]; language?: string; isOpen: boolean; loading?: boolean; error?: string; onClose: () => void
}) {
  const { registerAmbientHandlers, updateAmbientState } = useAudioPlayer()
  const [mode, setMode] = useState<'single' | 'mix'>('single')
  const [single, setSingle] = useState('')
  const [mix, setMix] = useState<string[]>([])
  const [duration, setDuration] = useState(30)
  const [remaining, setRemaining] = useState(1800)
  const [volume, setVolume] = useState(.62)
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')
  const entries = useRef<Entry[]>([])
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const deadline = useRef(0)
  const selected = tracks.filter(t => mode === 'single' ? t.id === single : mix.includes(t.id))
  const t = (key: string, args = {}) => translate(language, key, args)
  const release = useCallback((items: Entry[]) => items.forEach(({ audio, url }) => {
    audio.onerror = audio.onwaiting = audio.onstalled = audio.onplaying = null; audio.pause(); audio.removeAttribute('src'); audio.load()
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }), [])
  const stop = useCallback(() => {
    generation.current++; controller.current?.abort(); controller.current = null
    release(entries.current); entries.current = []; deadline.current = 0
    setState('idle'); setMessage(''); setRemaining(duration * 60)
    updateAmbientState({ isPlaying: false, isPaused: false, isLoading: false })
  }, [release, duration, updateAmbientState])
  const pause = useCallback(() => {
    if (state === 'loading' || (state === 'buffering' && !entries.current.length)) {
      generation.current++; controller.current?.abort(); release(entries.current); entries.current = []
      setState('idle'); updateAmbientState({ isPlaying: false, isPaused: false, isLoading: false }); return
    }
    if (state !== 'playing' && state !== 'buffering') return
    entries.current.forEach(e => e.audio.pause()); deadline.current = 0; setState('paused')
  }, [state, release, updateAmbientState])
  const start = useCallback(async () => {
    if (!selected.length || (mode === 'mix' && selected.length < Settings.MIN_MIX)) {
      setMessage(mode === 'mix' ? 'ambient.mixMinimum' : 'ambient.selectionError'); return
    }
    const sequence = ++generation.current
    controller.current?.abort(); controller.current = new AbortController()
    const signal = controller.current.signal
    setState('loading'); setMessage('')
    updateAmbientState({ isLoading: true, isPlaying: false, isPaused: false })
    let prepared: Entry[] = []
    try {
      if ((state === 'paused' || (state === 'error' && message === 'media.autoplayBlocked')) && entries.current.length) prepared = entries.current
      else {
        release(entries.current); entries.current = []
        const results = await Promise.allSettled(selected.map(async track => {
          const resolved = await resolveAudioForPlayback(track.sourceUrl, '/api/audio-proxy', signal, { mediaId: track.id, retry: true })
          const audio = new Audio(resolved.url); audio.loop = true; audio.volume = volume / selected.length
          return { audio, url: resolved.url }
        }))
        prepared = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
        if (!prepared.length) throw (results.find(result => result.status === 'rejected') as PromiseRejectedResult)?.reason || new Error('No audio prepared')
      }
      if (sequence !== generation.current) { release(prepared); return }
      if (!prepared.length) throw new Error('No audio prepared')
      setState('buffering')
      const started = await Promise.allSettled(prepared.map(item => item.audio.play()))
      if (sequence !== generation.current) { release(prepared); return }
      const playable = prepared.filter((_, i) => started[i].status === 'fulfilled')
      const blocked = !playable.length && started.every(result => result.status === 'rejected' && (result.reason as Error)?.name === 'NotAllowedError')
      if (!blocked) release(prepared.filter((_, i) => started[i].status === 'rejected'))
      entries.current = blocked ? prepared : playable
      playable.forEach(item => {
        const refresh = () => { if (sequence === generation.current) setState(entries.current.some(entry => entry.buffering) ? 'buffering' : 'playing') }
        item.audio.onwaiting = item.audio.onstalled = () => { if (!item.audio.paused) { item.buffering = true; refresh() } }
        item.audio.onplaying = () => { item.buffering = false; refresh() }
        item.audio.onerror = () => {
        if (sequence !== generation.current) return
        const errorCode = item.audio.error?.code
        release([item]); entries.current = entries.current.filter(entry => entry !== item)
        if (entries.current.length) setMessage('ambient.partialError')
        else { setState('error'); setMessage(errorCode === 4 ? 'media.unsupportedAudio' : 'media.networkError') }
      } })
      if (!playable.length) throw (started.find(result => result.status === 'rejected') as PromiseRejectedResult)?.reason || new Error('Playback failed')
      if (playable.length !== selected.length) setMessage('ambient.partialError')
      deadline.current = Date.now() + (remaining > 0 ? remaining : duration * 60) * 1000
      setState('playing')
    } catch (reason) {
      if (sequence !== generation.current || signal.aborted) return
      if ((reason as Error)?.name !== 'NotAllowedError') { release(prepared); entries.current = [] }
      setState('error'); setMessage(audioErrorMessage(reason))
    }
  }, [selected.map(t => t.id).join(','), state, mode, volume, remaining, duration, message, release])
  const toggle = useCallback(() => { if (state === 'loading') return; if (state === 'playing' || state === 'buffering') pause(); else void start() }, [state, pause, start])
  useEffect(() => { registerAmbientHandlers({ togglePlayback: toggle, stop, pause }) }, [registerAmbientHandlers, toggle, stop, pause])
  useEffect(() => {
    const ids = new Set(tracks.map(t => t.id))
    setSingle(prev => ids.has(prev) ? prev : tracks[0]?.id || '')
    setMix(prev => {
      const valid = prev.filter(id => ids.has(id))
      if (valid.length >= Settings.MIN_MIX) return valid
      const species = new Set<string>()
      return tracks.filter(t => { const key = t.scientificName || t.id; if (species.has(key)) return false; species.add(key); return true }).slice(0, 3).map(t => t.id)
    })
  }, [tracks])
  useEffect(() => {
    if ((state !== 'playing' && state !== 'buffering') || !deadline.current) return
    const timer = setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setRemaining(next)
      if (!next) { stop(); setRemaining(0) }
    }, 1000)
    return () => clearInterval(timer)
  }, [state, stop])
  useEffect(() => { entries.current.forEach(e => { e.audio.volume = volume / Math.max(1, entries.current.length) }) }, [volume])
  useEffect(() => {
    updateAmbientState({ isPlaying: state === 'playing' || state === 'buffering' || state === 'paused', isPaused: state === 'paused', isLoading: state === 'loading',
      status: state === 'loading' ? 'preparing' : state === 'error' ? 'failed' : state,
      errorMessage: state === 'error' ? message : '',
      title: mode === 'single' ? selected[0]?.title || '' : translate(language, 'floatingPlayer.ambientTitle'),
      subtitle: mode === 'single' ? selected[0]?.scientificName || '' : translate(language, 'floatingPlayer.ambientMix', { count: selected.length }),
      mode, durationMinutes: duration, remainingSeconds: remaining })
  }, [state, remaining, duration, mode, single, mix.join(','), language, message, updateAmbientState])
  useEffect(() => () => { generation.current++; controller.current?.abort(); release(entries.current) }, [release])
  if (!isOpen) return null
  const action = state === 'loading' ? 'ambient.loading' : state === 'playing' || state === 'buffering' ? 'ambient.pause' : state === 'paused' ? 'ambient.resume' : state === 'error' ? 'media.retry' : 'ambient.play'
  return <aside className="ambient-sound-panel" role="dialog" aria-label={t('ambient.title')}>
    <header className="ambient-sound-panel__header"><div>
      <span className="ambient-sound-panel__eyebrow"><Waves size={14} /> {t('ambient.eyebrow')}</span>
      <h2>{t('ambient.title')}</h2><p>{t('ambient.subtitle')}</p><a className="audio-queue-link" href="/audio-prewarm">{t('media.queueLink')}</a></div>
      <button className="ambient-sound-panel__close" aria-label={t('ambient.close')} onClick={onClose}><X size={17} /></button>
    </header>
    {loading ? <p role="status" className="ambient-sound-panel__empty">{t('ambient.loading')}</p> : error ? <p role="alert" className="ambient-sound-panel__empty">{error}</p> : !tracks.length ? <p className="ambient-sound-panel__empty">{t('ambient.unavailable')}</p> : <>
      <div className="ambient-sound-panel__tabs" role="tablist" aria-label={t('ambient.mode')}>
        {(['single', 'mix'] as const).map(value => <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => { stop(); setMode(value) }}>{t(`ambient.${value}`)}</button>)}
      </div>
      <section className="ambient-sound-panel__section">
        {mode === 'single' ? <><label className="ambient-sound-panel__field-label" htmlFor="ambient-single-track">{t('ambient.source')}</label>
          <select id="ambient-single-track" value={single} onChange={e => { stop(); setSingle(e.target.value) }}>{tracks.map(track => <option key={track.id} value={track.id}>{track.title} · {track.scientificName}</option>)}</select></>
          : <><div className="ambient-sound-panel__section-heading"><span>{t('ambient.sources')}</span><small>{t('ambient.selectedCount', { count: mix.length })}</small></div>
            <div className="ambient-sound-panel__mix-list">{tracks.map(track => <label className={`ambient-sound-panel__track ${mix.includes(track.id) ? 'is-selected' : ''}`} key={track.id}>
              <input type="checkbox" checked={mix.includes(track.id)} disabled={!mix.includes(track.id) && mix.length >= Settings.MAX_MIX} onChange={() => { if (mix.includes(track.id) && mix.length <= Settings.MIN_MIX) return; stop(); setMix(mix.includes(track.id) ? mix.filter(id => id !== track.id) : [...mix, track.id]) }} />
              <span>{track.title} · {track.scientificName}</span></label>)}</div><p className="ambient-sound-panel__hint">{t('ambient.mixHint')}</p></>}
      </section>
      <section className="ambient-sound-panel__section ambient-sound-panel__settings">
        <label className="ambient-sound-panel__field-label" htmlFor="ambient-duration">{t('ambient.duration')}</label>
        <select id="ambient-duration" value={duration} onChange={e => { stop(); const next = Number(e.target.value); setDuration(next); setRemaining(next * 60) }}>{Settings.DURATIONS.map(minutes => <option key={minutes} value={minutes}>{t('ambient.durationOption', { count: minutes })}</option>)}</select>
        <div className="ambient-sound-panel__volume"><label htmlFor="ambient-volume"><Volume2 size={14} />{t('ambient.volume')}</label><input id="ambient-volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(Number(e.target.value))} /></div>
      </section>
      <div className={`ambient-sound-panel__countdown ${state === 'playing' ? 'is-playing' : ''}`}><Clock3 size={17} /><div><span>{t('ambient.remaining')}</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong></div><small>{t('ambient.loop')}</small></div>
      {message && <p className={`ambient-sound-panel__status ${state === 'error' ? 'is-error' : ''}`} role="status"><CircleAlert size={13} />{t(message, { count: Settings.MIN_MIX })}</p>}
      <div className="ambient-sound-panel__actions"><button className="ambient-sound-panel__play" disabled={state === 'loading' || !selected.length} onClick={toggle}>{state === 'playing' || state === 'buffering' ? <Pause size={16} /> : <Play size={16} />}{t(action)}</button>
        <button className="ambient-sound-panel__stop" aria-label={t('ambient.stop')} onClick={stop}><Square size={15} />{t('ambient.stop')}</button></div>
    </>}
  </aside>
}
