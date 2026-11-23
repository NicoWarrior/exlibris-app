'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { extraerPremios, GENEROS_ESTANDAR, normalizarGenero } from '@/utils/generos'
import {
  Award,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'

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
  premios?: string | null
}

interface ClubOpcion {
  id: string
  nombre: string
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
  const [genero, setGenero] = useState(libro?.genero || 'Otros')
  const [premios, setPremios] = useState(libro?.premios || '')
  const [editando, setEditando] = useState(false)
  const [cargandoExtra, setCargandoExtra] = useState(false)
  const [procesando, setProcesando] = useState(false)

  // Gestión de visibilidad en clubes (solo si esPropio)
  const [misClubes, setMisClubes] = useState<ClubOpcion[]>([])
  const [clubesCompartidos, setClubesCompartidos] = useState<string[]>([])
  const [cargandoClubes, setCargandoClubes] = useState(false)
  const [togglingClubId, setTogglingClubId] = useState<string | null>(null)

  useEffect(() => {
    if (!libro) return
    setEstado(libro.estado)
    setSinopsis(libro.sinopsis || '')
    setGenero(libro.genero || 'Otros')
    setPremios(libro.premios || '')
    setEditando(false)

    // 1. Si el libro es propio, cargar los clubes del usuario y en cuáles está compartido este ejemplar
    if (libro.esPropio) {
      const cargarVisibilidadClubes = async () => {
        setCargandoClubes(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: membresias } = await supabase
            .from('miembros_club')
            .select('club_id')
            .eq('usuario_id', user.id)

          if (membresias && membresias.length > 0) {
            const clubIds = membresias.map((m) => m.club_id)
            const [{ data: clubesData }, { data: compartidosData }] = await Promise.all([
              supabase.from('clubes').select('id, nombre').in('id', clubIds),
              supabase
                .from('ejemplares_club')
                .select('club_id')
                .eq('ejemplar_id', libro.ejemplarId),
            ])

            setMisClubes(clubesData || [])
            setClubesCompartidos(compartidosData?.map((c) => c.club_id) || [])
          } else {
            setMisClubes([])
            setClubesCompartidos([])
          }
        }
        setCargandoClubes(false)
      }
      cargarVisibilidadClubes()
    } else {
      setMisClubes([])
      setClubesCompartidos([])
    }

    // 2. Autorelleno desde Google Books para ejemplares sin sinopsis o con género sin normalizar
    const faltaGeneroLimpio =
      !libro.genero || libro.genero === 'Otros' || libro.genero.includes('/')
    if (!libro.sinopsis || faltaGeneroLimpio) {
      const enriquecerCatalogo = async () => {
        setCargandoExtra(true)
        try {
          const res = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${libro.isbn}`
          )
          const data = await res.json()
          const info = data.items?.[0]?.volumeInfo
          if (info) {
            const nuevaSinopsis = libro.sinopsis || info.description || ''
            const nuevoGenero = faltaGeneroLimpio
              ? normalizarGenero(info.categories)
              : (libro.genero as string)
            const nuevosPremios =
              libro.premios || extraerPremios(info.categories, info.description) || ''

            if (
              nuevaSinopsis !== (libro.sinopsis || '') ||
              nuevoGenero !== (libro.genero || 'Otros') ||
              nuevosPremios !== (libro.premios || '')
            ) {
              setSinopsis(nuevaSinopsis)
              setGenero(nuevoGenero)
              setPremios(nuevosPremios)
              await supabase
                .from('libros_catalogo')
                .update({
                  sinopsis: nuevaSinopsis || null,
                  genero: nuevoGenero || 'Otros',
                  premios: nuevosPremios || null,
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

  const alternarClub = async (clubId: string) => {
    if (!libro.esPropio || togglingClubId) return
    setTogglingClubId(clubId)

    const yaCompartido = clubesCompartidos.includes(clubId)

    if (yaCompartido) {
      // Quitar de este club
      setClubesCompartidos((prev) => prev.filter((id) => id !== clubId))
      const { error } = await supabase
        .from('ejemplares_club')
        .delete()
        .eq('ejemplar_id', libro.ejemplarId)
        .eq('club_id', clubId)

      if (error) {
        alert(`No se pudo ocultar del club: ${error.message}`)
        setClubesCompartidos((prev) => [...prev, clubId])
      } else {
        onActualizado()
      }
    } else {
      // Compartir en este club
      setClubesCompartidos((prev) => [...prev, clubId])
      const { error } = await supabase.from('ejemplares_club').insert({
        ejemplar_id: libro.ejemplarId,
        club_id: clubId,
      })

      if (error) {
        alert(`No se pudo compartir en el club: ${error.message}`)
        setClubesCompartidos((prev) => prev.filter((id) => id !== clubId))
      } else {
        onActualizado()
      }
    }

    setTogglingClubId(null)
  }

  const guardarMetadatos = async () => {
    if (!libro.esPropio || procesando) return
    setProcesando(true)

    const { error } = await supabase
      .from('libros_catalogo')
      .update({
        genero: genero || 'Otros',
        premios: premios.trim() || null,
        sinopsis: sinopsis.trim() || null,
      })
      .eq('isbn', libro.isbn)

    setProcesando(false)
    if (error) {
      alert(`Error al guardar cambios: ${error.message}`)
    } else {
      setEditando(false)
      onActualizado()
    }
  }

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
          <div className="flex items-center gap-1">
            {libro.esPropio && !editando && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar ficha</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Cabecera portada + metadatos */}
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

              {premios && !editando && (
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/80">
                    <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{premios}</span>
                  </span>
                </div>
              )}

              <div className="pt-1 flex items-center gap-1.5 text-xs text-stone-500">
                <User className="w-3.5 h-3.5 text-stone-400" />
                <span>
                  Propietario: <strong className="text-stone-700">{libro.propietarioNombre}</strong>
                </span>
              </div>
              <p className="text-[11px] text-stone-400">ISBN: {libro.isbn}</p>
            </div>
          </div>

          {/* Formulario edición o Sinopsis */}
          {editando ? (
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Género</label>
                <select
                  value={genero}
                  onChange={(e) => setGenero(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
                >
                  {GENEROS_ESTANDAR.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Premios literarios (opcional)
                </label>
                <input
                  type="text"
                  value={premios}
                  onChange={(e) => setPremios(e.target.value)}
                  placeholder="Ej. Premio Planeta, Premio Pulitzer..."
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Sinopsis</label>
                <textarea
                  rows={4}
                  value={sinopsis}
                  onChange={(e) => setSinopsis(e.target.value)}
                  placeholder="Escribe o pega aquí la sinopsis del libro..."
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarMetadatos}
                  disabled={procesando}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar ficha</span>
                </button>
              </div>
            </div>
          ) : (
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
          )}

          {/* Visibilidad selectiva por club (solo para el propietario) */}
          {libro.esPropio && !editando && (
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-stone-400" />
                  <span>Visible en mis clubes</span>
                </h3>
                <span className="text-[11px] text-stone-400">
                  {clubesCompartidos.length === 0
                    ? 'Solo en tu estantería'
                    : `${clubesCompartidos.length} ${
                        clubesCompartidos.length === 1 ? 'club' : 'clubes'
                      }`}
                </span>
              </div>

              {cargandoClubes ? (
                <p className="text-xs text-stone-400 italic">Cargando clubes...</p>
              ) : misClubes.length === 0 ? (
                <p className="text-xs text-stone-500">
                  Aún no perteneces a ningún club. Únete o crea uno en la pestaña Clubes.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {misClubes.map((club) => {
                    const activo = clubesCompartidos.includes(club.id)
                    const cargandoEste = togglingClubId === club.id
                    return (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => alternarClub(club.id)}
                        disabled={cargandoEste}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                          activo
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <span className="truncate">{club.nombre}</span>
                        <span className="flex items-center gap-1.5 shrink-0 text-[11px]">
                          {cargandoEste ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
                          ) : activo ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-700" />
                              <span className="font-semibold text-emerald-700">Visible</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                              <span className="text-stone-400">Oculto</span>
                            </>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Controles de disponibilidad y borrado */}
          {libro.esPropio && !editando && (
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