import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/ambient-tracks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleAmbientTracksRequest } = await import('../server/ambient.server.js')
        return handleAmbientTracksRequest(request)
      },
    },
  },
})
