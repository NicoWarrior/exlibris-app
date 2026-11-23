'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { comprimirImagen } from '@/utils/comprimirImagen'
import { GENEROS_ESTANDAR, normalizarGenero } from '@/utils/generos'
import {
  Award,
  BookOpen,
  Camera,
  Check,
  Loader2,
  MapPin,
  MessageSquare,
  Send,
  Star,
  Tag,
  Trash2,
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

interface ClubItem {
  id: string
  nombre: string
}

interface ResenaItem {
  id: string
  usuario_id: string
  usuario_nombre: string
  puntuacion: number
  comentario: string | null
  creado_en: string
}

interface LibroModalProps {
  libro: LibroDetalle | null
  onClose: () => void
  onActualizado: () => void
}

function extraerPremios(categories?: string[], description?: string): string | null {
  const texto = `${(categories || []).join(' ')} ${description || ''}`
  const patrones = [
    /Premio\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{2,30}/,
    /Pulitzer\s*(?:Prize)?/i,
    /Booker\s*(?:Prize)?/i,
    /Premio\s+Planeta/i,
    /Premio\s+Nadal/i,
    /Premio\s+Cervantes/i,
    /Premio\s+Alfaguara/i,
    /Premio\s+Herralde/i,
    /Premio\s+Nacional\s+de\s+Narrativa/i,
  ]
  for (const regex of patrones) {
    const match = texto.match(regex)
    if (match) return match[0].trim()
  }
  return null
}

export default function LibroModal({ libro, onClose, onActualizado }: LibroModalProps) {
  const supabase = createClient()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [estado, setEstado] = useState(libro?.estado || 'disponible')
  const [genero, setGenero] = useState(libro?.genero || 'Otros')
  const [sinopsis, setSinopsis] = useState(libro?.sinopsis || '')
  const [premios, setPremios] = useState(libro?.premios || '')
  const [portadaActual, setPortadaActual] = useState(libro?.portada_url || '')
  const [subiendoPortada, setSubiendoPortada] = useState(false)
  const [cargandoExtra, setCargandoExtra] = useState(false)

  const [misClubes, setMisClubes] = useState<ClubItem[]>([])
  const [clubesCompartidos, setClubesCompartidos] = useState<string[]>([])
  const [visibleLocal, setVisibleLocal] = useState(false)
  const [codigoPostalUsuario, setCodigoPostalUsuario] = useState<string | null>(null)
  const [guardandoVisibilidad, setGuardandoVisibilidad] = useState(false)

  const [resenas, setResenas] = useState<ResenaItem[]>([])
  const [cargandoResenas, setCargandoResenas] = useState(false)
  const [miPuntuacion, setMiPuntuacion] = useState<number>(5)
  const [miComentario, setMiComentario] = useState('')
  const [guardandoResena, setGuardandoResena] = useState(false)

  const cargarResenas = useCallback(
    async (isbn: string, clubId?: string | null) => {
      if (!clubId) {
        setResenas([])
        return
      }
      setCargandoResenas(true)

      const { data: resenasData } = await supabase
        .from('resenas_libro')
        .select('id, usuario_id, puntuacion, comentario, creado_en')
        .eq('isbn', isbn)
        .eq('club_id', clubId)
        .order('creado_en', { ascending: false })

      if (!resenasData || resenasData.length === 0) {
        setResenas([])
        setCargandoResenas(false)
        return
      }

      const userIds = Array.from(new Set(resenasData.map((r) => r.usuario_id)))
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('id, nombre, nombre_usuario')
        .in('id', userIds)

      const combinadas: ResenaItem[] = resenasData.map((r) => {
        const perfil = perfilesData?.find((p) => p.id === r.usuario_id)
        return {
          id: r.id,
          usuario_id: r.usuario_id,
          usuario_nombre:
            perfil?.nombre || perfil?.nombre_usuario || `Lector #${r.usuario_id.slice(0, 4)}`,
          puntuacion: r.puntuacion,
          comentario: r.comentario,
          creado_en: r.creado_en,
        }
      })

      setResenas(combinadas)
      setCargandoResenas(false)
    },
    [supabase]
  )

  useEffect(() => {
    if (!libro) return
    setEstado(libro.estado)
    setGenero(libro.genero || 'Otros')
    setSinopsis(libro.sinopsis || '')
    setPremios(libro.premios || '')
    setPortadaActual(libro.portada_url || '')
    setMiPuntuacion(5)
    setMiComentario('')

    const cargarDatosModal = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setCurrentUserId(user.id)

        if (libro.esPropio) {
          const [{ data: membresias }, { data: compartidos }, { data: ejData }, { data: perfilData }] =
            await Promise.all([
              supabase.from('miembros_club').select('club_id').eq('usuario_id', user.id),
              supabase
                .from('ejemplares_club')
                .select('club_id')
                .eq('ejemplar_id', libro.ejemplarId),
              supabase
                .from('ejemplares')
                .select('visible_local')
                .eq('id', libro.ejemplarId)
                .maybeSingle(),
              supabase
                .from('perfiles')
                .select('codigo_postal')
                .eq('id', user.id)
                .maybeSingle(),
            ])

          setVisibleLocal(Boolean(ejData?.visible_local))
          setCodigoPostalUsuario(perfilData?.codigo_postal || null)

          if (membresias && membresias.length > 0) {
            const ids = membresias.map((m) => m.club_id)
            const { data: clubesData } = await supabase
              .from('clubes')
              .select('id, nombre')
              .in('id', ids)
            setMisClubes(clubesData || [])
          } else {
            setMisClubes([])
          }

          setClubesCompartidos(compartidos?.map((c) => c.club_id) || [])
        }
      }

      if (libro.clubId) {
        await cargarResenas(libro.isbn, libro.clubId)
      } else {
        setResenas([])
      }
    }

    cargarDatosModal()

    const faltaGeneroLimpio =
      !libro.genero || libro.genero === 'Otros' || libro.genero.includes('/')
    const faltaPortada = !libro.portada_url

    if (!libro.sinopsis || faltaGeneroLimpio || faltaPortada) {
      const enriquecerCatalogo = async () => {
        setCargandoExtra(true)
        try {
          const res = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${libro.isbn}`
          )
          const data = await res.json()
          const info = data.items?.[0]?.volumeInfo

          const nuevaSinopsis = libro.sinopsis || info?.description || ''
          const nuevoGenero = faltaGeneroLimpio
            ? normalizarGenero(info?.categories)
            : (libro.genero as string)
          const nuevosPremios =
            libro.premios || extraerPremios(info?.categories, info?.description) || ''

          const portadaGoogle =
            info?.imageLinks?.thumbnail?.replace('http://', 'https://') || ''
          const nuevaPortada = faltaPortada
            ? portadaGoogle ||
              `https://covers.openlibrary.org/b/isbn/${libro.isbn}-M.jpg?default=false`
            : libro.portada_url

          if (
            nuevaSinopsis !== (libro.sinopsis || '') ||
            nuevoGenero !== (libro.genero || 'Otros') ||
            nuevosPremios !== (libro.premios || '') ||
            nuevaPortada !== libro.portada_url
          ) {
            setSinopsis(nuevaSinopsis)
            setGenero(nuevoGenero)
            setPremios(nuevosPremios)
            if (nuevaPortada) setPortadaActual(nuevaPortada)
            await supabase
              .from('libros_catalogo')
              .update({
                sinopsis: nuevaSinopsis || null,
                genero: nuevoGenero || 'Otros',
                premios: nuevosPremios || null,
                portada_url: nuevaPortada || '',
              })
              .eq('isbn', libro.isbn)
            onActualizado()
          }
        } catch {
          // Ignorar fallo secundario
        } finally {
          setCargandoExtra(false)
        }
      }
      enriquecerCatalogo()
    }
  }, [libro, supabase, cargarResenas, onActualizado])

  useEffect(() => {
    if (currentUserId && resenas.length > 0) {
      const propia = resenas.find((r) => r.usuario_id === currentUserId)
      if (propia) {
        setMiPuntuacion(propia.puntuacion)
        setMiComentario(propia.comentario || '')
      }
    }
  }, [currentUserId, resenas])

  if (!libro) return null

  const subirFotoPortada = async (file: File) => {
    if (subiendoPortada) return
    setSubiendoPortada(true)

    try {
      const imagenComprimida = await comprimirImagen(file)
      const rutaArchivo = `${libro.isbn}_${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('portadas-libros')
        .upload(rutaArchivo, imagenComprimida, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('portadas-libros')
        .getPublicUrl(rutaArchivo)

      const nuevaUrl = publicUrlData.publicUrl

      const { error: dbError } = await supabase
        .from('libros_catalogo')
        .update({ portada_url: nuevaUrl })
        .eq('isbn', libro.isbn)

      if (dbError) throw dbError

      setPortadaActual(nuevaUrl)
      onActualizado()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      alert(`No se pudo guardar la portada: ${msg}`)
    } finally {
      setSubiendoPortada(false)
    }
  }

  const cambiarEstado = async (nuevoEstado: string) => {
    setEstado(nuevoEstado)
    const { error } = await supabase
      .from('ejemplares')
      .update({ estado: nuevoEstado })
      .eq('id', libro.ejemplarId)

    if (!error) onActualizado()
  }

  const cambiarGeneroManual = async (nuevoGenero: string) => {
    setGenero(nuevoGenero)
    const { error } = await supabase
      .from('libros_catalogo')
      .update({ genero: nuevoGenero })
      .eq('isbn', libro.isbn)

    if (!error) onActualizado()
  }

  const toggleClub = async (clubId: string) => {
    if (guardandoVisibilidad) return
    setGuardandoVisibilidad(true)
    const yaCompartido = clubesCompartidos.includes(clubId)

    if (yaCompartido) {
      const { error } = await supabase
        .from('ejemplares_club')
        .delete()
        .eq('ejemplar_id', libro.ejemplarId)
        .eq('club_id', clubId)

      if (!error) {
        setClubesCompartidos((prev) => prev.filter((id) => id !== clubId))
        onActualizado()
      }
    } else {
      const { error } = await supabase
        .from('ejemplares_club')
        .insert({ ejemplar_id: libro.ejemplarId, club_id: clubId })

      if (!error) {
        setClubesCompartidos((prev) => [...prev, clubId])
        onActualizado()
      }
    }
    setGuardandoVisibilidad(false)
  }

  const toggleVisibilidadLocal = async () => {
    if (guardandoVisibilidad) return
    if (!visibleLocal && !codigoPostalUsuario) {
      alert(
        'Para compartir libros en tu barrio primero debes guardar tu código postal en tu perfil (arriba a la derecha).'
      )
      return
    }

    setGuardandoVisibilidad(true)
    const nuevoValor = !visibleLocal
    const { error } = await supabase
      .from('ejemplares')
      .update({ visible_local: nuevoValor })
      .eq('id', libro.ejemplarId)

    if (!error) {
      setVisibleLocal(nuevoValor)
      onActualizado()
    } else {
      alert(`No se pudo cambiar la visibilidad local: ${error.message}`)
    }
    setGuardandoVisibilidad(false)
  }

  const guardarResena = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId || !libro.clubId || guardandoResena) return
    setGuardandoResena(true)

    const { error } = await supabase.from('resenas_libro').upsert(
      {
        isbn: libro.isbn,
        club_id: libro.clubId,
        usuario_id: currentUserId,
        puntuacion: miPuntuacion,
        comentario: miComentario.trim() || null,
      },
      { onConflict: 'isbn,club_id,usuario_id' }
    )

    setGuardandoResena(false)
    if (error) {
      alert(`No se pudo guardar la reseña: ${error.message}`)
    } else {
      await cargarResenas(libro.isbn, libro.clubId)
      onActualizado()
    }
  }

  const eliminarLibro = async () => {
    if (!confirm('¿Seguro que quieres quitar este libro de tu estantería?')) return
    const { error } = await supabase.from('ejemplares').delete().eq('id', libro.ejemplarId)
    if (!error) {
      onActualizado()
      onClose()
    }
  }

  const mediaEstrellas =
    resenas.length > 0
      ? (resenas.reduce((acc, r) => acc + r.puntuacion, 0) / resenas.length).toFixed(1)
      : null

  const puedeEditarPortada = libro.esPropio || !portadaActual

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur-xs border-b border-stone-100 px-5 py-3.5 flex items-center justify-between z-10">
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
            Ficha del ejemplar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-4">
            <div className="w-24 aspect-[2/3] bg-stone-100 rounded-xl overflow-hidden shrink-0 border border-stone-200 shadow-xs relative group">
              {portadaActual ? (
                <img
                  src={portadaActual}
                  alt={libro.titulo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 text-[11px] p-2 text-center gap-1">
                  <BookOpen className="w-5 h-5 text-stone-300" />
                  <span>Sin portada</span>
                </div>
              )}

              {puedeEditarPortada && (
                <label
                  title="Hacer foto o subir portada del libro"
                  className="absolute inset-x-1.5 bottom-1.5 py-1.5 px-2 bg-stone-900/85 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 shadow-sm cursor-pointer transition"
                >
                  {subiendoPortada ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>{subiendoPortada ? 'Subiendo...' : 'Foto'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={subiendoPortada}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) subirFotoPortada(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>

            <div className="space-y-1.5 flex-1">
              <h2 className="font-bold text-stone-900 text-base leading-snug">{libro.titulo}</h2>
              <p className="text-sm text-stone-600 font-medium">{libro.autor}</p>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {libro.esPropio ? (
                  <div className="inline-flex items-center gap-1 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-0.5">
                    <Tag className="w-3 h-3 text-stone-500" />
                    <select
                      value={genero}
                      onChange={(e) => cambiarGeneroManual(e.target.value)}
                      aria-label="Cambiar género del libro"
                      className="text-[11px] font-medium text-stone-700 bg-transparent focus:outline-none cursor-pointer"
                    >
                      {GENEROS_ESTANDAR.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full font-medium">
                    <Tag className="w-3 h-3 text-stone-500" />
                    {genero}
                  </span>
                )}

                <span className="text-[11px] text-stone-400">ISBN: {libro.isbn}</span>
              </div>

              {mediaEstrellas && (
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{mediaEstrellas} / 5</span>
                  <span className="text-amber-700/80 font-normal">
                    ({resenas.length} {resenas.length === 1 ? 'opinión' : 'opiniones'})
                  </span>
                </div>
              )}

              {premios && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
                  <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{premios}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
            <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              Sinopsis
            </h3>
            {cargandoExtra ? (
              <p className="text-xs text-stone-400 italic">Buscando datos del libro...</p>
            ) : sinopsis ? (
              <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                {sinopsis}
              </p>
            ) : (
              <p className="text-xs text-stone-400 italic">
                No hay sinopsis disponible para esta edición.
              </p>
            )}
          </div>

          {libro.clubId && (
            <div className="border-t border-stone-100 pt-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Opiniones en {libro.clubNombre || 'el club'}</span>
                </h3>
                {mediaEstrellas && (
                  <span className="text-xs font-bold text-stone-700">★ {mediaEstrellas}</span>
                )}
              </div>

              <form
                onSubmit={guardarResena}
                className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">Tu valoración:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((estrella) => (
                      <button
                        key={estrella}
                        type="button"
                        onClick={() => setMiPuntuacion(estrella)}
                        className="p-0.5 cursor-pointer transition-transform hover:scale-110"
                        title={`${estrella} ${estrella === 1 ? 'estrella' : 'estrellas'}`}
                      >
                        <Star
                          className={`w-5 h-5 ${
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
                  maxLength={500}
                  value={miComentario}
                  onChange={(e) => setMiComentario(e.target.value)}
                  placeholder="¿Qué te ha parecido este libro? Comparte tu opinión con el club..."
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600 resize-none"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardandoResena}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{guardandoResena ? 'Guardando...' : 'Publicar opinión'}</span>
                  </button>
                </div>
              </form>

              {cargandoResenas ? (
                <p className="text-xs text-stone-400 text-center py-2">Cargando comentarios...</p>
              ) : resenas.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-2">
                  Nadie ha reseñado todavía este título en el club. ¡Sé el primero!
                </p>
              ) : (
                <div className="space-y-2">
                  {resenas.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white border border-stone-200/80 rounded-xl p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">
                          {r.usuario_id === currentUserId ? `${r.usuario_nombre} (Tú)` : r.usuario_nombre}
                        </span>
                        <div className="flex items-center gap-0.5">
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
                      {r.comentario && (
                        <p className="text-xs text-stone-600 leading-relaxed">{r.comentario}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {libro.esPropio && (
            <div className="space-y-4 border-t border-stone-100 pt-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  Estado de disponibilidad
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'disponible', label: 'Disponible' },
                    { id: 'no_disponible', label: 'No disponible' },
                    { id: 'prestado', label: 'Prestado' },
                  ].map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => cambiarEstado(op.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        estado === op.id
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  Préstamo vecinal (Barrio)
                </label>
                <button
                  type="button"
                  onClick={toggleVisibilidadLocal}
                  disabled={guardandoVisibilidad}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition flex items-center justify-between gap-3 cursor-pointer ${
                    visibleLocal
                      ? 'bg-sky-50 border-sky-200 text-sky-950'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <div>
                    <p className="text-xs font-semibold">
                      {visibleLocal
                        ? `Visible en tu barrio${codigoPostalUsuario ? ` (CP ${codigoPostalUsuario})` : ''}`
                        : 'Oculto para vecinos'}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Tu nombre y correo permanecen ocultos hasta que aceptes un préstamo.
                    </p>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      visibleLocal ? 'bg-sky-600 text-white' : 'border border-stone-300 bg-white'
                    }`}
                  >
                    {visibleLocal && <Check className="w-3.5 h-3.5" />}
                  </span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-700" />
                  Visible en mis clubes
                </label>
                {misClubes.length === 0 ? (
                  <p className="text-xs text-stone-400">
                    Aún no te has unido a ningún club. Crea uno o únete en la pestaña Clubes.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {misClubes.map((club) => {
                      const activo = clubesCompartidos.includes(club.id)
                      return (
                        <button
                          key={club.id}
                          type="button"
                          onClick={() => toggleClub(club.id)}
                          disabled={guardandoVisibilidad}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                            activo
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          <span>{club.nombre}</span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center ${
                              activo ? 'bg-emerald-700 text-white' : 'border border-stone-300'
                            }`}
                          >
                            {activo && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={eliminarLibro}
                  className="w-full py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar ejemplar de mi estantería
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}