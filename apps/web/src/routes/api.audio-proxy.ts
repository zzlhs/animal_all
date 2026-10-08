import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/audio-proxy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleAudioProxyRequest } = await import('../server/audioProxy.server.js')
        return handleAudioProxyRequest(request)
      },
      HEAD: async ({ request }) => {
        const { handleAudioProxyRequest } = await import('../server/audioProxy.server.js')
        return handleAudioProxyRequest(request)
      },
    },
  },
})
