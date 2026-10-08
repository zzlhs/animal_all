import React, { useEffect } from 'react'
import { CircleAlert, LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react'
import { useAudioPlayer } from './AudioContext.js'
import { translate } from '../../i18n/i18n.js'
import type { OccurrenceRecord, OccurrenceMediaItem } from '@gbif-globe/contracts'
import { prepareDetailAudio } from './audioCache.js'

interface AudioTrackButtonProps {
  sourceUrl: string
  record?: OccurrenceRecord | null
  mediaItem?: OccurrenceMediaItem | null
  thumbnail?: string
  language?: string
}

export function AudioTrackButton({
  sourceUrl,
  record,
  mediaItem,
  thumbnail = '',
  language = 'en',
}: AudioTrackButtonProps) {
  const { currentTrack, activeSource, status, isPlaying, isLoading, cacheResult, errorMessage, playTrack, togglePlay } = useAudioPlayer()
  useEffect(() => {
    if (!mediaItem?.id) return
    const controller = new AbortController()
    void prepareDetailAudio([mediaItem.id], controller.signal).catch(() => {})
    return () => controller.abort()
  }, [mediaItem?.id])

  const isCurrentTrack = activeSource === 'occurrence' && currentTrack?.sourceUrl === sourceUrl
  const trackPlaying = isCurrentTrack && isPlaying
  const trackLoading = isCurrentTrack && isLoading

  const actionLabel = trackLoading
    ? translate(language, `media.status.${status}`)
    : isCurrentTrack && errorMessage
      ? translate(language, 'media.retry')
    : trackPlaying
      ? translate(language, 'floatingPlayer.pause')
      : translate(language, 'media.cacheAndPlay')

  const statusLabel = isCurrentTrack
    ? errorMessage ? translate(language, errorMessage) : trackLoading
      ? translate(language, `media.status.${status}`)
      : cacheResult === 'hit'
        ? translate(language, 'media.cacheHit')
        : cacheResult === 'stored'
          ? translate(language, 'media.cacheStored')
          : cacheResult === 'failed'
            ? translate(language, 'media.cacheStoreFailed')
            : ''
    : ''

  const handleClick = () => {
    if (trackLoading) return
    if (isCurrentTrack && (!errorMessage || errorMessage === 'media.autoplayBlocked')) {
      togglePlay()
      return
    }

    playTrack({
      id: `${record?.gbifId || ''}-${mediaItem?.id || sourceUrl}`,
      mediaId: mediaItem?.id,
      sourceUrl,
      scientificName: record?.scientificName || '',
      vernacularName: record?.vernacularName || '',
      thumbnail: thumbnail || '',
      gbifID: record?.gbifId || '',
      record: record || undefined,
    }, true)
  }

  return (
    <div className="cached-audio-player">
      <button
        className={`cached-audio-player__action ${trackLoading ? 'is-loading' : ''} ${trackPlaying ? 'is-playing' : ''}`}
        type="button"
        disabled={trackLoading}
        aria-label={actionLabel}
        onClick={handleClick}
      >
        {trackLoading ? (
          <LoaderCircle size={15} className="spin" />
        ) : trackPlaying ? (
          <>
            <Pause size={15} fill="currentColor" />
            <span className="cached-audio-player__wave" aria-hidden="true">
              <span className="wave-bar bar-1" />
              <span className="wave-bar bar-2" />
              <span className="wave-bar bar-3" />
            </span>
          </>
        ) : (
          <Play size={15} fill="currentColor" />
        )}
        <span>{actionLabel}</span>
      </button>

      {statusLabel && (
        <div
          className={`cached-audio-player__status ${cacheResult === 'failed' ? 'is-error' : ''}`}
          aria-live="polite"
        >
          {cacheResult === 'failed' && <CircleAlert size={12} />}
          <span>{statusLabel}</span>
        </div>
      )}
    </div>
  )
}
