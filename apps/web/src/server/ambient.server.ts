import { z } from 'zod'
import { errorResponse } from './http.server.js'
import { ambientTrackService } from './db.server.js'

export async function handleAmbientTracksRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const language = url.searchParams.get('lang') || 'zh'
    const tracks = await ambientTrackService.getAmbientTracks(language, z.string().uuid().optional().parse(url.searchParams.get('revision') || undefined))

    return new Response(JSON.stringify(tracks), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
