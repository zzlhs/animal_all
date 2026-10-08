export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

export function normalizeLongitude(lon: number): number {
  let normalized = lon % 360
  if (normalized > 180) normalized -= 360
  if (normalized < -180) normalized += 360
  return normalized
}

export function isPolarCoordinate(latitude: number): boolean {
  return Math.abs(latitude) > 85.0511
}

export function formatCoordinates(latitude: number, longitude: number, precision = 4): string {
  const latDir = latitude >= 0 ? 'N' : 'S'
  const lonDir = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(precision)}°${latDir}, ${Math.abs(longitude).toFixed(precision)}°${lonDir}`
}

export function splitBboxAtAntiMeridian(
  west: number,
  south: number,
  east: number,
  north: number,
): Array<[west: number, south: number, east: number, north: number]> {
  if (west <= east) {
    return [[west, south, east, north]]
  }
  // Crosses anti-meridian (+180/-180)
  return [
    [west, south, 180, north],
    [-180, south, east, north],
  ]
}
