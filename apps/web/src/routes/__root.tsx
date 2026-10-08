import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { AudioProvider } from '../features/media/AudioContext.js'
import '../styles/styles.css'
import 'maplibre-gl/dist/maplibre-gl.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
      { title: 'GBIF Globe - Biodiversity Explorer' },
      { name: 'description', content: 'Explore global biodiversity with interactive 3D globe, photos, soundscapes and animal calls.' },
      { name: 'theme-color', content: '#0d131f' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <AudioProvider>
        <div className="app app-root">
          <Outlet />
        </div>
      </AudioProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
