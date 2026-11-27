'use client'

import { useEffect, useRef, useState } from 'react'
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

const CACHE_KEY = 'exlibris_portadas_cache_v2'
const memoriaCache = new Map<string, string>()
const isbnsActualizadosEnDb = new Set<string>()
let colaFetch: Promise<void> = Promise.resolve()

function normalizarIsbn(isbn?: string): string {
  if (!isbn) return ''
  return isbn.replace(/[^0-9X]/gi, '').toUpperCase()
}

function leerCacheLocal(isbn: string): string | null {
  if (isbn.length < 10) return null
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
  if (isbn.length < 10) return
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
  if (isbn.length < 10) return Promise.resolve(null)
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
            // Verificar que el volumen devuelto realmente corresponda al ISBN buscado
            const itemCoincidente = (data.items || []).find((item: any) => {
              const ids = item?.volumeInfo?.industryIdentifiers || []
              return ids.some(
                (idObj: any) => normalizarIsbn(idObj?.identifier) === isbn
              )
            })

            const thumb =
              itemCoincidente?.volumeInfo?.imageLinks?.thumbnail ||
              itemCoincidente?.volumeInfo?.imageLinks?.smallThumbnail

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
  const isbnNorm = normalizarIsbn(isbn)
  const isbnActualRef = useRef<string>(isbnNorm)
  isbnActualRef.current = isbnNorm

  const [urlActiva, setUrlActiva] = useState<string>(() => {
    return leerCacheLocal(isbnNorm) || limpiarUrl(src)
  })
  const [intentadoFallback, setIntentadoFallback] = useState(false)
  const [errorFinal, setErrorFinal] = useState(false)

  useEffect(() => {
    const inicial = leerCacheLocal(isbnNorm) || limpiarUrl(src)
    setUrlActiva(inicial)
    setIntentadoFallback(false)
    setErrorFinal(false)
  }, [src, isbnNorm])

  const persistirEnCatalogo = async (isbnLibro: string, nuevaUrl: string) => {
    if (isbnLibro.length < 10 || isbnsActualizadosEnDb.has(isbnLibro)) return
    isbnsActualizadosEnDb.add(isbnLibro)
    try {
      const supabase = createClient()
      await supabase
        .from('libros_catalogo')
        .update({ portada_url: nuevaUrl })
        .eq('isbn', isbnLibro)
    } catch {
      // Si RLS bloquea el update, queda cacheado en localStorage
    }
  }

  const manejarError = async () => {
    const isbnAlDisparar = isbnNorm
    if (!intentadoFallback && isbnAlDisparar.length >= 10) {
      setIntentadoFallback(true)
      const urlRecuperada = await buscarEnGoogleBooksEnCola(isbnAlDisparar)
      // Descartar si la tarjeta ya cambió a otro libro mientras esperaba
      if (isbnActualRef.current !== isbnAlDisparar) return

      if (urlRecuperada && urlRecuperada !== urlActiva) {
        setUrlActiva(urlRecuperada)
        persistirEnCatalogo(isbnAlDisparar, urlRecuperada)
        return
      }
    }

    if (isbnActualRef.current === isbnAlDisparar) {
      setErrorFinal(true)
      if (onImagenRota) onImagenRota()
    }
  }

  const manejarCarga = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
      manejarError()
      return
    }
    if (isbnNorm.length >= 10 && urlActiva && urlActiva !== limpiarUrl(src)) {
      guardarCacheLocal(isbnNorm, urlActiva)
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