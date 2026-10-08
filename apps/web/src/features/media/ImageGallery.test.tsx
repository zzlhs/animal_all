// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageGallery } from './ImageGallery.js'
afterEach(cleanup)
describe('photo gallery', () => {
  it('opens a selected thumbnail, navigates with the keyboard and restores hover on close', () => {
    const start = vi.fn(), end = vi.fn()
    render(<ImageGallery scientificName="Bird" language="en" images={[{id:'1',kind:'image',url:'https://example.com/a.jpg'},{id:'2',kind:'image',url:'https://example.com/b.jpg'}]} onInteractionStart={start} onInteractionEnd={end} />)
    const thumbnails = document.querySelectorAll('.image-gallery__thumbs button')
    fireEvent.click(thumbnails[1])
    expect(document.querySelector('.image-lightbox img')?.getAttribute('src')).toBe('https://example.com/b.jpg')
    expect(screen.getByRole('dialog').parentElement).toBe(document.body)
    expect(start).toHaveBeenCalled()
    fireEvent.keyDown(document, {key:'ArrowRight'})
    expect(document.querySelector('.image-lightbox img')?.getAttribute('src')).toBe('https://example.com/a.jpg')
    fireEvent.keyDown(document, {key:'Escape'})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(end).toHaveBeenCalled()
  })
  it('renders a placeholder for an observation without a photograph', () => {
    render(<ImageGallery images={[]} scientificName="Bird" />)
    expect(document.querySelector('.image-gallery__placeholder')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
