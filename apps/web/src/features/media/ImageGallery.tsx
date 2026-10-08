import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, X } from 'lucide-react'
import { translate } from '../../i18n/i18n.js'
import type { OccurrenceMediaItem } from '@gbif-globe/contracts'
import { imageDisplayUrl } from '@gbif-globe/media'
import { OptimizedImage } from './OptimizedImage.js'
interface ImageGalleryProps {
  images: OccurrenceMediaItem[]; scientificName: string; language?: string
  onInteractionStart?: () => void; onInteractionEnd?: () => void
}
export function ImageGallery({ images, scientificName, language = 'en', onInteractionStart, onInteractionEnd }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const t = (key: string, values = {}) => translate(language, key, values)
  const move = (offset: number) => setActiveIndex(index => (index + offset + images.length) % images.length)
  useEffect(() => { setOpen(false); setActiveIndex(0) }, [scientificName])
  useEffect(() => {
    if (!open) return
    onInteractionStart?.()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); onInteractionEnd?.() }
  }, [open, images.length])
  const image = images[activeIndex]
  const show = (index: number) => { setActiveIndex(index); setOpen(true) }
  return <div className="image-gallery">
    {images.length ? <button type="button" className="image-gallery__hero" aria-label={t('media.openGallery')} onClick={() => show(0)}>
      <OptimizedImage src={imageDisplayUrl(images[0], 'preview')} alt={images[0].title || scientificName} />
      {images.length > 1 && <span className="occurrence-card__media-count"><ImageIcon size={12} />{t('media.imageCount', { count: images.length })}</span>}
    </button> : <div className="image-gallery__placeholder"><ImageIcon size={34} /></div>}
    {images.length > 1 && <div className="image-gallery__thumbs" aria-label={t('media.galleryThumbs')}>{images.map((item, index) =>
      <button type="button" key={item.id} className={index === activeIndex ? 'is-active' : ''} aria-label={t('media.openImage', { index: index + 1 })} onClick={() => show(index)}><OptimizedImage src={imageDisplayUrl(item, 'pin')} alt={item.title || scientificName} loading="lazy" /></button>)}</div>}
    {open && image && createPortal(<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={t('media.galleryDialog')} onMouseEnter={onInteractionStart} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <button type="button" className="image-lightbox__close" aria-label={t('media.closeGallery')} onClick={() => setOpen(false)}><X size={22} /></button>
      {images.length > 1 && <button type="button" className="image-lightbox__nav image-lightbox__nav--previous" aria-label={t('media.previousImage')} onClick={() => move(-1)}><ChevronLeft size={28} /></button>}
      <figure><OptimizedImage src={image.url} alt={image.title || scientificName} /><figcaption><span>{activeIndex + 1} / {images.length}{image.title && ` · ${image.title}`}</span>
        <a href={image.sourceUrl || image.referencesUrl || image.url} target="_blank" rel="noreferrer">{t('media.openOriginal')}<ExternalLink size={14} /></a></figcaption></figure>
      {images.length > 1 && <button type="button" className="image-lightbox__nav image-lightbox__nav--next" aria-label={t('media.nextImage')} onClick={() => move(1)}><ChevronRight size={28} /></button>}
    </div>, document.body)}
  </div>
}
