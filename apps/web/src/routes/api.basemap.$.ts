import { createFileRoute } from '@tanstack/react-router'
import { handleBasemapRequest } from '../server/basemap.server.js'
export const Route = createFileRoute('/api/basemap/$')({ server: { handlers: {
  GET: ({ request, params }) => handleBasemapRequest(request, params._splat || ''),
  HEAD: ({ request, params }) => handleBasemapRequest(request, params._splat || ''),
} } })
