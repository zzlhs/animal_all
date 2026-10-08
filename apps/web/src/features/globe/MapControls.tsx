import React from 'react'
import { Focus, House, Languages, Minus, Monitor, Plus, SlidersVertical, Waves } from 'lucide-react'
import { translate } from '../../i18n/i18n.js'

interface MapControlsProps {
  filterOpen: boolean
  ambientSoundActive: boolean
  theme: string
  language: string
  onHome: () => void
  onToggleFilter: () => void
  onToggleTheme: () => void
  onToggleLanguage: () => void
  onToggleAmbientSound: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetBearing: () => void
}

export function MapControls({
  filterOpen,
  ambientSoundActive,
  theme,
  language,
  onHome,
  onToggleFilter,
  onToggleTheme,
  onToggleLanguage,
  onToggleAmbientSound,
  onZoomIn,
  onZoomOut,
  onResetBearing,
}: MapControlsProps) {
  const label = (key: string) => translate(language, key)

  return (
    <>
      <div className="control-top-left">
        <button
          className="glass-control"
          type="button"
          aria-label={label('controls.home')}
          onClick={onHome}
        >
          <House size={20} />
        </button>
      </div>

      <div className="control-top-right">
        <button
          className={`glass-control ${filterOpen ? 'active' : ''}`}
          type="button"
          aria-label={label('controls.filter')}
          onClick={onToggleFilter}
        >
          <SlidersVertical size={20} />
        </button>
        <button
          className="glass-control"
          type="button"
          aria-label={label(theme === 'dark' ? 'controls.useLight' : 'controls.useDark')}
          onClick={onToggleTheme}
        >
          <Monitor size={20} />
        </button>
        <button
          className="glass-control control-language"
          type="button"
          aria-label={label(language === 'zh' ? 'controls.switchToEnglish' : 'controls.switchToChinese')}
          onClick={onToggleLanguage}
        >
          <Languages size={18} />
          <span aria-hidden="true">{language === 'zh' ? 'EN' : '中'}</span>
        </button>
        <button
          className={`glass-control ${ambientSoundActive ? 'active' : ''}`}
          type="button"
          aria-label={label('controls.ambientSound')}
          onClick={onToggleAmbientSound}
        >
          <Waves size={20} />
        </button>
      </div>

      <div className="control-zoom">
        <button type="button" aria-label={label('controls.zoomIn')} onClick={onZoomIn}>
          <Plus size={21} />
        </button>
        <button type="button" aria-label={label('controls.zoomOut')} onClick={onZoomOut}>
          <Minus size={21} />
        </button>
        <button type="button" aria-label={label('controls.bearing')} onClick={onResetBearing}>
          <Focus size={20} />
        </button>
      </div>
    </>
  )
}
