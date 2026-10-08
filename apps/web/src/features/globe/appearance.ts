import type { Map as MapInstance } from 'maplibre-gl'

export const GlobeView = {
  CENTER: [105, 25] as [number, number],
  ZOOM: 2.05,
}

// Capture the unmodified style once per style load so dark → light is reversible.
export function capturePaint(map: MapInstance) {
  return new Map(map.getStyle().layers.filter(layer => !layer.id.startsWith('gbif-')).map(layer =>
    [layer.id, structuredClone(layer.paint ?? {})] as [string, Record<string, unknown>]))
}

export function applyAppearance(map: MapInstance, theme: string, language: string, originalPaint: ReturnType<typeof capturePaint>) {
  map.setSky({
    'sky-color': 'transparent',
    'horizon-color': 'transparent',
    'fog-color': theme === 'dark' ? 'rgba(120, 151, 214, .72)' : 'rgba(192, 214, 244, .76)',
    'fog-ground-blend': .48,
    'horizon-fog-blend': .72,
    'sky-horizon-blend': .72,
    'atmosphere-blend': .92,
  })
  // Explicit defaults also reset dark overrides absent from the original style.
  if (theme === 'light') for (const layer of map.getStyle().layers) {
    if (layer.type === 'raster') {
      map.setPaintProperty(layer.id, 'raster-brightness-min', 0)
      map.setPaintProperty(layer.id, 'raster-brightness-max', 1)
      map.setPaintProperty(layer.id, 'raster-saturation', 0)
      map.setPaintProperty(layer.id, 'raster-contrast', 0)
    }
  }

  for (const layer of map.getStyle().layers || []) {
    if (layer.id.startsWith('gbif-')) continue
    if (theme === 'light') {
      for (const [property, value] of Object.entries(originalPaint.get(layer.id) ?? {})) {
        map.setPaintProperty(layer.id, property, value)
      }
    }
    if (theme === 'dark') {
      try {
        if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#05182d')
        if (layer.type === 'raster') {
          map.setPaintProperty(layer.id, 'raster-brightness-min', 0)
          // The low-zoom globe is driven by Natural Earth's raster layer.
          // Retain muted colour, but keep enough luminance for the land mass
          // to read as a physical sphere against the night sky.
          map.setPaintProperty(layer.id, 'raster-brightness-max', .53)
          map.setPaintProperty(layer.id, 'raster-saturation', -.50)
          map.setPaintProperty(layer.id, 'raster-contrast', .09)
        }
        if (layer.type === 'fill') {
          const color = /water/i.test(layer.id)
            ? '#0b2746'
            : /building/i.test(layer.id)
              ? '#3e4c55'
              : /park|wood|forest|grass|landcover/i.test(layer.id)
                ? '#3f5354'
                : '#495963'
          map.setPaintProperty(layer.id, 'fill-color', color)
        }
        if (layer.type === 'line') {
          const color = /boundary/i.test(layer.id)
            ? '#9285a4'
            : /water/i.test(layer.id)
              ? '#456d91'
              : /road|highway|street|path/i.test(layer.id)
                ? '#89929c'
                : '#6f7b85'
          map.setPaintProperty(layer.id, 'line-color', color)
        }
      } catch {}
    }

    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
    if (!/(label|place|country|state|city|town|village|poi|airport)/i.test(layer.id)) continue
    try {
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', `name:${language}`],
        ['get', 'name:en'],
        ['get', 'name:latin'],
        ['get', 'name'],
      ])
      map.setPaintProperty(layer.id, 'text-color', theme === 'dark' ? '#d5d8dc' : '#292524')
      map.setPaintProperty(layer.id, 'text-halo-color', theme === 'dark' ? 'rgba(4, 18, 33, .88)' : 'rgba(255, 255, 255, .74)')
      map.setPaintProperty(layer.id, 'text-halo-width', .9)
    } catch {}
  }

}
