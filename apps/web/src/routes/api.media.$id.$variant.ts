import { createFileRoute } from '@tanstack/react-router'
import { handleImageRequest } from '../server/images.server.js'
export const Route = createFileRoute('/api/media/$id/$variant')({ server: { handlers: {
  GET: ({ request, params }) => handleImageRequest(request, params.id, params.variant),
  HEAD: ({ request, params }) => handleImageRequest(request, params.id, params.variant),
} } })
