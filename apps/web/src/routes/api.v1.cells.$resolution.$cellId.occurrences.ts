import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/cells/$resolution/$cellId/occurrences')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleCellOccurrencesRequest } = await import('../server/occurrence.server.js')
        return handleCellOccurrencesRequest(request, params.resolution, params.cellId)
      },
    },
  },
})
