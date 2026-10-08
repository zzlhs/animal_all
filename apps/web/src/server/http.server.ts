import { ZodError } from 'zod'
import { DomainError } from '@gbif-globe/domain'
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}
export function errorResponse(error: unknown) {
  const requestId = crypto.randomUUID()
  if (error instanceof DomainError) return json({ error: error.message, code: error.code, requestId }, error.status)
  if (error instanceof ZodError || (error instanceof Error && error.message.startsWith('Invalid cursor:'))) {
    return json({ error: 'Invalid request parameters or cursor', code: 'BAD_REQUEST', requestId }, 400)
  }
  console.error('Request failed', { requestId, error })
  return json({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId }, 500)
}
