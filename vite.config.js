import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { Readable } from 'node:stream'
import { AudioProxyConstants } from './shared/audioProxy.constants.js'
import { copyAudioResponseHeaders, fetchAllowedAudio } from './shared/audioProxy.js'

function audioProxyPlugin() {
  return {
    name: 'local-audio-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url, 'http://localhost')
        if (requestUrl.pathname !== AudioProxyConstants.ROUTE) return next()

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET, HEAD')
          response.end('Method not allowed')
          return
        }

        try {
          const upstream = await fetchAllowedAudio(requestUrl.searchParams.get('url'), {
            method: request.method,
            range: request.headers.range,
          })
          response.statusCode = upstream.status
          for (const [name, value] of copyAudioResponseHeaders(upstream.headers)) {
            response.setHeader(name, value)
          }

          if (request.method === 'HEAD' || !upstream.body) {
            response.end()
            return
          }
          Readable.fromWeb(upstream.body).pipe(response)
        } catch {
          response.statusCode = 400
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'Audio source is unavailable' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), audioProxyPlugin()],
  publicDir: 'static',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
