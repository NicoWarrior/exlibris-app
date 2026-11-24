'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  BookOpen,
  Calendar,
  ExternalLink,
  Loader2,
  MapPin,
  Megaphone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'

interface EventoLiterario {
  id: string
  titulo: string
  categoria: 'coloquio' | 'presentacion' | 'mercadillo' | 'club_abierto'
  descripcion: string
  lugar: string
  codigo_postal: string
  fecha_evento: string
  enlace_info: string | null
  creado_por: string
  es_oficial?: boolean
  autor_nombre?: string
}

interface TablonEventosTabProps {
  codigoPostalUsuario?: string | null
  onClose?: () => void
}

const CATEGORIAS: Record<
  EventoLiterario['categoria'],
  { label: string; bg: string; text: string }
> = {
  coloquio: { label: 'Coloquio / Charla', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  presentacion: { label: 'Presentación', bg: 'bg-sky-100', text: 'text-sky-800' },
  mercadillo: { label: 'Mercadillo / Trueque', bg: 'bg-amber-100', text: 'text-amber-800' },
  club_abierto: { label: 'Lectura conjunta', bg: 'bg-purple-100', text: 'text-purple-800' },
}

export default function TablonEventosTab({
  codigoPostalUsuario,
  onClose,
}: TablonEventosTabProps) {
  const supabase = createClient()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [eventos, setEventos] = useState<EventoLiterario[]>([])
  const [cargando, setCargando] = useState(true)

  const [cpFiltro, setCpFiltro] = useState<string>(codigoPostalUsuario || '')
  const [verTodosCp, setVerTodosCp] = useState<boolean>(!codigoPostalUsuario)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')

  const cpInicializadoRef = useRef(Boolean(codigoPostalUsuario))

  // Formulario de nuevo anuncio
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<EventoLiterario['categoria']>('coloquio')
  const [descripcion, setDescripcion] = useState('')
  const [lugar, setLugar] = useState('')
  const [cpNuevo, setCpNuevo] = useState(codigoPostalUsuario || '')
  const [fechaEvento, setFechaEvento] = useState('')
  const [enlaceInfo, setEnlaceInfo] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (codigoPostalUsuario && !cpInicializadoRef.current) {
      cpInicializadoRef.current = true
      setCpFiltro(codigoPostalUsuario)
      setCpNuevo(codigoPostalUsuario)
      setVerTodosCp(false)
    }
  }, [codigoPostalUsuario])

  const cargarEventos = useCallback(async () => {
    setCargando(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    const limitePasado = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('eventos_literarios')
      .select('*')
      .gte('fecha_evento', limitePasado)
      .order('fecha_evento', { ascending: true })

    const cpLimpio = cpFiltro.trim()

    if (verTodosCp) {
      // Si hay al menos 2 dígitos (ej. 20xxx Donostia, 48xxx Bilbao), muestra toda esa ciudad/provincia
      if (cpLimpio.length >= 2) {
        query = query.ilike('codigo_postal', `${cpLimpio.slice(0, 2)}%`)
      }
    } else if (cpLimpio.length >= 4) {
      query = query.eq('codigo_postal', cpLimpio)
    }

    if (categoriaFiltro !== 'todas') {
      query = query.eq('categoria', categoriaFiltro)
    }

    const { data: eventosData } = await query

    if (!eventosData || eventosData.length === 0) {
      setEventos([])
      setCargando(false)
      return
    }

    const autoresNoOficiales = Array.from(
      new Set(eventosData.filter((e) => !e.es_oficial).map((e) => e.creado_por))
    )

    let perfiles: { id: string; nombre: string | null; nombre_usuario: string | null }[] = []
    if (autoresNoOficiales.length > 0) {
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('id, nombre, nombre_usuario')
        .in('id', autoresNoOficiales)
      perfiles = perfilesData || []
    }

    const enriquecidos: EventoLiterario[] = eventosData.map((ev) => {
      if (ev.es_oficial) {
        return {
          ...ev,
          autor_nombre: 'Admin',
        }
      }
      const perfil = perfiles.find((p) => p.id === ev.creado_por)
      return {
        ...ev,
        autor_nombre:
          perfil?.nombre || perfil?.nombre_usuario || `Vecino #${ev.creado_por.slice(0, 4)}`,
      }
    })

    setEventos(enriquecidos)
    setCargando(false)
  }, [supabase, cpFiltro, verTodosCp, categoriaFiltro])

  useEffect(() => {
    cargarEventos()
  }, [cargarEventos])

  const publicarEvento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId || guardando) return
    setGuardando(true)

    try {
      const fechaIso = new Date(fechaEvento).toISOString()
      const enlaceLimpio = enlaceInfo.trim()
      const enlaceValido =
        enlaceLimpio && !/^https?:\/\//i.test(enlaceLimpio)
          ? `https://${enlaceLimpio}`
          : enlaceLimpio

      const { error } = await supabase.from('eventos_literarios').insert({
        titulo: titulo.trim(),
        categoria,
        descripcion: descripcion.trim(),
        lugar: lugar.trim(),
        codigo_postal: cpNuevo.trim(),
        fecha_evento: fechaIso,
        enlace_info: enlaceValido || null,
        creado_por: currentUserId,
        es_oficial: false,
      })

      if (error) throw error

      setTitulo('')
      setDescripcion('')
      setLugar('')
      setFechaEvento('')
      setEnlaceInfo('')
      setMostrandoForm(false)
      setCpFiltro(cpNuevo.trim())
      setVerTodosCp(false)
      await cargarEventos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al publicar el anuncio'
      alert(`No se pudo publicar el evento: ${msg}`)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarEvento = async (id: string) => {
    if (!confirm('¿Eliminar este anuncio del tablón?')) return
    const { error } = await supabase.from('eventos_literarios').delete().eq('id', id)
    if (!error) {
      setEventos((prev) => prev.filter((e) => e.id !== id))
    }
  }

  const formatearFecha = (iso: string) => {
    const fecha = new Date(iso)
    return fecha.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs space-y-4">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-amber-600" />
            <span>Tablón literario del barrio</span>
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Coloquios, presentaciones, mercadillos y lecturas abiertas cerca de ti.
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMostrandoForm((prev) => !prev)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Publicar</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Formulario de nuevo evento */}
      {mostrandoForm && (
        <form
          onSubmit={publicarEvento}
          className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-2.5"
        >
          <p className="text-xs font-bold text-stone-800">Nuevo anuncio literario</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              required
              maxLength={120}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título del evento o convocatoria"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as EventoLiterario['categoria'])}
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            >
              <option value="coloquio">Coloquio / Charla</option>
              <option value="presentacion">Presentación de libro</option>
              <option value="mercadillo">Mercadillo / Trueque</option>
              <option value="club_abierto">Lectura conjunta abierta</option>
            </select>
          </div>

          <textarea
            rows={2}
            required
            maxLength={600}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalles del encuentro, temática, si hace falta inscripción..."
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600 resize-none"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              required
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Lugar (ej. Librería Hontza)"
              className="sm:col-span-2 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
            <input
              type="text"
              required
              maxLength={5}
              value={cpNuevo}
              onChange={(e) => setCpNuevo(e.target.value.replace(/\D/g, ''))}
              placeholder="CP (ej. 20004)"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="datetime-local"
              required
              value={fechaEvento}
              onChange={(e) => setFechaEvento(e.target.value)}
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-700 focus:outline-none focus:border-emerald-600"
            />
            <input
              type="text"
              value={enlaceInfo}
              onChange={(e) => setEnlaceInfo(e.target.value)}
              placeholder="Enlace con más info (opcional)"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMostrandoForm(false)}
              className="px-3 py-1.5 bg-stone-200/70 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{guardando ? 'Publicando...' : 'Publicar anuncio'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Filtros por CP y categoría */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            maxLength={5}
            value={cpFiltro}
            onChange={(e) => {
              const valor = e.target.value.replace(/\D/g, '')
              setCpFiltro(valor)
              if (valor.length >= 4) {
                setVerTodosCp(false)
              } else {
                setVerTodosCp(true)
              }
            }}
            placeholder="CP..."
            className="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => setVerTodosCp((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition ${
              verTodosCp
                ? 'bg-stone-800 text-white border-stone-800'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
            }`}
          >
            {verTodosCp ? 'Toda la ciudad' : 'Solo este CP'}
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {[
            { id: 'todas', label: 'Todos' },
            { id: 'coloquio', label: 'Coloquios' },
            { id: 'presentacion', label: 'Presentaciones' },
            { id: 'mercadillo', label: 'Mercadillos' },
            { id: 'club_abierto', label: 'Lecturas' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoriaFiltro(cat.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border cursor-pointer transition ${
                categoriaFiltro === cat.id
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Listado de eventos */}
      {cargando ? (
        <div className="py-6 text-center text-xs text-stone-400">Cargando agenda literaria...</div>
      ) : eventos.length === 0 ? (
        <div className="bg-stone-50 border border-dashed border-stone-200 rounded-2xl p-6 text-center space-y-1.5">
          <p className="text-xs font-semibold text-stone-600">
            No hay eventos próximos para este filtro.
          </p>
          <p className="text-[11px] text-stone-400">
            Prueba activando &ldquo;Toda la ciudad&rdquo; o publica el primer encuentro literario.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {eventos.map((ev) => {
            const catMeta = CATEGORIAS[ev.categoria] || CATEGORIAS.coloquio
            const esMio = !ev.es_oficial && ev.creado_por === currentUserId

            return (
              <div
                key={ev.id}
                className="bg-stone-50/80 border border-stone-200/90 rounded-2xl p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${catMeta.bg} ${catMeta.text}`}
                      >
                        {ev.categoria === 'mercadillo' ? (
                          <ShoppingBag className="w-3 h-3" />
                        ) : ev.categoria === 'presentacion' ? (
                          <Sparkles className="w-3 h-3" />
                        ) : ev.categoria === 'club_abierto' ? (
                          <Users className="w-3 h-3" />
                        ) : (
                          <BookOpen className="w-3 h-3" />
                        )}
                        {catMeta.label}
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                        <Calendar className="w-3 h-3 text-emerald-700" />
                        {formatearFecha(ev.fecha_evento)}
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-stone-900 leading-snug">
                      {ev.titulo}
                    </h4>
                  </div>

                  {esMio && (
                    <button
                      type="button"
                      onClick={() => eliminarEvento(ev.id)}
                      title="Eliminar mi anuncio"
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">{ev.descripcion}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-stone-500">
                  <span className="inline-flex items-center gap-1 font-medium text-stone-700">
                    <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    {ev.lugar} · CP {ev.codigo_postal}
                  </span>

                  <div className="flex items-center gap-3">
                    {ev.es_oficial ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Publicado por Admin</span>
                      </span>
                    ) : (
                      <span>Publicado por {esMio ? 'ti' : ev.autor_nombre}</span>
                    )}
                    {ev.enlace_info && (
                      <a
                        href={ev.enlace_info}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        <span>Más info</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}