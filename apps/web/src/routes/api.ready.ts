import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api/ready')({
  server: { handlers: { GET: async () => {
    try {
      const { metaService } = await import('../server/db.server.js')
      const meta = await metaService.getMeta()
      return Response.json({ status: 'ready', revision: meta.dataset.revision }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  } } },
})
