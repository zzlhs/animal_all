import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import AmbientSoundPanel from './AmbientSoundPanel.vue'

const wrappers = []
const tracks = [
  { id: 'one', sourceUrl: 'https://example.test/one.mp3', displayName: 'Bird one', scientificName: 'Bird one', speciesKey: 'one' },
  { id: 'two', sourceUrl: 'https://example.test/two.mp3', displayName: 'Bird two', scientificName: 'Bird two', speciesKey: 'two' },
  { id: 'three', sourceUrl: 'https://example.test/three.mp3', displayName: 'Bird three', scientificName: 'Bird three', speciesKey: 'three' },
]

afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe('AmbientSoundPanel', () => {
  it('offers one-call and mixed-call loop controls', async () => {
    const wrapper = mount(AmbientSoundPanel, { props: { tracks, language: 'en' } })
    wrappers.push(wrapper)

    expect(wrapper.get('h2').text()).toBe('Bird-call ambience')
    expect(wrapper.get('#ambient-single-track').element.value).toBe('one')
    expect(wrapper.get('#ambient-duration').element.value).toBe('30')

    await wrapper.findAll('.ambient-sound-panel__tabs button')[1].trigger('click')
    expect(wrapper.findAll('.ambient-sound-panel__track input')).toHaveLength(3)
    expect(wrapper.get('.ambient-sound-panel__play').text()).toContain('Play ambience')
  })
})
