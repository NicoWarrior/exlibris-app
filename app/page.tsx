'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { activarNotificacionesPush, enviarNotificacionPush } from '@/utils/notificaciones'
import IsbnScanner from '@/components/IsbnScanner'
import ClubesTab from '@/components/ClubesTab'
import ExplorarLocalTab from '@/components/ExplorarLocalTab'
import PrestamosTab from '@/components/PrestamosTab'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import PerfilModal from '@/components/PerfilModal'
import PortadaLibro from '@/components/PortadaLibro'
import {
  ArrowLeftRight,
  Award,
  Bell,
  BellRing,
  Bookmark,
  BookOpen,
  LayoutGrid,
  List,
  LogOut,
  MapPin,
  Plus,
  ScanBarcode,
  Search,
  Send,
  Trash2,
  UserCircle2,
  Users,
  X,
} from 'lucide-react'

interface LibroEstanteria {
  id: string
  estado: string
  visible_local?: boolean
  libros_catalogo: {
    isbn: string
    titulo: string
    autor: string
    portada_url: string
    genero?: string | null
    sinopsis?: string | null
    premios?: string | null
  }
}

interface LibroDeseo {
  id: string
  ejemplar_id: string | null
  club_id: string | null
  isbn: string
  titulo: string
  autor: string
  portada_url: string
  propietario_nombre: string | null
  propietario_id?: string | null
  estado_actual?: string | null
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [aliasUsuario, setAliasUsuario] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'estanteria' | 'clubes' | 'barrio' | 'prestamos'>('estanteria')
  const [misLibros, setMisLibros] = useState<LibroEstanteria[]>([])
  const [notificacionesPrestamosCount, setNotificacionesPrestamosCount] = useState(0)
  const [showScanner, setShowScanner] = useState(false)
  const [showPerfil, setShowPerfil] = useState(false)
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)
  const [pushActivo, setPushActivo] = useState(false)
  const [activandoPush, setActivandoPush] = useState(false)

  const [subTabEstanteria, setSubTabEstanteria] = useState<'propios' | 'deseos'>('propios')
  const [listaDeseos, setListaDeseos] = useState<LibroDeseo[]>([])
  const [pidiendoDeseoId, setPidiendoDeseoId] = useState<string | null>(null)

  // Estados de visualización y filtrado de Mi Estantería
  const [vistaEstanteria, setVistaEstanteria] = useState<'grid' | 'lista'>('grid')
  const [busquedaEstanteria, setBusquedaEstanteria] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'disponible' | 'prestado'>('todos')
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')

  const supabase = createClient()

  const sincronizarPerfilInicial = useCallback(
    async (authUser: any) => {
      const nombrePorDefecto =
        authUser.user_metadata?.full_name ||
        authUser.email?.split('@')[0] ||
        'Lector'

      const { data: perfilExistente } = await supabase
        .from('perfiles')
        .select('nombre, nombre_usuario')
        .eq('id', authUser.id)
        .maybeSingle()

      if (perfilExistente?.nombre || perfilExistente?.nombre_usuario) {
        setAliasUsuario(perfilExistente.nombre || perfilExistente.nombre_usuario)
      } else {
        setAliasUsuario(nombrePorDefecto)
        await supabase.from('perfiles').upsert({
          id: authUser.id,
          email: authUser.email,
          nombre: nombrePorDefecto,
          nombre_usuario: nombrePorDefecto,
        })
      }
    },
    [supabase]
  )

  const cargarDatos = useCallback(
    async (uid: string) => {
      const { data: ejemplaresData, error: ejError } = await supabase
        .from('ejemplares')
        .select('id, isbn, estado, visible_local')
        .eq('propietario_id', uid)

      if (!ejError && ejemplaresData) {
        if (ejemplaresData.length === 0) {
          setMisLibros([])
        } else {
          const isbns = ejemplaresData.map((e) => e.isbn)
          const { data: catalogoData } = await supabase
            .from('libros_catalogo')
            .select('isbn, titulo, autor, portada_url, genero, sinopsis, premios')
            .in('isbn', isbns)

          const combinados = ejemplaresData
            .map((ej) => ({
              id: ej.id,
              estado: ej.estado,
              visible_local: Boolean(ej.visible_local),
              libros_catalogo: catalogoData?.find((c) => c.isbn === ej.isbn) || {
                isbn: ej.isbn,
                titulo: `ISBN: ${ej.isbn}`,
                autor: 'Sin datos en catálogo',
                portada_url: '',
                genero: 'Otros',
                sinopsis: null,
                premios: null,
              },
            }))
            .sort((a, b) =>
              a.libros_catalogo.titulo.localeCompare(b.libros_catalogo.titulo, 'es', {
                sensitivity: 'base',
              })
            )
          setMisLibros(combinados)
        }
      }

      const [{ count: solicitudesPendientes }, { data: misPrestamosIds }] = await Promise.all([
        supabase
          .from('prestamos')
          .select('id', { count: 'exact', head: true })
          .eq('propietario_id', uid)
          .eq('estado', 'solicitado'),
        supabase
          .from('prestamos')
          .select('id')
          .or(`propietario_id.eq.${uid},lector_id.eq.${uid}`),
      ])

      let mensajesSinLeer = 0
      if (misPrestamosIds && misPrestamosIds.length > 0) {
        const ids = misPrestamosIds.map((p) => p.id)
        const { count: unreadCount } = await supabase
          .from('mensajes_prestamo')
          .select('id', { count: 'exact', head: true })
          .in('prestamo_id', ids)
          .neq('remitente_id', uid)
          .eq('leido', false)

        mensajesSinLeer = unreadCount || 0
      }

      setNotificacionesPrestamosCount((solicitudesPendientes || 0) + mensajesSinLeer)

      const { data: deseosData } = await supabase
        .from('lista_deseos')
        .select('id, ejemplar_id, club_id, isbn, titulo, autor, portada_url, propietario_nombre')
        .eq('usuario_id', uid)
        .order('creado_en', { ascending: false })

      if (deseosData && deseosData.length > 0) {
        const ejIds = deseosData
          .map((d) => d.ejemplar_id)
          .filter((id): id is string => Boolean(id))

        const { data: ejemplaresActuales } =
          ejIds.length > 0
            ? await supabase
                .from('ejemplares')
                .select('id, estado, propietario_id')
                .in('id', ejIds)
            : { data: [] }

        setListaDeseos(
          deseosData.map((d) => {
            const ej = ejemplaresActuales?.find((e) => e.id === d.ejemplar_id)
            return {
              ...d,
              propietario_id: ej?.propietario_id || null,
              estado_actual: ej?.estado || null,
            }
          })
        )
      } else {
        setListaDeseos([])
      }
    },
    [supabase]
  )

  const eliminarDeseo = async (deseoId: string) => {
    const { error } = await supabase.from('lista_deseos').delete().eq('id', deseoId)
    if (!error) {
      setListaDeseos((prev) => prev.filter((d) => d.id !== deseoId))
    }
  }

  const pedirDesdeDeseos = async (deseo: LibroDeseo) => {
    if (!user || !deseo.ejemplar_id || !deseo.propietario_id || pidiendoDeseoId) return
    setPidiendoDeseoId(deseo.id)

    const { error } = await supabase.from('prestamos').insert({
      ejemplar_id: deseo.ejemplar_id,
      propietario_id: deseo.propietario_id,
      lector_id: user.id,
      club_id: deseo.club_id,
      estado: 'solicitado',
    })

    if (error) {
      alert(`No se pudo solicitar el préstamo: ${error.message}`)
      setPidiendoDeseoId(null)
      return
    }

    await supabase.from('lista_deseos').delete().eq('id', deseo.id)
    setListaDeseos((prev) => prev.filter((d) => d.id !== deseo.id))
    setPidiendoDeseoId(null)

    enviarNotificacionPush({
      destinatarioId: deseo.propietario_id,
      titulo: 'Nueva solicitud de préstamo',
      cuerpo: `Te han pedido prestado "${deseo.titulo}"`,
      url: '/',
    })

    await cargarDatos(user.id)
    alert(`Solicitud enviada a ${deseo.propietario_nombre || 'su propietario'}.`)
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushActivo(Notification.permission === 'granted')
    }

    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        await Promise.all([sincronizarPerfilInicial(user), cargarDatos(user.id)])
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          activarNotificacionesPush(user.id).catch(() => {})
        }
      }
      setLoading(false)
    }
    getUser()
  }, [supabase, cargarDatos, sincronizarPerfilInicial])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`badge-global-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensajes_prestamo' },
        () => cargarDatos(user.id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prestamos' },
        () => cargarDatos(user.id)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, supabase, cargarDatos])

  useEffect(() => {
    if (user?.id && tab === 'estanteria') {
      cargarDatos(user.id)
    }
  }, [tab, user?.id, cargarDatos])

  const generosEstanteria = useMemo(() => {
    const unicos = new Set<string>()
    misLibros.forEach((item) => {
      if (item.libros_catalogo?.genero) {
        unicos.add(item.libros_catalogo.genero)
      }
    })
    return ['Todos', ...Array.from(unicos).sort((a, b) => a.localeCompare(b, 'es'))]
  }, [misLibros])

  const librosFiltrados = useMemo(() => {
    const q = busquedaEstanteria.trim().toLowerCase()
    return misLibros.filter((item) => {
      if (estadoFiltro === 'disponible' && item.estado !== 'disponible') return false
      if (estadoFiltro === 'prestado' && item.estado !== 'prestado') return false
      if (generoFiltro !== 'Todos' && (item.libros_catalogo?.genero || 'Otros') !== generoFiltro) {
        return false
      }
      if (q) {
        const titulo = item.libros_catalogo?.titulo?.toLowerCase() || ''
        const autor = item.libros_catalogo?.autor?.toLowerCase() || ''
        if (!titulo.includes(q) && !autor.includes(q)) return false
      }
      return true
    })
  }, [misLibros, busquedaEstanteria, estadoFiltro, generoFiltro])

  const resumenContadores = useMemo(() => {
    const disponibles = misLibros.filter((l) => l.estado === 'disponible').length
    const prestados = misLibros.filter((l) => l.estado === 'prestado').length
    return { disponibles, prestados }
  }, [misLibros])

  const handleActivarNotificaciones = async () => {
    if (!user || activandoPush) return
    setActivandoPush(true)
    const ok = await activarNotificacionesPush(user.id)
    setActivandoPush(false)
    if (ok) {
      setPushActivo(true)
      alert('¡Notificaciones activadas en este dispositivo!')
    }
  }

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setMisLibros([])
    setListaDeseos([])
  }

  const abrirDetalleLibro = (item: LibroEstanteria) => {
    setLibroSeleccionado({
      ejemplarId: item.id,
      estado: item.estado,
      propietarioNombre: aliasUsuario || 'Tú',
      esPropio: true,
      isbn: item.libros_catalogo.isbn,
      titulo: item.libros_catalogo.titulo,
      autor: item.libros_catalogo.autor,
      portada_url: item.libros_catalogo.portada_url,
      genero: item.libros_catalogo.genero,
      sinopsis: item.libros_catalogo.sinopsis,
      premios: item.libros_catalogo.premios,
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-600">
        Cargando biblioteca...
      </div>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-6 text-center">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
          <img
            src="/logo.png"
            alt="Exlibris"
            className="w-20 h-20 rounded-2xl object-cover mx-auto mb-5 shadow-xs border border-stone-200/80"
          />
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Exlibris</h1>
          <p className="text-stone-600 text-sm mb-8">
            Tu estantería digital compartida. Escanea tus libros físicos, únete a clubes de lectura y presta ejemplares a tus amigos o vecinos.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl transition flex items-center justify-center gap-3 cursor-pointer"
          >
            Continuar con Google
          </button>
          <p className="text-[11px] text-stone-400 mt-5 leading-relaxed">
            Al continuar, aceptas nuestros{' '}
            <Link
              href="/privacidad"
              className="text-stone-600 underline hover:text-emerald-700 transition"
            >
              Términos de Uso y Política de Privacidad
            </Link>
            .
          </p>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-stone-900 text-lg">
            <img
              src="/logo.png"
              alt="Exlibris"
              className="w-8 h-8 rounded-lg object-cover shrink-0 border border-stone-200/80"
            />
            <span>Exlibris</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleActivarNotificaciones}
              disabled={activandoPush}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                pushActivo
                  ? 'text-emerald-700 bg-emerald-50/70 border-emerald-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
              }`}
              title={
                pushActivo
                  ? 'Notificaciones activadas en este dispositivo'
                  : 'Activar notificaciones push en este dispositivo'
              }
            >
              {pushActivo ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowPerfil(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-100 border border-stone-200/80 flex items-center gap-1.5 cursor-pointer"
              title="Editar alias y código postal"
            >
              <UserCircle2 className="w-4 h-4 text-emerald-700" />
              <span className="max-w-[105px] truncate">{aliasUsuario || 'Mi perfil'}</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5">
        {tab === 'estanteria' && (
          <>
            {/* Cabecera con contador y botón escanear */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-bold text-stone-900">Mi Estantería</h1>
                <p className="text-xs text-stone-500">
                  {misLibros.length} {misLibros.length === 1 ? 'ejemplar' : 'ejemplares'}
                  {misLibros.length > 0 && (
                    <span>
                      {' '}
                      · {resumenContadores.disponibles} en casa
                      {resumenContadores.prestados > 0 &&
                        ` · ${resumenContadores.prestados} prestados`}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowScanner(true)}
                className="py-2 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <ScanBarcode className="w-4 h-4" />
                <span>Escanear ISBN</span>
              </button>
            </div>

            {/* Selector Mis libros vs Lista Por leer */}
            <div className="grid grid-cols-2 gap-1.5 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold mb-4">
              <button
                type="button"
                onClick={() => setSubTabEstanteria('propios')}
                className={`py-1.5 rounded-lg transition cursor-pointer ${
                  subTabEstanteria === 'propios'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Mis libros ({misLibros.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTabEstanteria('deseos')}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  subTabEstanteria === 'deseos'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-600" />
                <span>Por leer ({listaDeseos.length})</span>
              </button>
            </div>

            {subTabEstanteria === 'deseos' ? (
              listaDeseos.length === 0 ? (
                <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center">
                  <Bookmark className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                  <h2 className="font-semibold text-stone-800 mb-1 text-sm">
                    Tu lista Por leer está vacía
                  </h2>
                  <p className="text-xs text-stone-500 max-w-xs mx-auto">
                    Cuando veas un libro interesante en tus clubes, pulsa el icono de marcapáginas para guardarlo aquí y pedirlo cuando vayas a leerlo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {listaDeseos.map((deseo) => {
                    const disponibleAhora = deseo.estado_actual === 'disponible'
                    return (
                      <div
                        key={deseo.id}
                        className="bg-white rounded-xl border border-stone-200 p-3 flex items-center gap-3"
                      >
                        <div className="w-11 h-16 rounded-lg overflow-hidden bg-stone-100 shrink-0">
                          <PortadaLibro
                            src={deseo.portada_url}
                            alt={deseo.titulo}
                            isbn={deseo.isbn}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-stone-900 text-xs line-clamp-1">
                            {deseo.titulo}
                          </h3>
                          <p className="text-[11px] text-stone-500 truncate mt-0.5">
                            {deseo.autor}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {deseo.propietario_nombre && (
                              <span className="text-[10px] text-stone-500">
                                De{' '}
                                <strong className="text-stone-700">
                                  {deseo.propietario_nombre}
                                </strong>
                              </span>
                            )}
                            {deseo.estado_actual && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  disponibleAhora
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {disponibleAhora ? 'Disponible ahora' : 'Prestado ahora'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {disponibleAhora && deseo.ejemplar_id && deseo.propietario_id && (
                            <button
                              type="button"
                              onClick={() => pedirDesdeDeseos(deseo)}
                              disabled={pidiendoDeseoId === deseo.id}
                              className="py-1.5 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              <span>{pidiendoDeseoId === deseo.id ? 'Pidiendo...' : 'Pedir'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => eliminarDeseo(deseo.id)}
                            title="Quitar de Por leer"
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : misLibros.length === 0 ? (
              <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center">
                <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                <h2 className="font-semibold text-stone-800 mb-1 text-sm">Tu estantería está vacía</h2>
                <p className="text-xs text-stone-500 mb-5 max-w-xs mx-auto">
                  Pulsa el botón para escanear el código de barras de un libro y añadirlo a tu colección.
                </p>
                <button
                  onClick={() => setShowScanner(true)}
                  className="py-2 px-4 bg-stone-900 text-white text-xs font-medium rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Añadir primer libro
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Barra de búsqueda + selector de vista */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={busquedaEstanteria}
                      onChange={(e) => setBusquedaEstanteria(e.target.value)}
                      placeholder="Buscar en mi biblioteca por título o autor..."
                      className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600"
                    />
                    {busquedaEstanteria && (
                      <button
                        type="button"
                        onClick={() => setBusquedaEstanteria('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center bg-white border border-stone-200 rounded-xl p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVistaEstanteria('grid')}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        vistaEstanteria === 'grid'
                          ? 'bg-emerald-700 text-white'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                      title="Vista estantería (portadas)"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVistaEstanteria('lista')}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        vistaEstanteria === 'lista'
                          ? 'bg-emerald-700 text-white'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                      title="Vista lista detallada"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Filtros de estado + píldoras de género */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                    {(
                      [
                        { id: 'todos', label: `Todos (${misLibros.length})` },
                        { id: 'disponible', label: `En casa (${resumenContadores.disponibles})` },
                        { id: 'prestado', label: `Prestados (${resumenContadores.prestados})` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setEstadoFiltro(f.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                          estadoFiltro === f.id
                            ? 'bg-stone-900 text-white'
                            : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {generosEstanteria.length > 2 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {generosEstanteria.map((gen) => (
                        <button
                          key={gen}
                          type="button"
                          onClick={() => setGeneroFiltro(gen)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                            generoFiltro === gen
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'
                          }`}
                        >
                          {gen}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resultados vacíos al filtrar */}
                {librosFiltrados.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-xs font-semibold text-stone-700">
                      No hay libros que coincidan con los filtros actuales
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBusquedaEstanteria('')
                        setEstadoFiltro('todos')
                        setGeneroFiltro('Todos')
                      }}
                      className="mt-3 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : vistaEstanteria === 'grid' ? (
                  /* VISTA CUADRÍCULA COMPACTA (ESTANTERÍA VISUAL) */
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3">
                    {librosFiltrados.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => abrirDetalleLibro(item)}
                        className="group bg-white rounded-xl border border-stone-200/90 overflow-hidden shadow-2xs flex flex-col cursor-pointer hover:border-emerald-500 hover:shadow-sm transition"
                      >
                        <div className="aspect-[2/3] bg-stone-100 relative overflow-hidden">
                          <PortadaLibro
                            src={item.libros_catalogo?.portada_url}
                            alt={item.libros_catalogo?.titulo || 'Libro'}
                            isbn={item.libros_catalogo?.isbn}
                          />

                          {/* Badges superiores compactos */}
                          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                            {item.libros_catalogo?.premios && (
                              <span
                                title={item.libros_catalogo.premios}
                                className="bg-amber-400/95 text-amber-950 p-1 rounded-full shadow-xs"
                              >
                                <Award className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {item.visible_local && (
                              <span
                                title="Visible de forma anónima en tu código postal"
                                className="bg-sky-600/95 text-white p-1 rounded-full shadow-xs"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>

                          {/* Indicador de estado compacto */}
                          {item.estado === 'disponible' ? (
                            <span
                              title="Disponible en casa"
                              className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-xs"
                            />
                          ) : (
                            <span
                              className={`absolute bottom-1.5 inset-x-1.5 text-center text-[9px] font-bold py-0.5 px-1.5 rounded-md shadow-xs truncate ${
                                item.estado === 'prestado'
                                  ? 'bg-blue-600/95 text-white'
                                  : 'bg-amber-500/95 text-white'
                              }`}
                            >
                              {item.estado === 'prestado' ? 'Prestado' : 'No disp.'}
                            </span>
                          )}
                        </div>

                        <div className="p-2 flex-1 flex flex-col justify-between">
                          <h3 className="font-semibold text-stone-900 text-[11px] leading-snug line-clamp-2 group-hover:text-emerald-800 transition">
                            {item.libros_catalogo?.titulo}
                          </h3>
                          <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                            {item.libros_catalogo?.autor}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* VISTA LISTA COMPACTA */
                  <div className="space-y-2">
                    {librosFiltrados.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => abrirDetalleLibro(item)}
                        className="bg-white rounded-xl border border-stone-200 p-2.5 flex items-center gap-3 cursor-pointer hover:border-emerald-500 transition"
                      >
                        <div className="w-11 h-16 rounded-lg overflow-hidden bg-stone-100 shrink-0 relative">
                          <PortadaLibro
                            src={item.libros_catalogo?.portada_url}
                            alt={item.libros_catalogo?.titulo || 'Libro'}
                            isbn={item.libros_catalogo?.isbn}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-stone-900 text-xs line-clamp-1">
                              {item.libros_catalogo?.titulo}
                            </h3>
                            <span
                              className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                item.estado === 'disponible'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.estado === 'prestado'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.estado === 'disponible'
                                ? 'Disponible'
                                : item.estado === 'prestado'
                                ? 'Prestado'
                                : 'No disponible'}
                            </span>
                          </div>

                          <p className="text-[11px] text-stone-500 truncate mt-0.5">
                            {item.libros_catalogo?.autor}
                          </p>

                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {item.libros_catalogo?.genero && (
                              <span className="text-[10px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md">
                                {item.libros_catalogo.genero}
                              </span>
                            )}
                            {item.visible_local && (
                              <span className="text-[10px] font-medium bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" />
                                Barrio
                              </span>
                            )}
                            {item.libros_catalogo?.premios && (
                              <span className="text-[10px] font-medium bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <Award className="w-2.5 h-2.5" />
                                Premiado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'clubes' && (
          <ClubesTab userId={user.id} onSolicitado={() => cargarDatos(user.id)} />
        )}

        {tab === 'barrio' && (
          <ExplorarLocalTab
            userId={user.id}
            onAbrirPerfil={() => setShowPerfil(true)}
            onSolicitado={() => cargarDatos(user.id)}
          />
        )}

        {tab === 'prestamos' && (
          <PrestamosTab userId={user.id} onCambioEstado={() => cargarDatos(user.id)} />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-20">
        <div className="max-w-3xl mx-auto grid grid-cols-4 h-16">
          <button
            onClick={() => setTab('estanteria')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              tab === 'estanteria' ? 'text-emerald-700' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span>Estantería</span>
          </button>

          <button
            onClick={() => setTab('clubes')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              tab === 'clubes' ? 'text-emerald-700' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Clubes</span>
          </button>

          <button
            onClick={() => setTab('barrio')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              tab === 'barrio' ? 'text-emerald-700' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span>Barrio</span>
          </button>

          <button
            onClick={() => setTab('prestamos')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium relative cursor-pointer ${
              tab === 'prestamos' ? 'text-emerald-700' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div className="relative">
              <ArrowLeftRight className="w-5 h-5" />
              {notificacionesPrestamosCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-xs">
                  {notificacionesPrestamosCount > 99 ? '99+' : notificacionesPrestamosCount}
                </span>
              )}
            </div>
            <span>Préstamos</span>
          </button>
        </div>
      </nav>

      {showScanner && (
        <IsbnScanner
          userId={user.id}
          onClose={() => setShowScanner(false)}
          onBookAdded={() => cargarDatos(user.id)}
        />
      )}

      <LibroModal
        libro={libroSeleccionado}
        onClose={() => setLibroSeleccionado(null)}
        onActualizado={() => cargarDatos(user.id)}
      />

      <PerfilModal
        isOpen={showPerfil}
        userId={user.id}
        userEmail={user.email || ''}
        defaultName={aliasUsuario}
        onClose={() => setShowPerfil(false)}
        onPerfilGuardado={(nuevoAlias) => setAliasUsuario(nuevoAlias)}
      />
    </div>
  )
}