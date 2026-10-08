import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/coordinates/$latitude/$longitude/occurrences')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleCoordinateOccurrencesRequest } = await import('../server/occurrence.server.js')
        return handleCoordinateOccurrencesRequest(request, params.latitude, params.longitude)
      },
    },
  },
})
