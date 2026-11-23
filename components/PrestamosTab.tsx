'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { comprimirImagen } from '@/utils/comprimirImagen'
import { enviarNotificacionPush } from '@/utils/notificaciones'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  Clock,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'

interface PrestamoItem {
  id: string
  ejemplar_id: string
  propietario_id: string
  lector_id: string
  club_id: string | null
  estado: string
  fecha_solicitud: string
  fecha_entrega: string | null
  fecha_devolucion_real: string | null
  foto_entrega_url: string | null
  foto_devolucion_url: string | null
  titulo: string
  autor: string
  portada_url: string
  isbn: string
  otro_usuario_nombre: string
  club_nombre: string | null
  es_propietario: boolean
}

interface MensajeChat {
  id: string
  prestamo_id: string
  remitente_id: string
  contenido: string
  creado_en: string
}

interface PrestamosTabProps {
  userId: string
  onCambioEstado: () => void
}

export default function PrestamosTab({ userId, onCambioEstado }: PrestamosTabProps) {
  const supabase = createClient()
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const [filtroVista, setFiltroVista] = useState<'activos' | 'historial'>('activos')

  const [subiendoFotoKey, setSubiendoFotoKey] = useState<string | null>(null)
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; titulo: string } | null>(null)

  const [chatAbiertoId, setChatAbiertoId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [cargandoChat, setCargandoChat] = useState(false)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [enviandoMensaje, setEnviandoMensaje] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement | null>(null)

  const cargarPrestamos = useCallback(async () => {
    setCargando(true)

    const { data: prestamosData, error } = await supabase
      .from('prestamos')
      .select(
        'id, ejemplar_id, propietario_id, lector_id, club_id, estado, fecha_solicitud, fecha_entrega, fecha_devolucion_real, foto_entrega_url, foto_devolucion_url'
      )
      .or(`propietario_id.eq.${userId},lector_id.eq.${userId}`)
      .order('fecha_solicitud', { ascending: false })

    if (error || !prestamosData || prestamosData.length === 0) {
      setPrestamos([])
      setCargando(false)
      return
    }

    const ejemplarIds = Array.from(new Set(prestamosData.map((p) => p.ejemplar_id)))
    const otroUserIds = Array.from(
      new Set(
        prestamosData.map((p) =>
          p.propietario_id === userId ? p.lector_id : p.propietario_id
        )
      )
    )
    const clubIds = Array.from(
      new Set(prestamosData.map((p) => p.club_id).filter(Boolean) as string[])
    )

    const [{ data: ejemplaresData }, { data: perfilesData }, { data: clubesData }] =
      await Promise.all([
        supabase.from('ejemplares').select('id, isbn').in('id', ejemplarIds),
        supabase.from('perfiles').select('id, nombre, nombre_usuario').in('id', otroUserIds),
        clubIds.length > 0
          ? supabase.from('clubes').select('id, nombre').in('id', clubIds)
          : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      ])

    const isbns = Array.from(
      new Set((ejemplaresData || []).map((e) => e.isbn).filter(Boolean))
    )

    const { data: catalogoData } =
      isbns.length > 0
        ? await supabase
            .from('libros_catalogo')
            .select('isbn, titulo, autor, portada_url')
            .in('isbn', isbns)
        : { data: [] }

    const combinados: PrestamoItem[] = prestamosData.map((p) => {
      const esPropietario = p.propietario_id === userId
      const otroId = esPropietario ? p.lector_id : p.propietario_id
      const perfil = perfilesData?.find((u) => u.id === otroId)
      const ejemplar = ejemplaresData?.find((e) => e.id === p.ejemplar_id)
      const libro = catalogoData?.find((c) => c.isbn === ejemplar?.isbn)
      const club = clubesData?.find((c) => c.id === p.club_id)

      return {
        id: p.id,
        ejemplar_id: p.ejemplar_id,
        propietario_id: p.propietario_id,
        lector_id: p.lector_id,
        club_id: p.club_id,
        estado: p.estado,
        fecha_solicitud: p.fecha_solicitud,
        fecha_entrega: p.fecha_entrega,
        fecha_devolucion_real: p.fecha_devolucion_real,
        foto_entrega_url: p.foto_entrega_url || null,
        foto_devolucion_url: p.foto_devolucion_url || null,
        titulo: libro?.titulo || 'Libro sin título',
        autor: libro?.autor || 'Autor desconocido',
        portada_url: libro?.portada_url || '',
        isbn: ejemplar?.isbn || '',
        otro_usuario_nombre:
          perfil?.nombre || perfil?.nombre_usuario || `Usuario #${otroId.slice(0, 4)}`,
        club_nombre: club?.nombre || null,
        es_propietario: esPropietario,
      }
    })

    setPrestamos(combinados)
    setCargando(false)
  }, [supabase, userId])

  useEffect(() => {
    cargarPrestamos()
  }, [cargarPrestamos])

  useEffect(() => {
    if (!chatAbiertoId) {
      setMensajes([])
      return
    }

    let activo = true

    const cargarMensajes = async () => {
      setCargandoChat(true)
      const { data } = await supabase
        .from('mensajes_prestamo')
        .select('id, prestamo_id, remitente_id, contenido, creado_en')
        .eq('prestamo_id', chatAbiertoId)
        .order('creado_en', { ascending: true })

      if (activo) {
        setMensajes(data || [])
        setCargandoChat(false)
      }
    }

    cargarMensajes()

    const channel = supabase
      .channel(`chat-prestamo-${chatAbiertoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_prestamo',
          filter: `prestamo_id=eq.${chatAbiertoId}`,
        },
        (payload) => {
          const nuevo = payload.new as MensajeChat
          setMensajes((prev) =>
            prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]
          )
        }
      )
      .subscribe()

    return () => {
      activo = false
      supabase.removeChannel(channel)
    }
  }, [chatAbiertoId, supabase])

  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const subirFotoEstado = async (
    prestamoId: string,
    tipo: 'entrega' | 'devolucion',
    file: File
  ) => {
    const key = `${prestamoId}-${tipo}`
    setSubiendoFotoKey(key)

    try {
      const imagenComprimida = await comprimirImagen(file)
      const rutaArchivo = `${prestamoId}/${tipo}_${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('estados-libros')
        .upload(rutaArchivo, imagenComprimida, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('estados-libros')
        .getPublicUrl(rutaArchivo)

      const columna = tipo === 'entrega' ? 'foto_entrega_url' : 'foto_devolucion_url'

      const { error: dbError } = await supabase
        .from('prestamos')
        .update({ [columna]: publicUrlData.publicUrl })
        .eq('id', prestamoId)

      if (dbError) throw dbError

      await cargarPrestamos()
    } catch (err: any) {
      alert(`No se pudo subir la foto: ${err.message || 'Error desconocido'}`)
    } finally {
      setSubiendoFotoKey(null)
    }
  }

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatAbiertoId || !nuevoMensaje.trim() || enviandoMensaje) return

    const texto = nuevoMensaje.trim()
    setNuevoMensaje('')
    setEnviandoMensaje(true)

    const { data, error } = await supabase
      .from('mensajes_prestamo')
      .insert({
        prestamo_id: chatAbiertoId,
        remitente_id: userId,
        contenido: texto,
      })
      .select()
      .single()

    setEnviandoMensaje(false)

    if (error) {
      alert(`No se pudo enviar el mensaje: ${error.message}`)
      setNuevoMensaje(texto)
    } else if (data) {
      setMensajes((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))

      const chatActual = prestamos.find((p) => p.id === chatAbiertoId)
      if (chatActual) {
        const destinatario = chatActual.es_propietario
          ? chatActual.lector_id
          : chatActual.propietario_id

        enviarNotificacionPush({
          destinatarioId: destinatario,
          titulo: `Chat · ${chatActual.titulo}`,
          cuerpo: texto,
          url: '/',
        })
      }
    }
  }

  const aceptarPrestamo = async (item: PrestamoItem) => {
    if (!item.es_propietario || procesandoId) return
    setProcesandoId(item.id)

    const [{ error: pErr }, { error: eErr }] = await Promise.all([
      supabase
        .from('prestamos')
        .update({
          estado: 'activo',
          fecha_entrega: new Date().toISOString(),
        })
        .eq('id', item.id),
      supabase
        .from('ejemplares')
        .update({ estado: 'prestado' })
        .eq('id', item.ejemplar_id),
    ])

    setProcesandoId(null)
    if (pErr || eErr) {
      alert(`Error al aceptar préstamo: ${pErr?.message || eErr?.message}`)
    } else {
      enviarNotificacionPush({
        destinatarioId: item.lector_id,
        titulo: '¡Préstamo aceptado!',
        cuerpo: `Te han aceptado el préstamo de "${item.titulo}". Entra al chat para quedar.`,
        url: '/',
      })
      await cargarPrestamos()
      onCambioEstado()
    }
  }

  const rechazarOCancelar = async (item: PrestamoItem, nuevoEstado: 'rechazado' | 'cancelado') => {
    if (procesandoId) return
    setProcesandoId(item.id)

    const { error } = await supabase
      .from('prestamos')
      .update({ estado: nuevoEstado })
      .eq('id', item.id)

    setProcesandoId(null)
    if (error) {
      alert(`Error al actualizar solicitud: ${error.message}`)
    } else {
      if (nuevoEstado === 'rechazado') {
        enviarNotificacionPush({
          destinatarioId: item.lector_id,
          titulo: 'Solicitud no disponible',
          cuerpo: `No ha sido posible prestar "${item.titulo}" en este momento.`,
          url: '/',
        })
      }
      await cargarPrestamos()
      onCambioEstado()
    }
  }

  const marcarDevuelto = async (item: PrestamoItem) => {
    if (!item.es_propietario || procesandoId) return
    setProcesandoId(item.id)

    const [{ error: pErr }, { error: eErr }] = await Promise.all([
      supabase
        .from('prestamos')
        .update({
          estado: 'devuelto',
          fecha_devolucion_real: new Date().toISOString(),
        })
        .eq('id', item.id),
      supabase
        .from('ejemplares')
        .update({ estado: 'disponible' })
        .eq('id', item.ejemplar_id),
    ])

    setProcesandoId(null)
    if (pErr || eErr) {
      alert(`Error al registrar devolución: ${pErr?.message || eErr?.message}`)
    } else {
      enviarNotificacionPush({
        destinatarioId: item.lector_id,
        titulo: 'Devolución confirmada',
        cuerpo: `Se ha registrado la devolución de "${item.titulo}". ¡No olvides dejar tu reseña!`,
        url: '/',
      })
      await cargarPrestamos()
      onCambioEstado()
    }
  }

  const prestamosFiltrados = prestamos.filter((p) =>
    filtroVista === 'activos'
      ? p.estado === 'solicitado' || p.estado === 'activo' || p.estado === 'en_curso'
      : p.estado === 'devuelto' || p.estado === 'rechazado' || p.estado === 'cancelado'
  )

  const formatearHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  if (cargando) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Cargando movimientos y préstamos...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Préstamos</h1>
          <p className="text-xs text-stone-500">
            Gestiona entregas, fotos de estado y coordina quedadas por chat
          </p>
        </div>

        <div className="flex bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFiltroVista('activos')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              filtroVista === 'activos'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            En curso
          </button>
          <button
            type="button"
            onClick={() => setFiltroVista('historial')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              filtroVista === 'historial'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Historial
          </button>
        </div>
      </div>

      {prestamosFiltrados.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h2 className="font-semibold text-stone-800 mb-1 text-sm">
            {filtroVista === 'activos'
              ? 'No tienes préstamos activos ni solicitudes pendientes'
              : 'Aún no hay préstamos cerrados en tu historial'}
          </h2>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            Cuando pidas un libro en alguno de tus clubes o alguien te solicite uno de los tuyos, aparecerá aquí con su chat y acta fotográfica.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {prestamosFiltrados.map((item) => {
            const chatAbierto = chatAbiertoId === item.id
            const estaProcesando = procesandoId === item.id
            const mostrarActaFotos =
              item.estado === 'activo' ||
              item.estado === 'en_curso' ||
              item.estado === 'devuelto' ||
              Boolean(item.foto_entrega_url) ||
              Boolean(item.foto_devolucion_url)

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden"
              >
                <div className="p-4 flex gap-3.5">
                  <div className="w-16 aspect-[2/3] bg-stone-100 rounded-lg overflow-hidden shrink-0 border border-stone-200">
                    {item.portada_url ? (
                      <img
                        src={item.portada_url}
                        alt={item.titulo}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400">
                        <BookOpen className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          item.es_propietario
                            ? 'bg-amber-100/80 text-amber-900'
                            : 'bg-sky-100/80 text-sky-900'
                        }`}
                      >
                        {item.es_propietario ? (
                          <>
                            <ArrowUpRight className="w-3 h-3" />
                            <span>Prestas a {item.otro_usuario_nombre}</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>Pides a {item.otro_usuario_nombre}</span>
                          </>
                        )}
                      </span>

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          item.estado === 'solicitado'
                            ? 'bg-amber-100 text-amber-800'
                            : item.estado === 'activo' || item.estado === 'en_curso'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.estado === 'devuelto'
                            ? 'bg-stone-100 text-stone-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {item.estado === 'solicitado'
                          ? 'Solicitado'
                          : item.estado === 'activo' || item.estado === 'en_curso'
                          ? 'En préstamo'
                          : item.estado === 'devuelto'
                          ? 'Devuelto'
                          : item.estado === 'rechazado'
                          ? 'Rechazado'
                          : 'Cancelado'}
                      </span>
                    </div>

                    <h3 className="font-bold text-stone-900 text-sm leading-snug line-clamp-1">
                      {item.titulo}
                    </h3>
                    <p className="text-xs text-stone-500 line-clamp-1">{item.autor}</p>

                    {item.club_nombre && (
                      <p className="text-[11px] text-stone-400">
                        Club: <strong className="text-stone-600">{item.club_nombre}</strong>
                      </p>
                    )}

                    <div className="pt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChatAbiertoId(chatAbierto ? null : item.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                          chatAbierto
                            ? 'bg-stone-900 text-white'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{chatAbierto ? 'Cerrar chat' : 'Chat quedada / novela'}</span>
                      </button>

                      {item.es_propietario && item.estado === 'solicitado' && (
                        <>
                          <button
                            type="button"
                            onClick={() => aceptarPrestamo(item)}
                            disabled={estaProcesando}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aceptar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => rechazarOCancelar(item, 'rechazado')}
                            disabled={estaProcesando}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Rechazar</span>
                          </button>
                        </>
                      )}

                      {!item.es_propietario && item.estado === 'solicitado' && (
                        <button
                          type="button"
                          onClick={() => rechazarOCancelar(item, 'cancelado')}
                          disabled={estaProcesando}
                          className="px-2.5 py-1.5 text-stone-500 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Cancelar solicitud</span>
                        </button>
                      )}

                      {item.es_propietario &&
                        (item.estado === 'activo' || item.estado === 'en_curso') && (
                          <button
                            type="button"
                            onClick={() => marcarDevuelto(item)}
                            disabled={estaProcesando}
                            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Marcar como devuelto</span>
                          </button>
                        )}
                    </div>
                  </div>
                </div>

                {mostrarActaFotos && (
                  <div className="border-t border-stone-100 bg-stone-50/70 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2 flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3" />
                      <span>Estado físico del ejemplar</span>
                    </p>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-white border border-stone-200 rounded-xl p-2 flex items-center justify-between gap-2">
                        {item.foto_entrega_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFotoAmpliada({
                                url: item.foto_entrega_url!,
                                titulo: `Estado en la entrega · ${item.titulo}`,
                              })
                            }
                            className="flex items-center gap-2 text-left min-w-0 cursor-pointer group"
                          >
                            <img
                              src={item.foto_entrega_url}
                              alt="Estado entrega"
                              className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0 group-hover:opacity-90"
                            />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-stone-800 truncate">
                                Foto entrega
                              </p>
                              <p className="text-[10px] text-emerald-700">Ver ampliada</p>
                            </div>
                          </button>
                        ) : (
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-stone-700">
                              Entrega
                            </p>
                            <p className="text-[10px] text-stone-400">Sin foto aún</p>
                          </div>
                        )}

                        {item.estado !== 'devuelto' && (
                          <label className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer">
                            {subiendoFotoKey === `${item.id}-entrega` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Camera className="w-3.5 h-3.5" />
                            )}
                            <span>{item.foto_entrega_url ? 'Cambiar' : 'Subir'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              disabled={subiendoFotoKey !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) subirFotoEstado(item.id, 'entrega', file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                        )}
                      </div>

                      <div className="bg-white border border-stone-200 rounded-xl p-2 flex items-center justify-between gap-2">
                        {item.foto_devolucion_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFotoAmpliada({
                                url: item.foto_devolucion_url!,
                                titulo: `Estado en la devolución · ${item.titulo}`,
                              })
                            }
                            className="flex items-center gap-2 text-left min-w-0 cursor-pointer group"
                          >
                            <img
                              src={item.foto_devolucion_url}
                              alt="Estado devolución"
                              className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0 group-hover:opacity-90"
                            />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-stone-800 truncate">
                                Foto devolución
                              </p>
                              <p className="text-[10px] text-emerald-700">Ver ampliada</p>
                            </div>
                          </button>
                        ) : (
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-stone-700">
                              Devolución
                            </p>
                            <p className="text-[10px] text-stone-400">Sin foto aún</p>
                          </div>
                        )}

                        <label className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer">
                          {subiendoFotoKey === `${item.id}-devolucion` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5" />
                          )}
                          <span>{item.foto_devolucion_url ? 'Cambiar' : 'Subir'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={subiendoFotoKey !== null}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) subirFotoEstado(item.id, 'devolucion', file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {chatAbierto && (
                  <div className="border-t border-stone-200 bg-stone-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                        Chat privado con {item.otro_usuario_nombre}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        ● En tiempo real
                      </span>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-xl p-3 h-56 overflow-y-auto space-y-2.5">
                      {cargandoChat ? (
                        <div className="h-full flex items-center justify-center text-xs text-stone-400">
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          Cargando mensajes...
                        </div>
                      ) : mensajes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                          <p className="text-xs text-stone-500 font-medium">
                            Aún no hay mensajes en este intercambio
                          </p>
                          <p className="text-[11px] text-stone-400 mt-1">
                            Escribe para acordar dónde y cuándo quedar, o para comentar qué te está pareciendo el libro.
                          </p>
                        </div>
                      ) : (
                        mensajes.map((msg) => {
                          const esMio = msg.remitente_id === userId
                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${
                                esMio ? 'items-end' : 'items-start'
                              }`}
                            >
                              <div
                                className={`max-w-[82%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                  esMio
                                    ? 'bg-emerald-700 text-white rounded-br-xs'
                                    : 'bg-stone-100 text-stone-800 rounded-bl-xs'
                                }`}
                              >
                                <p className="whitespace-pre-line">{msg.contenido}</p>
                              </div>
                              <span className="text-[10px] text-stone-400 mt-0.5 px-1">
                                {esMio ? 'Tú' : item.otro_usuario_nombre} ·{' '}
                                {formatearHora(msg.creado_en)}
                              </span>
                            </div>
                          )
                        })
                      )}
                      <div ref={mensajesEndRef} />
                    </div>

                    <form onSubmit={enviarMensaje} className="flex gap-2">
                      <input
                        type="text"
                        maxLength={1000}
                        value={nuevoMensaje}
                        onChange={(e) => setNuevoMensaje(e.target.value)}
                        placeholder="Ej. ¿Quedamos mañana a las 19:00 en la plaza?"
                        className="flex-1 px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="submit"
                        disabled={enviandoMensaje || !nuevoMensaje.trim()}
                        className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div
            className="max-w-lg w-full bg-stone-900 rounded-2xl overflow-hidden shadow-2xl border border-stone-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-stone-800">
              <p className="text-xs font-semibold text-stone-200 truncate">
                {fotoAmpliada.titulo}
              </p>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="p-1 text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[75vh]">
              <img
                src={fotoAmpliada.url}
                alt={fotoAmpliada.titulo}
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}