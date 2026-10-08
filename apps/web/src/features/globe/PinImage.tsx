import React, { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { markGlobeReady } from './performance.js'
export function PinImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <ImageIcon size={18} className="photo-pin__image-fallback" />
  return <>
    <img className="photo-pin__image-blur" src={src} alt="" aria-hidden="true" decoding="async" loading="lazy" onError={() => setFailed(true)} />
    <img className="photo-pin__image-main" src={src} alt={alt} decoding="async" loading="lazy" onError={() => setFailed(true)} onLoad={() => markGlobeReady('gbif-first-photo')} />
  </>
}
