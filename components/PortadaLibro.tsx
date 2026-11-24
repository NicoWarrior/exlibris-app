'use client'

import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'

interface PortadaLibroProps {
  src?: string | null
  alt: string
  isbn?: string
  className?: string
  compacto?: boolean
  onImagenRota?: () => void
}

export default function PortadaLibro({
  src,
  alt,
  isbn,
  className = 'w-full h-full object-cover',
  compacto = false,
  onImagenRota,
}: PortadaLibroProps) {
  const [urlActiva, setUrlActiva] = useState<string>(src || '')
  const [intentadoFallback, setIntentadoFallback] = useState(false)
  const [errorFinal, setErrorFinal] = useState(false)

  useEffect(() => {
    setUrlActiva(src || '')
    setIntentadoFallback(false)
    setErrorFinal(false)
  }, [src])

  const manejarError = async () => {
    if (!intentadoFallback && isbn) {
      setIntentadoFallback(true)
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
        )
        if (res.ok) {
          const data = await res.json()
          const thumb =
            data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
            data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail
          if (thumb) {
            const urlLimpia = thumb.replace('http://', 'https://').replace('&edge=curl', '')
            if (urlLimpia !== urlActiva) {
              setUrlActiva(urlLimpia)
              return
            }
          }
        }
      } catch {
        // Mostrar tarjeta limpia si también falla Google Books
      }
    }

    setErrorFinal(true)
    if (onImagenRota) onImagenRota()
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
      onError={manejarError}
    />
  )
}