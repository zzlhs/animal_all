import React from 'react'
import { useAudioPlayer } from '../media/AudioContext.js'
import { translate } from '../../i18n/i18n.js'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { AudioLines } from 'lucide-react'
import { imageDisplayUrl } from '@gbif-globe/media'
import { PinImage } from './PinImage.js'

export interface ClusterData {
  coordinates: [number, number]
  records: OccurrenceRecord[]
  total?: number
  nextCursor?: string | null
}

interface ClusterPinProps {
  cluster: ClusterData
  language?: string
  currentTrackInCluster?: boolean
  showPhoto?: boolean
  audioOnly?: boolean
  onExpand?: (cluster: ClusterData) => void
  onHoverStart?: (cluster: ClusterData) => void
  onHoverEnd?: () => void
}

export function ClusterPin({
  cluster,
  language = 'en',
  currentTrackInCluster = false,
  showPhoto = true,
  audioOnly = false,
  onExpand,
  onHoverStart,
  onHoverEnd,
}: ClusterPinProps) {
  const { currentTrack, isPlaying, activeSource } = useAudioPlayer()

  const isCurrentPlaying =
    activeSource === 'occurrence' &&
    isPlaying &&
    (currentTrackInCluster || cluster.records.some(r => String(r.gbifId) === String(currentTrack?.gbifID)))

  const representative = cluster.records[0]
  const thumbnailUrl = showPhoto ? imageDisplayUrl(representative?.media.find(m => m.kind === 'image'), 'pin') : ''
  const taxonClass = representative?.class?.toLowerCase() || 'other'
  const count = cluster.total || cluster.records.length

  return (
    <button
      className={`photo-pin photo-pin--cluster ${isCurrentPlaying ? 'is-playing-audio' : ''}`}
      style={{ width: '50px', height: '50px' }}
      type="button"
      aria-label={translate(language, 'marker.cluster', { count })}
      onMouseEnter={() => onHoverStart?.(cluster)}
      onMouseLeave={onHoverEnd}
      onClick={e => {
        e.stopPropagation()
        onExpand?.(cluster)
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

      <span className={`photo-pin__image taxon-${taxonClass}`}>
        {thumbnailUrl && <PinImage src={thumbnailUrl} alt={representative?.scientificName || ''} />}
      </span>

      <span className="photo-pin__inner">
        {audioOnly && count === 1 ? <AudioLines size={22} /> : <span className="photo-pin__count">{count > 1 ? count : '•'}</span>}
      </span>
    </button>
  )
}
