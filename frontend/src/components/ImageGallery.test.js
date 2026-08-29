import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ImageGallery from './ImageGallery.vue'

const wrappers = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('ImageGallery', () => {
  it('opens every image in a keyboard-accessible lightbox', async () => {
    const wrapper = mount(ImageGallery, {
      attachTo: document.body,
      props: {
        scientificName: 'Test species',
        language: 'en',
        images: [
          { id: 'one', url: 'https://example.test/one.jpg', title: 'One' },
          { id: 'two', url: 'https://example.test/two.jpg', title: 'Two' },
        ],
      },
    })
    wrappers.push(wrapper)

    await wrapper.get('.image-gallery__hero').trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.querySelector('.image-lightbox figure img')?.getAttribute('src')).toContain('one.jpg')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.image-lightbox figure img')?.getAttribute('src')).toContain('two.jpg')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
