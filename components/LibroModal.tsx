'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { extraerPremios, GENEROS_ESTANDAR, normalizarGenero } from '@/utils/generos'
import {
  Award,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Star,
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
  clubId?: string | null
  clubNombre?: string | null
}

interface ClubOpcion {
  id: string
  nombre: string
}

interface ResenaItem {
  id: string
  usuario_id: string
  autor_nombre: string
  puntuacion: number
  comentario: string
  creado_en: string
  es_mia: boolean
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

  // Reseñas por club (solo cuando se abre desde un club con clubId)
  const [resenas, setResenas] = useState<ResenaItem[]>([])
  const [cargandoResenas, setCargandoResenas] = useState(false)
  const [miPuntuacion, setMiPuntuacion] = useState<number>(5)
  const [miComentario, setMiComentario] = useState<string>('')
  const [editandoResena, setEditandoResena] = useState(false)
  const [guardandoResena, setGuardandoResena] = useState(false)

  const cargarResenasDelClub = useCallback(
    async (isbn: string, clubId: string) => {
      setCargandoResenas(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data: resenasData } = await supabase
        .from('resenas_libro')
        .select('id, usuario_id, puntuacion, comentario, creado_en')
        .eq('isbn', isbn)
        .eq('club_id', clubId)
        .order('creado_en', { ascending: false })

      if (!resenasData || resenasData.length === 0) {
        setResenas([])
        setMiPuntuacion(5)
        setMiComentario('')
        setEditandoResena(true)
        setCargandoResenas(false)
        return
      }

      const userIds = Array.from(new Set(resenasData.map((r) => r.usuario_id)))
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('id, nombre, nombre_usuario')
        .in('id', userIds)

      const formateadas: ResenaItem[] = resenasData.map((r) => {
        const perfil = perfilesData?.find((p) => p.id === r.usuario_id)
        const esMia = user?.id === r.usuario_id
        return {
          id: r.id,
          usuario_id: r.usuario_id,
          autor_nombre: esMia
            ? 'Tú'
            : perfil?.nombre || perfil?.nombre_usuario || `Lector #${r.usuario_id.slice(0, 4)}`,
          puntuacion: r.puntuacion,
          comentario: r.comentario,
          creado_en: r.creado_en,
          es_mia: esMia,
        }
      })

      setResenas(formateadas)

      const mia = formateadas.find((r) => r.es_mia)
      if (mia) {
        setMiPuntuacion(mia.puntuacion)
        setMiComentario(mia.comentario)
        setEditandoResena(false)
      } else {
        setMiPuntuacion(5)
        setMiComentario('')
        setEditandoResena(true)
      }

      setCargandoResenas(false)
    },
    [supabase]
  )

  useEffect(() => {
    if (!libro) return
    setEstado(libro.estado)
    setSinopsis(libro.sinopsis || '')
    setGenero(libro.genero || 'Otros')
    setPremios(libro.premios || '')
    setEditando(false)

    // 1. Cargar reseñas si viene desde un club
    if (libro.clubId) {
      cargarResenasDelClub(libro.isbn, libro.clubId)
    } else {
      setResenas([])
    }

    // 2. Si el libro es propio, cargar los clubes del usuario y visibilidad
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

    // 3. Autorelleno desde Google Books para ejemplares sin sinopsis o con género sin normalizar
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
  }, [libro, supabase, onActualizado, cargarResenasDelClub])

  if (!libro) return null

  const guardarResena = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!libro.clubId || !miComentario.trim() || guardandoResena) return
    setGuardandoResena(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setGuardandoResena(false)
      return
    }

    const { error } = await supabase.from('resenas_libro').upsert(
      {
        isbn: libro.isbn,
        club_id: libro.clubId,
        usuario_id: user.id,
        puntuacion: miPuntuacion,
        comentario: miComentario.trim(),
      },
      { onConflict: 'isbn,club_id,usuario_id' }
    )

    setGuardandoResena(false)
    if (error) {
      alert(`No se pudo publicar la reseña: ${error.message}`)
    } else {
      await cargarResenasDelClub(libro.isbn, libro.clubId)
    }
  }

  const eliminarMiResena = async (resenaId: string) => {
    if (!libro.clubId || guardandoResena) return
    setGuardandoResena(true)

    const { error } = await supabase.from('resenas_libro').delete().eq('id', resenaId)
    setGuardandoResena(false)

    if (error) {
      alert(`No se pudo eliminar la reseña: ${error.message}`)
    } else {
      await cargarResenasDelClub(libro.isbn, libro.clubId)
    }
  }

  const alternarClub = async (clubId: string) => {
    if (!libro.esPropio || togglingClubId) return
    setTogglingClubId(clubId)

    const yaCompartido = clubesCompartidos.includes(clubId)

    if (yaCompartido) {
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

  const mediaEstrellas =
    resenas.length > 0
      ? (resenas.reduce((acc, r) => acc + r.puntuacion, 0) / resenas.length).toFixed(1)
      : null

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

          {/* Reseñas de los miembros del club (cuando se abre desde un club) */}
          {libro.clubId && !editando && (
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                  <span>
                    Reseñas en {libro.clubNombre || 'el club'}
                  </span>
                </h3>
                {mediaEstrellas && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    {mediaEstrellas} ({resenas.length})
                  </span>
                )}
              </div>

              {/* Formulario para publicar o editar mi reseña */}
              {editandoResena ? (
                <form
                  onSubmit={guardarResena}
                  className="bg-white p-3 rounded-xl border border-stone-200 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-stone-700">
                      Tu valoración:
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((estrella) => (
                        <button
                          key={estrella}
                          type="button"
                          onClick={() => setMiPuntuacion(estrella)}
                          className="p-0.5 cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 transition ${
                              estrella <= miPuntuacion
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-stone-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    maxLength={600}
                    value={miComentario}
                    onChange={(e) => setMiComentario(e.target.value)}
                    placeholder="¿Qué te pareció este libro? Comparte tu opinión con el club..."
                    className="w-full px-2.5 py-2 border border-stone-200 rounded-lg text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600"
                    required
                  />

                  <div className="flex justify-end gap-2">
                    {resenas.some((r) => r.es_mia) && (
                      <button
                        type="button"
                        onClick={() => setEditandoResena(false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-stone-500 hover:bg-stone-100 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={guardandoResena || !miComentario.trim()}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {guardandoResena ? 'Publicando...' : 'Publicar reseña'}
                    </button>
                  </div>
                </form>
              ) : null}

              {/* Listado de reseñas del club */}
              {cargandoResenas ? (
                <p className="text-xs text-stone-400 italic">Cargando reseñas...</p>
              ) : resenas.length === 0 ? (
                <p className="text-[11px] text-stone-400">
                  Nadie del club ha reseñado este libro todavía. ¡Sé el primero!
                </p>
              ) : (
                <div className="space-y-2.5">
                  {resenas.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white p-3 rounded-xl border border-stone-200/80 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-800">
                            {r.autor_nombre}
                          </span>
                          <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className={`w-3 h-3 ${
                                  n <= r.puntuacion
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-stone-200'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {r.es_mia && !editandoResena && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditandoResena(true)}
                              className="text-[11px] text-stone-500 hover:text-stone-800 px-1.5 py-0.5 rounded hover:bg-stone-100 cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => eliminarMiResena(r.id)}
                              className="text-[11px] text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer"
                            >
                              Borrar
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                        {r.comentario}
                      </p>
                    </div>
                  ))}
                </div>
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