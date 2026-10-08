import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/cells/$resolution/$cellId/species')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleCellSpeciesRequest } = await import('../server/occurrence.server.js')
        return handleCellSpeciesRequest(request, params.resolution, params.cellId)
      },
    },
  },
})
