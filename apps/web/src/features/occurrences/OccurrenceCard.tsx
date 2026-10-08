import React, { useMemo } from 'react'
import { AudioLines, CalendarDays, Database, ExternalLink, MapPin, Ruler, Video } from 'lucide-react'
import type { OccurrenceRecord, OccurrenceMediaItem } from '@gbif-globe/contracts'
import { translate, translateBasis } from '../../i18n/i18n.js'
import { formatEventDate, formatLocation } from './formatting.js'
import { ImageGallery } from '../media/ImageGallery.js'
import { AudioTrackButton } from '../media/AudioTrackButton.js'

export interface OccurrenceCardProps {
  record: OccurrenceRecord
  position: { left: number; top: number }
  language?: string
  onHoverStart?: () => void
  onHoverEnd?: () => void
}

export const OccurrenceCard: React.FC<OccurrenceCardProps> = ({
  record,
  position,
  language = 'en',
  onHoverStart,
  onHoverEnd,
}) => {
  const gbifId = record.gbifId || (record as unknown as { gbifID?: string }).gbifID || ''
  const lat = record.decimalLatitude ?? (record as unknown as { latitude?: number }).latitude ?? 0
  const lng = record.decimalLongitude ?? (record as unknown as { longitude?: number }).longitude ?? 0

  const media = useMemo(() => {
    return Array.isArray(record.media) ? record.media : []
  }, [record.media])

  const imageMedia = useMemo(() => media.filter((item) => item.kind === 'image'), [media])
  const audioMedia = useMemo(() => media.filter((item) => item.kind === 'audio'), [media])
  const videoMedia = useMemo(() => media.filter((item) => item.kind === 'video'), [media])

  const location = useMemo(() => formatLocation(record, language), [record, language])
  const date = useMemo(() => {
    return formatEventDate(record.eventDate, language) || translate(language, 'card.dateUnavailable')
  }, [record.eventDate, language])

  const coordinates = useMemo(() => {
    return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`
  }, [lat, lng])

  const basis = useMemo(() => translateBasis(language, record.basisOfRecord), [language, record.basisOfRecord])
  const uncertainty = useMemo(() => {
    return record.coordinateUncertaintyInMeters
      ? translate(language, 'card.uncertainty', { value: record.coordinateUncertaintyInMeters })
      : translate(language, 'card.coordinateUnavailable')
  }, [language, record.coordinateUncertaintyInMeters])

  const taxonClass = `taxon-${record.class?.toLowerCase() || 'other'}`

  return (
    <article
      className="occurrence-card"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div className={`occurrence-card__hero ${taxonClass}`}>
        <ImageGallery
          images={imageMedia}
          scientificName={record.scientificName}
          language={language}
          onInteractionStart={onHoverStart}
          onInteractionEnd={onHoverEnd}
        />
      </div>

      <div className="occurrence-card__body">
        <a
          href={`https://www.gbif.org/occurrence/${gbifId}`}
          target="_blank"
          rel="noreferrer"
          aria-label={translate(language, 'card.openInGbif')}
        >
          <h3>{record.scientificName}</h3>
          <ExternalLink size={14} />
        </a>

        {record.vernacularName ? (
          <p className="occurrence-card__vernacular">{record.vernacularName}</p>
        ) : null}

        <p className="occurrence-card__summary">
          {location} <span>·</span> {date}
        </p>

        <div className="occurrence-card__fact">
          <Database size={15} />
          <span>{basis}</span>
        </div>
        <div className="occurrence-card__fact">
          <MapPin size={15} />
          <span>{coordinates}</span>
        </div>
        <div className="occurrence-card__fact">
          <Ruler size={15} />
          <span>{uncertainty}</span>
        </div>
        <div className="occurrence-card__fact occurrence-card__id">
          <CalendarDays size={15} />
          <span>GBIF {gbifId}</span>
        </div>

        {(audioMedia.length > 0 || videoMedia.length > 0) && (
          <div className="occurrence-card__media">
            {audioMedia.map((item) => (
              <div key={item.id} className="occurrence-card__media-block">
                <div className="occurrence-card__media-label">
                  <span>
                    <AudioLines size={14} /> {translate(language, 'media.audio')}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={translate(language, 'media.openSource')}
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
                <AudioTrackButton
                  sourceUrl={item.url}
                  record={record}
                  mediaItem={item}
                  thumbnail={imageMedia[0]?.thumbnailUrl || imageMedia[0]?.url}
                  language={language}
                />
              </div>
            ))}

            {videoMedia.map((item) => (
              <div key={item.id} className="occurrence-card__media-block">
                <div className="occurrence-card__media-label">
                  <span>
                    <Video size={14} /> {translate(language, 'media.video')}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={translate(language, 'media.openSource')}
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
                <video
                  className="occurrence-card__video"
                  controls
                  playsInline
                  preload="metadata"
                  src={item.url}
                  aria-label={translate(language, 'media.playVideo')}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
