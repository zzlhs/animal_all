import { describe, it, expect } from 'vitest'
import {
  getResolutionForZoom,
  isCoordinateLevelZoom,
  getCanonicalCellCenter,
  isValidCoordinate,
  isPolarCoordinate,
  splitBboxAtAntiMeridian,
  H3ResolutionZoomMap,
} from './index.js'

describe('Geo Package', () => {
  it('maps zoom to H3 resolution correctly', () => {
    expect(getResolutionForZoom(0)).toBe(2)
    expect(getResolutionForZoom(2.5)).toBe(2)
    expect(getResolutionForZoom(4)).toBe(3)
    expect(getResolutionForZoom(6)).toBe(4)
    expect(getResolutionForZoom(8)).toBe(5)
    expect(getResolutionForZoom(10)).toBe(6)
    expect(getResolutionForZoom(12)).toBe(7)
    expect(getResolutionForZoom(14)).toBe(8)
    expect(getResolutionForZoom(16)).toBe(8)
  })

  it('identifies coordinate level zoom', () => {
    expect(isCoordinateLevelZoom(14)).toBe(false)
    expect(isCoordinateLevelZoom(15)).toBe(true)
    expect(isCoordinateLevelZoom(18)).toBe(true)
  })

  it('exposes H3ResolutionZoomMap', () => {
    expect(H3ResolutionZoomMap).toHaveLength(7)
    expect(H3ResolutionZoomMap[0].resolution).toBe(2)
    expect(H3ResolutionZoomMap[6].resolution).toBe(8)
  })

  it('validates coordinates', () => {
    expect(isValidCoordinate(0, 0)).toBe(true)
    expect(isValidCoordinate(-90, -180)).toBe(true)
    expect(isValidCoordinate(90, 180)).toBe(true)
    expect(isValidCoordinate(91, 0)).toBe(false)
    expect(isValidCoordinate(0, 181)).toBe(false)
    expect(isValidCoordinate(NaN, 0)).toBe(false)
  })

  it('identifies polar coordinates', () => {
    expect(isPolarCoordinate(86)).toBe(true)
    expect(isPolarCoordinate(-86)).toBe(true)
    expect(isPolarCoordinate(45)).toBe(false)
  })

  it('handles anti-meridian bbox splitting', () => {
    const normal = splitBboxAtAntiMeridian(10, 20, 30, 40)
    expect(normal).toHaveLength(1)
    expect(normal[0]).toEqual([10, 20, 30, 40])

    const crossing = splitBboxAtAntiMeridian(170, 20, -170, 40)
    expect(crossing).toHaveLength(2)
    expect(crossing[0]).toEqual([170, 20, 180, 40])
    expect(crossing[1]).toEqual([-180, 20, -170, 40])
  })

  it('calculates canonical H3 cell center', () => {
    const cellId = '822d57fffffffff'
    const [lng, lat] = getCanonicalCellCenter(cellId)
    expect(isValidCoordinate(lat, lng)).toBe(true)
  })
})
