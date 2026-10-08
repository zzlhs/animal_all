import { describe, expect, it } from 'vitest'
import { layoutScreenItems, markerBudget } from './markerLayout.js'

const view = { width:1280, height:720, zoom:2.05, project: ([x,y]: [number,number]) => ({x,y}) }
describe('map marker density', () => {
  it('declutters neighboring markers and keeps the selected marker ahead of a larger cluster', () => {
    const items = [
      { id:'large',coordinates:[300,300] as [number,number],count:1000,item:'large' },
      { id:'selected',coordinates:[320,300] as [number,number],count:1,priority:true,item:'selected' },
      { id:'separate',coordinates:[450,300] as [number,number],count:2,item:'separate' },
      { id:'offscreen',coordinates:[-10,300] as [number,number],count:10000,item:'offscreen' },
    ]
    expect(layoutScreenItems(items,view)).toEqual(['selected','separate'])
  })
  it('bounds a dense view by zoom and deduplicates tiles without changing original counts', () => {
    const items = Array.from({length:150},(_,index) => ({id:String(index),coordinates:[50+(index%15)*80,50+Math.floor(index/15)*65] as [number,number],count:150-index,item:index}))
    expect(layoutScreenItems([...items,items[0]],view)).toHaveLength(markerBudget(view.zoom))
    expect(layoutScreenItems(items,{...view,zoom:8}).length).toBeGreaterThan(markerBudget(view.zoom))
    expect(items[0].count).toBe(150)
  })
  it('leaves room for map controls so an audio pin remains clickable on a narrow screen', () => {
    const items = [
      { id: 'covered', coordinates: [36, 36] as [number, number], count: 20, item: 'covered' },
      { id: 'touching', coordinates: [75, 60] as [number, number], count: 10, item: 'touching' },
      { id: 'available', coordinates: [180, 160] as [number, number], count: 1, item: 'available' },
    ]
    expect(layoutScreenItems(items, { ...view, width: 390, blockedAreas: [{ left: 12, top: 12, right: 60, bottom: 60 }] })).toEqual(['available'])
  })
})
