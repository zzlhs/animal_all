import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/meta')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleMetaRequest } = await import('../server/meta.server.js')
        return handleMetaRequest(request)
      },
    },
  },
})
