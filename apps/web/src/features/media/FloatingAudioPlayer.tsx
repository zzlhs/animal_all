import React from 'react'
import {
  AudioLines,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Waves,
  X,
} from 'lucide-react'
import { useAudioPlayer } from './AudioContext.js'
import { translate, formatLocation } from '../../i18n/i18n.js'

interface FloatingAudioPlayerProps {
  language?: string
  onOpenAmbientSettings?: () => void
  onLocateTrack?: (record: any) => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export function FloatingAudioPlayer({
  language = 'en',
  onOpenAmbientSettings,
  onLocateTrack,
}: FloatingAudioPlayerProps) {
  const {
    activeSource,
    status,
    currentTrack,
    isPlaying,
    isLoading,
    isEnded,
    currentTime,
    duration,
    progressPercent,
    isVisible,
    errorMessage,
    ambientState,
    togglePlay,
    seek,
    close,
  } = useAudioPlayer()

  if (!isVisible || (!currentTrack && activeSource !== 'ambient')) {
    return null
  }

  const isAmbient = activeSource === 'ambient'

  // Title calculation
  const title = isAmbient
    ? ambientState.title || translate(language, 'floatingPlayer.ambientTitle')
    : currentTrack?.vernacularName || currentTrack?.scientificName || 'Audio Recording'

  // Subtitle calculation (prioritizing location to prevent duplicate GBIF ID)
  let subtitle = ''
  if (isAmbient) {
    subtitle = ambientState.subtitle
  } else if (currentTrack) {
    if (currentTrack.vernacularName && currentTrack.scientificName) {
      subtitle = currentTrack.scientificName
    } else if (currentTrack.record) {
      const loc = formatLocation(currentTrack.record, language)
      if (loc && loc !== '位置未知' && loc !== 'Location unavailable') {
        subtitle = loc
      }
    }
    if (!subtitle && currentTrack.gbifID) {
      subtitle = `GBIF ${currentTrack.gbifID}`
    }
  }

  const badgeText = translate(language, `media.status.${status}`)

  const displayCurrentTime = isAmbient
    ? formatTime(Math.max(0, ambientState.durationMinutes * 60 - ambientState.remainingSeconds))
    : formatTime(currentTime)

  const displayDuration = isAmbient
    ? formatTime(ambientState.durationMinutes * 60)
    : formatTime(duration)

  const actionLabel = status === 'failed'
    ? translate(language, 'media.retry')
    : isLoading
    ? translate(language, `media.status.${status}`)
    : isEnded
      ? translate(language, 'floatingPlayer.replay')
      : isPlaying
        ? translate(language, 'floatingPlayer.pause')
        : translate(language, 'floatingPlayer.play')

  const handleTitleClick = () => {
    if (!isAmbient && currentTrack?.record) {
      onLocateTrack?.(currentTrack.record)
    }
  }

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAmbient) return
    const val = Number(e.target.value)
    if (Number.isFinite(val)) {
      seek(val)
    }
  }

  return (
    <aside
      className={`floating-audio-player ${isAmbient ? 'is-ambient' : ''}`}
      role="region"
      aria-label={badgeText}
    >
      {errorMessage && <p role="alert">{translate(language, errorMessage)}</p>}
      <div className="floating-audio-player__header">
        <div className={`floating-audio-player__cover-wrap ${isPlaying ? 'is-playing' : ''} ${isAmbient ? 'is-ambient' : ''}`}>
          {!isAmbient && currentTrack?.thumbnail ? (
            <img className="floating-audio-player__cover" src={currentTrack.thumbnail} alt={title} />
          ) : isAmbient ? (
            <div className="floating-audio-player__cover-placeholder is-ambient">
              <Waves size={19} />
            </div>
          ) : (
            <div className="floating-audio-player__cover-placeholder">
              <AudioLines size={18} />
            </div>
          )}
        </div>

        <div className="floating-audio-player__meta">
          <div className="floating-audio-player__badge-row">
            <span className={`floating-audio-player__badge ${isAmbient ? 'is-ambient' : ''}`}>
              <span className={`floating-audio-player__badge-dot ${isPlaying ? 'is-playing' : ''} ${isAmbient ? 'is-ambient' : ''}`} />
              {badgeText}
            </span>

            <div className={`floating-audio-player__equalizer ${isPlaying ? 'is-playing' : ''} ${isAmbient ? 'is-ambient' : ''}`}>
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
              <span className="bar bar-4" />
            </div>
          </div>

          <strong
            className={`floating-audio-player__title ${!isAmbient && currentTrack?.record ? 'is-clickable' : ''}`}
            title={title}
            onClick={handleTitleClick}
          >
            {title}
          </strong>
          {subtitle && (
            <small className="floating-audio-player__subtitle" title={subtitle}>
              {subtitle}
            </small>
          )}
        </div>

        <button
          className="floating-audio-player__close"
          type="button"
          aria-label={translate(language, 'floatingPlayer.close')}
          onClick={close}
        >
          <X size={15} />
        </button>
      </div>

      <div className="floating-audio-player__scrubber-row">
        <span className="floating-audio-player__time">{displayCurrentTime}</span>
        <div className="floating-audio-player__progress-container">
          {!isAmbient && (
            <input
              type="range"
              className="floating-audio-player__range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              value={currentTime}
              disabled={isLoading || duration <= 0}
              aria-label={translate(language, 'floatingPlayer.progress')}
              onChange={handleRangeChange}
            />
          )}
          <div
            className={`floating-audio-player__progress-fill ${isAmbient ? 'is-ambient' : ''}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="floating-audio-player__time">{displayDuration}</span>
      </div>

      <div className="floating-audio-player__footer">
        <div className="floating-audio-player__footer-left">
          {isAmbient ? (
            <button
              className="floating-audio-player__settings-btn floating-audio-player__pill-btn is-ambient"
              type="button"
              title={translate(language, 'floatingPlayer.openSettings')}
              onClick={onOpenAmbientSettings}
            >
              <SlidersHorizontal size={12} />
              <span>{translate(language, 'floatingPlayer.openSettings')}</span>
            </button>
          ) : (
            <>
              {currentTrack?.record && (
                <button
                  className="floating-audio-player__locate-btn floating-audio-player__pill-btn is-occurrence"
                  type="button"
                  title={translate(language, 'floatingPlayer.locateTooltip')}
                  onClick={() => onLocateTrack?.(currentTrack.record)}
                >
                  <MapPin size={12} />
                  <span>{translate(language, 'floatingPlayer.locate')}</span>
                </button>
              )}
              {currentTrack?.gbifID && (
                <a
                  className="floating-audio-player__gbif-link"
                  href={`https://www.gbif.org/occurrence/${currentTrack.gbifID}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`GBIF: ${currentTrack.gbifID}`}
                >
                  <span>GBIF</span>
                  <ExternalLink size={10} />
                </a>
              )}
            </>
          )}
        </div>

        <button
          className={`floating-audio-player__play-btn ${isPlaying ? 'is-playing' : ''} ${isLoading ? 'is-loading' : ''} ${isAmbient ? 'is-ambient' : ''}`}
          type="button"
          disabled={isLoading}
          aria-label={actionLabel}
          onClick={togglePlay}
        >
          {isLoading ? (
            <LoaderCircle size={16} className="spin" />
          ) : isEnded ? (
            <RotateCcw size={16} />
          ) : isPlaying ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </button>
      </div>
    </aside>
  )
}
