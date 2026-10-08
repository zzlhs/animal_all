import React, { useMemo } from 'react'
import { AudioLines, ChevronRight, Image as ImageIcon, Video } from 'lucide-react'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { imageDisplayUrl } from '@gbif-globe/media'
import { OptimizedImage } from '../media/OptimizedImage.js'
import { translate } from '../../i18n/i18n.js'
import { formatEventDate, formatLocation } from './formatting.js'

export interface OccurrenceListItemProps {
  record: OccurrenceRecord
  language?: string
  onSelect: (record: OccurrenceRecord) => void
}

export const OccurrenceListItem: React.FC<OccurrenceListItemProps> = ({
  record,
  language = 'en',
  onSelect,
}) => {
  const media = useMemo(() => (Array.isArray(record.media) ? record.media : []), [record.media])
  const mediaKinds = useMemo(() => new Set(media.map((m) => m.kind)), [media])
  const thumbnailUrl = useMemo(() => {
    return imageDisplayUrl(media.find((m) => m.kind === 'image'), 'pin')
  }, [media])

  const location = useMemo(() => formatLocation(record, language), [record, language])
  const date = useMemo(() => {
    return formatEventDate(record.eventDate, language) || translate(language, 'card.dateUnavailable')
  }, [record.eventDate, language])

  const taxonClass = `taxon-${record.class?.toLowerCase() || 'other'}`

  return (
    <button
      className="occurrence-list__item"
      type="button"
      aria-label={translate(language, 'list.open', { name: record.scientificName })}
      onClick={() => onSelect(record)}
    >
      <span className={`occurrence-list__thumb ${taxonClass}`}>
        {thumbnailUrl ? (
          <OptimizedImage src={thumbnailUrl} alt={record.scientificName} loading="lazy" />
        ) : (
          <ImageIcon size={19} />
        )}
      </span>
      <span className="occurrence-list__copy">
        <strong>{record.scientificName}</strong>
        <small>{location}</small>
        <small>{date}</small>
        {mediaKinds.size > 0 && (
          <span className="occurrence-list__media-badges" aria-hidden="true">
            {mediaKinds.has('image') && <ImageIcon size={11} />}
            {mediaKinds.has('audio') && <AudioLines size={11} />}
            {mediaKinds.has('video') && <Video size={11} />}
          </span>
        )}
      </span>
      <ChevronRight className="occurrence-list__chevron" size={16} />
    </button>
  )
}
