import React from 'react'
import { AudioLines, Image as ImageIcon, Video } from 'lucide-react'
import { useAudioPlayer } from '../media/AudioContext.js'
import { translate, formatLocation } from '../../i18n/i18n.js'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { imageDisplayUrl } from '@gbif-globe/media'
import { PinImage } from './PinImage.js'

interface PhotoPinProps {
  record: OccurrenceRecord
  selected?: boolean
  language?: string
  showPhoto?: boolean
  onSelect?: (record: OccurrenceRecord) => void
  onHoverStart?: (record: OccurrenceRecord) => void
  onHoverEnd?: () => void
}

export function PhotoPin({
  record,
  selected = false,
  language = 'en',
  showPhoto = true,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: PhotoPinProps) {
  const { currentTrack, isPlaying, activeSource } = useAudioPlayer()

  const isCurrentPlaying =
    activeSource === 'occurrence' &&
    isPlaying &&
    String(currentTrack?.gbifID) === String(record.gbifId)

  const mediaKinds = new Set(record.media.map(m => m.kind))
  const thumbnailUrl = showPhoto ? imageDisplayUrl(record.media.find(m => m.kind === 'image'), 'pin') : ''
  const location = formatLocation(record, language)
  const taxonClass = record.class?.toLowerCase() || 'other'

  return (
    <div className="photo-pin-container">
      <button
        className={`photo-pin photo-pin--single ${selected ? 'is-selected' : ''} ${isCurrentPlaying ? 'is-playing-audio' : ''}`}
        type="button"
        aria-label={translate(language, 'marker.named', { name: record.scientificName })}
        onMouseEnter={() => onHoverStart?.(record)}
        onMouseLeave={onHoverEnd}
        onClick={e => {
          e.stopPropagation()
          onSelect?.(record)
        }}
      >
        {isCurrentPlaying && (
          <>
            <span className="photo-pin__sound-wave wave-1" />
            <span className="photo-pin__sound-wave wave-2" />
            <span className="photo-pin__sound-wave wave-3" />
            <span className="photo-pin__beacon" aria-hidden="true">
              <span className="beacon-bar bar-1" />
              <span className="beacon-bar bar-2" />
              <span className="beacon-bar bar-3" />
            </span>
          </>
        )}

        <span className="photo-pin__pulse" />
        <span className="photo-pin__ping" />
        <span className={`photo-pin__image taxon-${taxonClass}`}>
          {thumbnailUrl && <PinImage src={thumbnailUrl} alt={record.scientificName} />}
        </span>

        <span className="photo-pin__inner">
          {!thumbnailUrl && mediaKinds.has('audio') ? (
            <AudioLines size={18} />
          ) : !thumbnailUrl && mediaKinds.has('video') ? (
            <Video size={18} />
          ) : (
            !thumbnailUrl && <ImageIcon size={18} />
          )}
        </span>
      </button>

      <div className="pin-tooltip" role="tooltip">
        <strong>{record.vernacularName || record.scientificName}</strong>
        <span>{location}</span>
      </div>
    </div>
  )
}
