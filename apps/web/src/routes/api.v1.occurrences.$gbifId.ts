import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/occurrences/$gbifId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleOccurrenceRequest } = await import('../server/occurrence.server.js')
        return handleOccurrenceRequest(request, params.gbifId)
      },
    },
  },
})
