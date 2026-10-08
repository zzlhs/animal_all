import React from 'react'
import { Bird, Bug, Check, Globe2, Volume2, X } from 'lucide-react'
import { translate } from '../../i18n/i18n.js'
import type { FilterType } from '@gbif-globe/contracts'

interface FilterPanelProps {
  activeFilter: FilterType
  visibleCount?: number
  language?: string
  filterCounts?: Record<string, number>
  onSelect: (filter: FilterType) => void
  onClose?: () => void
}

export function FilterPanel({
  activeFilter,
  visibleCount,
  language = 'en',
  filterCounts = {},
  onSelect,
  onClose,
}: FilterPanelProps) {
  const t = (key: string) => translate(language, key)

  const filterOptions: { id: FilterType; labelKey: string; subKey: string; icon: React.ReactNode }[] = [
    {
      id: 'all',
      labelKey: 'filters.all',
      subKey: 'filters.allSubtitle',
      icon: <Globe2 size={18} />,
    },
    {
      id: 'Aves',
      labelKey: 'filters.birds',
      subKey: 'filters.birdsSubtitle',
      icon: <Bird size={18} />,
    },
    {
      id: 'Insecta',
      labelKey: 'filters.insects',
      subKey: 'filters.insectsSubtitle',
      icon: <Bug size={18} />,
    },
    {
      id: 'audio',
      labelKey: 'filters.audio',
      subKey: 'filters.audioSubtitle',
      icon: <Volume2 size={18} />,
    },
  ]

  return (
    <aside className="filter-panel" role="region" aria-label={t('filters.title')}>
      <div className="filter-panel__header">
        <div>
          <h2 className="filter-panel__title">{t('filters.title')}</h2>
          <p>{t('filters.subtitle')}</p>
        </div>
        {onClose && (
          <button className="filter-panel__close" aria-label={language === 'zh' ? '关闭筛选' : 'Close filters'} type="button" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="filter-panel__options">
        {filterOptions.map(opt => {
          const isSelected = activeFilter === opt.id
          const count = filterCounts[opt.id] ?? (opt.id === activeFilter ? visibleCount : undefined)

          return (
            <button
              key={opt.id}
              className={`filter-panel__option ${isSelected ? 'active' : ''}`}
              type="button"
              onClick={() => onSelect(opt.id)}
            >
              <div className="filter-panel__icon">{opt.icon}</div>
              <div className="filter-panel__text">
                <strong>{t(opt.labelKey)}</strong>
                <small>{t(opt.subKey)}</small>
              </div>
              {count !== undefined && (
                <span className="filter-panel__badge">{count.toLocaleString()}</span>
              )}
              {isSelected && <Check size={16} className="filter-panel__check" />}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
