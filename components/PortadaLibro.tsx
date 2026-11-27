'use client'

import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface PortadaLibroProps {
  src?: string | null
  alt: string
  isbn?: string
  className?: string
  compacto?: boolean
  onImagenRota?: () => void
}

const CACHE_KEY = 'exlibris_portadas_cache_v1'
const memoriaCache = new Map<string, string>()
const isbnsActualizadosEnDb = new Set<string>()
let colaFetch: Promise<void> = Promise.resolve()

function leerCacheLocal(isbn: string): string | null {
  if (memoriaCache.has(isbn)) return memoriaCache.get(isbn) || null
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, string>
    if (parsed[isbn]) {
      memoriaCache.set(isbn, parsed[isbn])
      return parsed[isbn]
    }
  } catch {
    // Ignorar errores de almacenamiento
  }
  return null
}

function guardarCacheLocal(isbn: string, url: string) {
  memoriaCache.set(isbn, url)
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    parsed[isbn] = url
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(parsed))
  } catch {
    // Ignorar errores de cuota
  }
}

function limpiarUrl(url?: string | null): string {
  if (!url) return ''
  return url.trim().replace(/^http:\/\//i, 'https://').replace('&edge=curl', '')
}

function buscarEnGoogleBooksEnCola(isbn: string): Promise<string | null> {
  const cached = leerCacheLocal(isbn)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve) => {
    colaFetch = colaFetch
      .then(async () => {
        const recheck = leerCacheLocal(isbn)
        if (recheck) {
          resolve(recheck)
          return
        }

        try {
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY
          const endpoint = apiKey
            ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&key=${apiKey}`
            : `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`

          const res = await fetch(endpoint)
          if (res.ok) {
            const data = await res.json()
            const thumb =
              data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
              data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail
            if (thumb) {
              const urlLimpia = limpiarUrl(thumb)
              guardarCacheLocal(isbn, urlLimpia)
              resolve(urlLimpia)
              await new Promise((r) => setTimeout(r, 150))
              return
            }
          }
        } catch {
          // Fallo de red o límite de cuota
        }

        await new Promise((r) => setTimeout(r, 150))
        resolve(null)
      })
      .catch(() => resolve(null))
  })
}

export default function PortadaLibro({
  src,
  alt,
  isbn,
  className = 'w-full h-full object-cover',
  compacto = false,
  onImagenRota,
}: PortadaLibroProps) {
  const [urlActiva, setUrlActiva] = useState<string>(() => {
    if (isbn) {
      const cached = leerCacheLocal(isbn)
      if (cached) return cached
    }
    return limpiarUrl(src)
  })
  const [intentadoFallback, setIntentadoFallback] = useState(false)
  const [errorFinal, setErrorFinal] = useState(false)

  useEffect(() => {
    const inicial = (isbn && leerCacheLocal(isbn)) || limpiarUrl(src)
    setUrlActiva(inicial)
    setIntentadoFallback(false)
    setErrorFinal(false)
  }, [src, isbn])

  const persistirEnCatalogo = async (isbnLibro: string, nuevaUrl: string) => {
    if (isbnsActualizadosEnDb.has(isbnLibro)) return
    isbnsActualizadosEnDb.add(isbnLibro)
    try {
      const supabase = createClient()
      await supabase
        .from('libros_catalogo')
        .update({ portada_url: nuevaUrl })
        .eq('isbn', isbnLibro)
    } catch {
      // Si RLS bloquea el update en libros_catalogo, ya queda cacheado en localStorage
    }
  }

  const manejarError = async () => {
    if (!intentadoFallback && isbn) {
      setIntentadoFallback(true)
      const urlRecuperada = await buscarEnGoogleBooksEnCola(isbn)
      if (urlRecuperada && urlRecuperada !== urlActiva) {
        setUrlActiva(urlRecuperada)
        persistirEnCatalogo(isbn, urlRecuperada)
        return
      }
    }

    setErrorFinal(true)
    if (onImagenRota) onImagenRota()
  }

  const manejarCarga = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    // Open Library devuelve un GIF transparente de 1x1 cuando no tiene portada
    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
      manejarError()
      return
    }
    if (isbn && urlActiva && urlActiva !== limpiarUrl(src)) {
      guardarCacheLocal(isbn, urlActiva)
    }
  }

  if (!urlActiva || errorFinal) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-stone-100 to-stone-200/80 flex flex-col items-center justify-center text-stone-400 p-3 text-center select-none">
        <BookOpen className={compacto ? 'w-4 h-4 text-stone-400' : 'w-6 h-6 text-stone-400 mb-1.5'} />
        {!compacto && (
          <span className="text-[11px] font-medium text-stone-500 line-clamp-3 leading-tight">
            {alt}
          </span>
        )}
      </div>
    )
  }

  return (
    <img
      src={urlActiva}
      alt={alt}
      className={className}
      loading="lazy"
      onLoad={manejarCarga}
      onError={manejarError}
    />
  )
}