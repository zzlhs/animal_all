export function markGlobeReady(name: string) {
  if (typeof window !== 'undefined' && !performance.getEntriesByName(name).length) performance.mark(name)
}
