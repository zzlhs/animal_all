import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sites } from '@openai/sites-vite-plugin'
import { Readable } from 'node:stream'
import { AudioProxyConstants } from './shared/audioProxy.constants.js'
import { copyAudioResponseHeaders, fetchAllowedAudio } from './shared/audioProxy.js'

function audioProxyPlugin() {
  function installMiddleware(server) {
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
  }

  return {
    name: 'local-audio-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  }
}

function socialPreviewPlugin(publicSiteUrl) {
  return {
    name: 'social-preview-metadata',
    transformIndexHtml() {
      if (!publicSiteUrl) return []
      const imageUrl = `${publicSiteUrl}/og.png`
      return [
        { tag: 'meta', attrs: { property: 'og:image', content: imageUrl }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:image', content: imageUrl }, injectTo: 'head' },
      ]
    },
  }
}

function normalizedPublicSiteUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.href.replace(/\/$/, '')
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  const publicSiteUrl = normalizedPublicSiteUrl(environment.VITE_PUBLIC_SITE_URL)
  return {
    plugins: [sites(), vue(), audioProxyPlugin(), socialPreviewPlugin(publicSiteUrl)],
    publicDir: 'static',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.js', 'shared/**/*.test.js', 'worker/**/*.test.js'],
      restoreMocks: true,
    },
  }
})
