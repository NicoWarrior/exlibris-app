'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ExternalLink, Newspaper, Quote } from 'lucide-react'

interface CriticaPrensa {
  id: string
  cita_breve: string
  critico: string | null
  medio: string
  url_fuente: string
}

interface CriticasPrensaLibroProps {
  isbn: string
}

export default function CriticasPrensaLibro({ isbn }: CriticasPrensaLibroProps) {
  const supabase = createClient()
  const [criticas, setCriticas] = useState<CriticaPrensa[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    const cargarCriticas = async () => {
      setCargando(true)
      const { data, error } = await supabase
        .from('criticas_prensa')
        .select('id, cita_breve, critico, medio, url_fuente')
        .eq('isbn', isbn)
        .order('created_at', { ascending: true })

      if (activo) {
        if (!error && data) {
          setCriticas(data)
        } else {
          setCriticas([])
        }
        setCargando(false)
      }
    }

    if (isbn) {
      cargarCriticas()
    } else {
      setCargando(false)
    }

    return () => {
      activo = false
    }
  }, [isbn, supabase])

  if (cargando || criticas.length === 0) return null

  return (
    <section className="space-y-2.5 pt-2 border-t border-stone-100">
      <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
        <Newspaper className="w-3.5 h-3.5 text-emerald-700" />
        <span>La crítica dice</span>
      </div>

      <div className="space-y-2">
        {criticas.map((c) => (
          <blockquote
            key={c.id}
            className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <Quote className="w-3.5 h-3.5 text-emerald-700/70 shrink-0 mt-0.5" />
              <p className="text-xs italic text-stone-700 leading-relaxed">
                &ldquo;{c.cita_breve}&rdquo;
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pl-5 text-[11px]">
              <span className="text-stone-500 truncate">
                {c.critico ? (
                  <>
                    <strong className="font-semibold text-stone-700">{c.critico}</strong>
                    {' · '}
                  </>
                ) : null}
                <span className="font-medium text-stone-600">{c.medio}</span>
              </span>

              <a
                href={c.url_fuente}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline shrink-0"
              >
                <span>Leer reseña</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </blockquote>
        ))}
      </div>
    </section>
  )
}