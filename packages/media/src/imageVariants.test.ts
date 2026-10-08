import { describe, expect, it } from 'vitest'
import { imageDisplayUrl, nativeImageVariant } from './imageVariants.js'
describe('image size selection', () => {
  it('uses the provider small file for pins and medium file for previews', () => {
    const url='https://inaturalist-open-data.s3.amazonaws.com/photos/504340337/original.jpeg'
    expect(nativeImageVariant(url,'pin')).toBe(url.replace('original','small'))
    expect(nativeImageVariant(url,'preview')).toBe(url.replace('original','medium'))
    expect(nativeImageVariant('https://example.com/original.jpeg','pin')).toBe('https://example.com/original.jpeg')
  })
  it('never sends a map marker to the original image when thumbnails are absent', () => {
    const image={id:'123',kind:'image' as const,url:'https://example.com/original.jpeg'}
    expect(imageDisplayUrl(image,'pin')).toBe('/api/media/123/pin?v=v1')
    expect(imageDisplayUrl(image,'preview')).toBe('/api/media/123/preview?v=v1')
  })
})
