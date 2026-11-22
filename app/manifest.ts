import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Exlibris - Biblioteca Compartida',
    short_name: 'Exlibris',
    description: 'Catálogo personal, escáner ISBN y clubes de lectura.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#047857',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}