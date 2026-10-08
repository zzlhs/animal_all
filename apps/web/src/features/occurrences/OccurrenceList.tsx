import React from 'react'
import { List } from 'lucide-react'
import type { OccurrenceRecord } from '@gbif-globe/contracts'
import { translate } from '../../i18n/i18n.js'
import { OccurrenceListItem } from './OccurrenceListItem.js'

export interface OccurrenceListProps {
  records: OccurrenceRecord[]
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  position: { left: number; top: number }
  language?: string
  onHoverStart?: () => void
  onHoverEnd?: () => void
  onSelect: (record: OccurrenceRecord) => void
  onLoadMore: () => void
}

export const OccurrenceList: React.FC<OccurrenceListProps> = ({
  records,
  total = 0,
  hasMore = false,
  loadingMore = false,
  position,
  language = 'en',
  onHoverStart,
  onHoverEnd,
  onSelect,
  onLoadMore,
}) => {
  const displayCount = total || records.length

  return (
    <aside
      className="occurrence-list"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      aria-label={translate(language, 'list.aria')}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <header className="occurrence-list__header">
        <div>
          <div className="occurrence-list__kicker">
            <List size={13} /> {translate(language, 'list.kicker')}
          </div>
          <h2>{translate(language, 'list.title', { count: displayCount })}</h2>
          <p>{translate(language, 'list.hint')}</p>
        </div>
      </header>

      <div className="occurrence-list__items">
        {records.map((record) => {
          const gbifId = record.gbifId || (record as unknown as { gbifID?: string }).gbifID || String(Math.random())
          return (
            <OccurrenceListItem
              key={gbifId}
              record={record}
              language={language}
              onSelect={onSelect}
            />
          )
        })}
      </div>

      <footer className="occurrence-list__footer">
        {hasMore && (
          <button type="button" disabled={loadingMore} onClick={onLoadMore}>
            {translate(language, loadingMore ? 'list.loading' : 'list.loadMore')}
          </button>
        )}
        <span>
          {translate(language, 'list.footer', {
            loaded: records.length,
            count: displayCount,
          })}
        </span>
      </footer>
    </aside>
  )
}
