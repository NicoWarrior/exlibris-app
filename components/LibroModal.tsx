'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { BookOpen, RefreshCw, Tag, Trash2, User, X } from 'lucide-react'

export interface LibroDetalle {
  ejemplarId: string
  estado: string
  propietarioNombre: string
  esPropio: boolean
  isbn: string
  titulo: string
  autor: string
  portada_url: string
  genero?: string | null
  sinopsis?: string | null
}

interface LibroModalProps {
  libro: LibroDetalle | null
  onClose: () => void
  onActualizado: () => void
}

export default function LibroModal({ libro, onClose, onActualizado }: LibroModalProps) {
  const supabase = createClient()
  const [estado, setEstado] = useState(libro?.estado || 'disponible')
  const [sinopsis, setSinopsis] = useState(libro?.sinopsis || '')
  const [genero, setGenero] = useState(libro?.genero || '')
  const [cargandoExtra, setCargandoExtra] = useState(false)
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (!libro) return
    setEstado(libro.estado)
    setSinopsis(libro.sinopsis || '')
    setGenero(libro.genero || '')

    if (!libro.sinopsis || !libro.genero) {
      const enriquecerCatalogo = async () => {
        setCargandoExtra(true)
        try {
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${libro.isbn}`)
          const data = await res.json()
          const info = data.items?.[0]?.volumeInfo
          if (info) {
            const nuevaSinopsis = libro.sinopsis || info.description || ''
            const nuevoGenero =
              libro.genero ||
              (Array.isArray(info.categories) && info.categories.length > 0 ? info.categories[0] : '')

            if (nuevaSinopsis || nuevoGenero) {
              setSinopsis(nuevaSinopsis)
              setGenero(nuevoGenero)
              await supabase
                .from('libros_catalogo')
                .update({
                  sinopsis: nuevaSinopsis || null,
                  genero: nuevoGenero || null,
                })
                .eq('isbn', libro.isbn)
              onActualizado()
            }
          }
        } catch {
          // Ignorar fallo de red secundario
        } finally {
          setCargandoExtra(false)
        }
      }
      enriquecerCatalogo()
    }
  }, [libro, supabase, onActualizado])

  if (!libro) return null

  const alternarDisponibilidad = async () => {
    if (!libro.esPropio || estado === 'prestado' || procesando) return
    const nuevoEstado = estado === 'disponible' ? 'no_disponible' : 'disponible'
    setProcesando(true)
    setEstado(nuevoEstado)

    const { error } = await supabase
      .from('ejemplares')
      .update({ estado: nuevoEstado })
      .eq('id', libro.ejemplarId)

    setProcesando(false)
    if (error) {
      alert(`Error al actualizar estado: ${error.message}`)
      setEstado(libro.estado)
    } else {
      onActualizado()
    }
  }

  const eliminarEjemplar = async () => {
    if (!libro.esPropio || estado === 'prestado' || procesando) return
    if (!confirm(`¿Eliminar "${libro.titulo}" de tu estantería?`)) return

    setProcesando(true)
    const { error } = await supabase.from('ejemplares').delete().eq('id', libro.ejemplarId)
    setProcesando(false)

    if (error) {
      alert(`No se pudo eliminar: ${error.message}`)
    } else {
      onActualizado()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur-xs border-b border-stone-100 px-5 py-3.5 flex items-center justify-between z-10">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Ficha del libro
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-4">
            <div className="w-24 sm:w-28 aspect-[2/3] bg-stone-100 rounded-xl overflow-hidden shrink-0 border border-stone-200 shadow-xs">
              {libro.portada_url ? (
                <img
                  src={libro.portada_url}
                  alt={libro.titulo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs p-2 text-center">
                  <BookOpen className="w-6 h-6" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">
                {libro.titulo}
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 font-medium">{libro.autor}</p>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    estado === 'disponible'
                      ? 'bg-emerald-100 text-emerald-800'
                      : estado === 'prestado'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {estado === 'disponible'
                    ? 'Disponible'
                    : estado === 'prestado'
                    ? 'Prestado'
                    : 'No disponible'}
                </span>

                {genero && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                    <Tag className="w-3 h-3" />
                    {genero}
                  </span>
                )}
              </div>

              <div className="pt-1 flex items-center gap-1.5 text-xs text-stone-500">
                <User className="w-3.5 h-3.5 text-stone-400" />
                <span>
                  Propietario: <strong className="text-stone-700">{libro.propietarioNombre}</strong>
                </span>
              </div>
              <p className="text-[11px] text-stone-400">ISBN: {libro.isbn}</p>
            </div>
          </div>

          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
              Sinopsis
            </h3>
            {cargandoExtra ? (
              <p className="text-xs text-stone-400 italic">Buscando sinopsis oficial...</p>
            ) : sinopsis ? (
              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                {sinopsis}
              </p>
            ) : (
              <p className="text-xs text-stone-400 italic">
                No hay sinopsis oficial disponible para este ISBN.
              </p>
            )}
          </div>

          {libro.esPropio && (
            <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={alternarDisponibilidad}
                disabled={estado === 'prestado' || procesando}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  estado === 'disponible'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : estado === 'prestado'
                    ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                    : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>
                  {estado === 'disponible'
                    ? 'Marcar como No disponible'
                    : estado === 'prestado'
                    ? 'Actualmente prestado'
                    : 'Marcar como Disponible'}
                </span>
              </button>

              {estado !== 'prestado' && (
                <button
                  type="button"
                  onClick={eliminarEjemplar}
                  disabled={procesando}
                  className="py-2.5 px-4 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}