import React, { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'

export function OptimizedImage({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed || !src) return <span className="media-image-placeholder" role="img" aria-label={alt}><ImageIcon size={20} /></span>
  return <img {...props} src={src} alt={alt} decoding="async" onError={() => setFailed(true)} />
}
