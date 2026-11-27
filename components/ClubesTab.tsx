'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { enviarNotificacionPush } from '@/utils/notificaciones'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import PortadaLibro from '@/components/PortadaLibro'
import { enviarNotificacionEmail } from '@/utils/notificacionesEmail'
import {
  Award,
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  KeyRound,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Send,
  Share2,
  Star,
  Tag,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react'

interface Club {
  id: string
  nombre: string
  codigo_invitacion: string
  creado_por: string
}

interface MiembroClub {
  usuario_id: string
  rol: string
  nombre: string
}

interface EjemplarClub {
  id: string
  isbn: string
  estado: string
  propietario_id: string
  propietario_nombre: string
  resenas_count: number
  media_estrellas: string | null
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

interface ClubesTabProps {
  userId: string
  onSolicitado: () => void
}

export default function ClubesTab({ userId, onSolicitado }: ClubesTabProps) {
  const supabase = createClient()
  const [clubes, setClubes] = useState<Club[]>([])
  const [clubActivo, setClubActivo] = useState<Club | null>(null)
  const [librosClub, setLibrosClub] = useState<EjemplarClub[]>([])
  const [miembrosClub, setMiembrosClub] = useState<MiembroClub[]>([])
  const [mostrarMiembros, setMostrarMiembros] = useState(false)

  const [vistaClub, setVistaClub] = useState<'grid' | 'lista'>('grid')
  const [busqueda, setBusqueda] = useState('')
  const [filtroAlcance, setFiltroAlcance] = useState<'todos' | 'ajenos' | 'disponibles'>('todos')
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)

  const [cargandoClubes, setCargandoClubes] = useState(true)
  const [cargandoLibros, setCargandoLibros] = useState(false)

  const [modoFormulario, setModoFormulario] = useState<'ninguno' | 'crear' | 'unirse'>('ninguno')
  const [nombreNuevoClub, setNombreNuevoClub] = useState('')
  const [codigoUnirse, setCodigoUnirse] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [menuCompartirAbierto, setMenuCompartirAbierto] = useState(false)
  const [invitacionCopiada, setInvitacionCopiada] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)
  const [deseosIsbns, setDeseosIsbns] = useState<Set<string>>(new Set())
  const [guardandoDeseoId, setGuardandoDeseoId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const codigoUrl = params.get('unirse')
    if (codigoUrl) {
      setCodigoUnirse(codigoUrl.trim().toUpperCase())
      setModoFormulario('unirse')
    }
  }, [])

  const cargarMisDeseos = useCallback(async () => {
    const { data } = await supabase
      .from('lista_deseos')
      .select('isbn')
      .eq('usuario_id', userId)

    if (data) {
      setDeseosIsbns(new Set(data.map((d) => d.isbn)))
    }
  }, [supabase, userId])

  const cargarMisClubes = useCallback(async () => {
    setCargandoClubes(true)
    const { data: membresias } = await supabase
      .from('miembros_club')
      .select('club_id')
      .eq('usuario_id', userId)

    if (membresias && membresias.length > 0) {
      const clubIds = membresias.map((m) => m.club_id)
      const { data: clubesData } = await supabase
        .from('clubes')
        .select('id, nombre, codigo_invitacion, creado_por')
        .in('id', clubIds)

      if (clubesData && clubesData.length > 0) {
        setClubes(clubesData)
        setClubActivo((prev) =>
          prev && clubesData.some((c) => c.id === prev.id) ? prev : clubesData[0]
        )
      } else {
        setClubes([])
        setClubActivo(null)
      }
    } else {
      setClubes([])
      setClubActivo(null)
    }
    setCargandoClubes(false)
  }, [supabase, userId])

  const cargarMiembrosDelClub = useCallback(
    async (clubId: string) => {
      const { data: miembrosData } = await supabase
        .from('miembros_club')
        .select('usuario_id, rol')
        .eq('club_id', clubId)

      if (!miembrosData || miembrosData.length === 0) {
        setMiembrosClub([])
        return
      }

      const ids = miembrosData.map((m) => m.usuario_id)
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('id, nombre, nombre_usuario')
        .in('id', ids)

      const lista: MiembroClub[] = miembrosData.map((m) => {
        const perfil = perfilesData?.find((p) => p.id === m.usuario_id)
        const esYo = m.usuario_id === userId
        return {
          usuario_id: m.usuario_id,
          rol: m.rol,
          nombre: esYo
            ? 'Tú'
            : perfil?.nombre || perfil?.nombre_usuario || `Miembro #${m.usuario_id.slice(0, 4)}`,
        }
      })

      lista.sort((a, b) => (a.usuario_id === userId ? -1 : b.usuario_id === userId ? 1 : a.nombre.localeCompare(b.nombre, 'es')))
      setMiembrosClub(lista)
    },
    [supabase, userId]
  )

  const cargarLibrosDelClub = useCallback(
    async (clubId: string) => {
      setCargandoLibros(true)
      setGeneroFiltro('Todos')
      setFiltroAlcance('todos')
      setBusqueda('')

      const { data: compartidos } = await supabase
        .from('ejemplares_club')
        .select('ejemplar_id')
        .eq('club_id', clubId)

      if (!compartidos || compartidos.length === 0) {
        setLibrosClub([])
        setCargandoLibros(false)
        return
      }

      const ejemplarIds = compartidos.map((c) => c.ejemplar_id)

      const { data: ejemplaresData } = await supabase
        .from('ejemplares')
        .select('id, isbn, estado, propietario_id')
        .in('id', ejemplarIds)

      if (!ejemplaresData || ejemplaresData.length === 0) {
        setLibrosClub([])
        setCargandoLibros(false)
        return
      }

      const ownerIds = Array.from(new Set(ejemplaresData.map((e) => e.propietario_id)))
      const isbns = Array.from(new Set(ejemplaresData.map((e) => e.isbn)))

      const [{ data: perfilesData }, { data: catalogoData }, { data: resenasData }] =
        await Promise.all([
          supabase.from('perfiles').select('id, nombre, nombre_usuario').in('id', ownerIds),
          supabase
            .from('libros_catalogo')
            .select('isbn, titulo, autor, portada_url, genero, sinopsis, premios')
            .in('isbn', isbns),
          supabase
            .from('resenas_libro')
            .select('isbn, puntuacion')
            .in('isbn', isbns),
        ])

      const combinados: EjemplarClub[] = ejemplaresData.map((ej) => {
        const perfil = perfilesData?.find((p) => p.id === ej.propietario_id)
        const esMio = ej.propietario_id === userId
        const resenasLibro = resenasData?.filter((r) => r.isbn === ej.isbn) || []
        const media =
          resenasLibro.length > 0
            ? (
                resenasLibro.reduce((acc, r) => acc + r.puntuacion, 0) / resenasLibro.length
              ).toFixed(1)
            : null

        return {
          id: ej.id,
          isbn: ej.isbn,
          estado: ej.estado,
          propietario_id: ej.propietario_id,
          propietario_nombre: esMio
            ? 'Tú'
            : perfil?.nombre || perfil?.nombre_usuario || `Miembro #${ej.propietario_id.slice(0, 4)}`,
          resenas_count: resenasLibro.length,
          media_estrellas: media,
          libros_catalogo: catalogoData?.find((c) => c.isbn === ej.isbn) || {
            isbn: ej.isbn,
            titulo: `ISBN: ${ej.isbn}`,
            autor: 'Sin datos en catálogo',
            portada_url: '',
            genero: 'Otros',
            sinopsis: null,
            premios: null,
          },
        }
      })

      combinados.sort((a, b) => {
        const esMioA = a.propietario_id === userId ? 1 : 0
        const esMioB = b.propietario_id === userId ? 1 : 0
        if (esMioA !== esMioB) return esMioA - esMioB

        const dispA = a.estado === 'disponible' ? 0 : 1
        const dispB = b.estado === 'disponible' ? 0 : 1
        if (dispA !== dispB) return dispA - dispB

        const tituloA = a.libros_catalogo?.titulo || ''
        const tituloB = b.libros_catalogo?.titulo || ''
        return tituloA.localeCompare(tituloB, 'es', { sensitivity: 'base' })
      })

      setLibrosClub(combinados)
      setCargandoLibros(false)
    },
    [supabase, userId]
  )

  useEffect(() => {
    cargarMisClubes()
    cargarMisDeseos()
  }, [cargarMisClubes, cargarMisDeseos])

  useEffect(() => {
    if (clubActivo) {
      cargarLibrosDelClub(clubActivo.id)
      cargarMiembrosDelClub(clubActivo.id)
      setMenuCompartirAbierto(false)
      setMostrarMiembros(false)
    }
  }, [clubActivo, cargarLibrosDelClub, cargarMiembrosDelClub])

  const handleExpulsarMiembro = async (
    clubId: string,
    miembroUserId: string,
    nombreMiembro: string
  ) => {
    if (miembroUserId === userId) return
    const confirmado = window.confirm(
      `¿Expulsar a ${nombreMiembro} de este club? Sus libros dejarán de verse en el grupo.`
    )
    if (!confirmado) return

    const { error } = await supabase
      .from('miembros_club')
      .delete()
      .eq('club_id', clubId)
      .eq('usuario_id', miembroUserId)

    if (error) {
      alert(`No se pudo eliminar al usuario: ${error.message}`)
      return
    }

    await Promise.all([cargarMiembrosDelClub(clubId), cargarLibrosDelClub(clubId)])
  }

  const handleEliminarClub = async (clubId: string, nombreClub: string) => {
    const confirmado = window.confirm(
      `¿Eliminar definitivamente el club «${nombreClub}»? Esta acción expulsará a todos los miembros y no se puede deshacer.`
    )
    if (!confirmado) return

    const { error } = await supabase
      .from('clubes')
      .delete()
      .eq('id', clubId)
      .eq('creado_por', userId)

    if (error) {
      alert(`No se pudo eliminar el club: ${error.message}`)
      return
    }

    await cargarMisClubes()
  }

  const crearClub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombreNuevoClub.trim() || procesando) return
    setProcesando(true)

    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: nuevoClub, error } = await supabase
      .from('clubes')
      .insert({
        nombre: nombreNuevoClub.trim(),
        codigo_invitacion: codigo,
        creado_por: userId,
        es_privado: true,
      })
      .select()
      .single()

    if (error || !nuevoClub) {
      alert(`Error al crear el club: ${error?.message || 'Desconocido'}`)
      setProcesando(false)
      return
    }

    const { error: miembroError } = await supabase.from('miembros_club').insert({
      club_id: nuevoClub.id,
      usuario_id: userId,
      rol: 'admin',
    })

    if (miembroError) {
      alert(`Club creado, pero hubo un error al añadirte como miembro: ${miembroError.message}`)
    }

    setNombreNuevoClub('')
    setModoFormulario('ninguno')
    setProcesando(false)
    await cargarMisClubes()
    setClubActivo(nuevoClub)
  }

  const unirseAClub = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = codigoUnirse.trim().toUpperCase()
    if (!cleanCode || procesando) return
    setProcesando(true)

    const { data: clubEncontrado, error } = await supabase
      .from('clubes')
      .select('id, nombre, codigo_invitacion, creado_por')
      .eq('codigo_invitacion', cleanCode)
      .maybeSingle()

    if (error || !clubEncontrado) {
      alert('No existe ningún club con ese código de invitación.')
      setProcesando(false)
      return
    }

    const { error: joinError } = await supabase.from('miembros_club').insert({
      club_id: clubEncontrado.id,
      usuario_id: userId,
      rol: 'miembro',
    })

    if (joinError && joinError.code !== '23505') {
      alert(`No se pudo unir al club: ${joinError.message}`)
      setProcesando(false)
      return
    }

    setCodigoUnirse('')
    setModoFormulario('ninguno')
    setProcesando(false)
    await cargarMisClubes()
    setClubActivo(clubEncontrado)
  }

  const toggleDeseo = async (ejemplar: EjemplarClub) => {
    if (guardandoDeseoId) return
    setGuardandoDeseoId(ejemplar.id)
    const yaGuardado = deseosIsbns.has(ejemplar.isbn)

    if (yaGuardado) {
      const { error } = await supabase
        .from('lista_deseos')
        .delete()
        .eq('usuario_id', userId)
        .eq('isbn', ejemplar.isbn)

      if (!error) {
        setDeseosIsbns((prev) => {
          const copia = new Set(prev)
          copia.delete(ejemplar.isbn)
          return copia
        })
      }
    } else {
      const { error } = await supabase.from('lista_deseos').upsert(
        {
          usuario_id: userId,
          ejemplar_id: ejemplar.id,
          club_id: clubActivo?.id || null,
          isbn: ejemplar.isbn,
          titulo: ejemplar.libros_catalogo.titulo,
          autor: ejemplar.libros_catalogo.autor,
          portada_url: ejemplar.libros_catalogo.portada_url || '',
          propietario_nombre: ejemplar.propietario_nombre,
        },
        { onConflict: 'usuario_id,isbn' }
      )

      if (!error) {
        setDeseosIsbns((prev) => new Set(prev).add(ejemplar.isbn))
      } else {
        alert(`No se pudo guardar en ¡Me lo apunto!: ${error.message}`)
      }
    }

    setGuardandoDeseoId(null)
  }

  const solicitarPrestamo = async (ejemplar: EjemplarClub) => {
    if (
      !clubActivo ||
      ejemplar.propietario_id === userId ||
      ejemplar.estado !== 'disponible' ||
      solicitandoId
    ) {
      return
    }
    setSolicitandoId(ejemplar.id)

    const { error } = await supabase.from('prestamos').insert({
      ejemplar_id: ejemplar.id,
      propietario_id: ejemplar.propietario_id,
      lector_id: userId,
      club_id: clubActivo.id,
      estado: 'solicitado',
    })

    if (error) {
      setSolicitandoId(null)
      alert(`No se pudo solicitar el préstamo: ${error.message}`)
      return
    }

    const { data: miPerfil } = await supabase
      .from('perfiles')
      .select('nombre, nombre_usuario')
      .eq('id', userId)
      .maybeSingle()

    const nombreSolicitante =
      miPerfil?.nombre || miPerfil?.nombre_usuario || 'Un miembro del club'

    await Promise.allSettled([
      enviarNotificacionPush({
        destinatarioId: ejemplar.propietario_id,
        titulo: `Nueva solicitud en ${clubActivo.nombre}`,
        cuerpo: `${nombreSolicitante} te ha pedido prestado "${ejemplar.libros_catalogo.titulo}"`,
        url: '/',
      }),
      enviarNotificacionEmail({
        tipo: 'usuario',
        destinatarioId: ejemplar.propietario_id,
        asunto: `Exlibris · Solicitud de "${ejemplar.libros_catalogo.titulo}"`,
        titulo: `Nueva solicitud de préstamo en ${clubActivo.nombre}`,
        cuerpo: `${nombreSolicitante} te ha pedido prestado "${ejemplar.libros_catalogo.titulo}".\n\nEntra en la pestaña Préstamos de Exlibris para aceptarla o rechazarla.`,
        url: 'https://exlibris-app.vercel.app',
      }),
    ])

    setSolicitandoId(null)
    alert(`Solicitud enviada a ${ejemplar.propietario_nombre}.`)
    onSolicitado()
  }

  const copiarCodigo = () => {
    if (!clubActivo) return
    navigator.clipboard.writeText(clubActivo.codigo_invitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const generarDatosInvitacion = () => {
    if (!clubActivo) return { url: '', texto: '', asunto: '' }
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://exlibris-app.vercel.app'
    const url = `${origin}/?unirse=${clubActivo.codigo_invitacion}`
    const asunto = `Únete a nuestro club de lectura "${clubActivo.nombre}" en Exlibris`
    const texto = `¡Hola! Te invito a nuestro club de lectura "${clubActivo.nombre}" en Exlibris para compartir libros entre nosotros.\n\nCódigo de invitación: ${clubActivo.codigo_invitacion}\nEntra aquí: ${url}`
    return { url, texto, asunto }
  }

  const compartirClubNativo = async () => {
    if (!clubActivo) return
    const { url, texto, asunto } = generarDatosInvitacion()

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: asunto,
          text: texto,
          url,
        })
        setMenuCompartirAbierto(false)
        return
      } catch {
        // Si el usuario cancela o falla, abrimos el menú desplegable
      }
    }
    setMenuCompartirAbierto((prev) => !prev)
  }

  const copiarInvitacionCompleta = () => {
    const { texto } = generarDatosInvitacion()
    if (!texto) return
    navigator.clipboard.writeText(texto)
    setInvitacionCopiada(true)
    setTimeout(() => {
      setInvitacionCopiada(false)
      setMenuCompartirAbierto(false)
    }, 1800)
  }

  const abrirDetalleClub = (item: EjemplarClub) => {
    const esMio = item.propietario_id === userId
    setLibroSeleccionado({
      ejemplarId: item.id,
      estado: item.estado,
      propietarioId: item.propietario_id,
      propietarioNombre: item.propietario_nombre,
      esPropio: esMio,
      isbn: item.libros_catalogo.isbn,
      titulo: item.libros_catalogo.titulo,
      autor: item.libros_catalogo.autor,
      portada_url: item.libros_catalogo.portada_url,
      genero: item.libros_catalogo.genero,
      sinopsis: item.libros_catalogo.sinopsis,
      premios: item.libros_catalogo.premios,
      clubId: clubActivo?.id || null,
      clubNombre: clubActivo?.nombre || null,
    })
  }

  const librosBaseFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return librosClub.filter((l) => {
      if (filtroAlcance === 'ajenos' && l.propietario_id === userId) return false
      if (filtroAlcance === 'disponibles' && l.estado !== 'disponible') return false
      if (termino) {
        const coincide =
          l.libros_catalogo?.titulo?.toLowerCase().includes(termino) ||
          l.libros_catalogo?.autor?.toLowerCase().includes(termino) ||
          l.propietario_nombre.toLowerCase().includes(termino)
        if (!coincide) return false
      }
      return true
    })
  }, [librosClub, busqueda, filtroAlcance, userId])

  const conteoPorGenero = useMemo(() => {
    return librosBaseFiltrados.reduce<Record<string, number>>((acc, item) => {
      const g = item.libros_catalogo?.genero || 'Otros'
      acc[g] = (acc[g] || 0) + 1
      return acc
    }, {})
  }, [librosBaseFiltrados])

  const generosDisponibles = useMemo(() => {
    const presentes = Object.keys(conteoPorGenero).sort((a, b) => a.localeCompare(b, 'es'))
    return ['Todos', ...presentes]
  }, [conteoPorGenero])

  const librosFiltrados = useMemo(() => {
    if (generoFiltro === 'Todos') return librosBaseFiltrados
    return librosBaseFiltrados.filter(
      (l) => (l.libros_catalogo?.genero || 'Otros') === generoFiltro
    )
  }, [librosBaseFiltrados, generoFiltro])

  const contadoresAlcance = useMemo(() => {
    const ajenos = librosClub.filter((l) => l.propietario_id !== userId).length
    const disponibles = librosClub.filter((l) => l.estado === 'disponible').length
    return { ajenos, disponibles }
  }, [librosClub, userId])

  if (cargandoClubes) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Cargando tus clubes de lectura...
      </div>
    )
  }

  const datosCompartir = generarDatosInvitacion()
  const esCreadorClubActivo = clubActivo?.creado_por === userId

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Mis Clubes</h1>
          <p className="text-xs text-stone-500">
            {librosClub.length} {librosClub.length === 1 ? 'libro compartido' : 'libros compartidos'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModoFormulario(modoFormulario === 'unirse' ? 'ninguno' : 'unirse')}
            className="py-2 px-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 font-medium rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Unirme</span>
          </button>
          <button
            type="button"
            onClick={() => setModoFormulario(modoFormulario === 'crear' ? 'ninguno' : 'crear')}
            className="py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear club</span>
          </button>
        </div>
      </div>

      {modoFormulario === 'crear' && (
        <form
          onSubmit={crearClub}
          className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3"
        >
          <label className="block text-xs font-semibold text-stone-700">
            Nombre del nuevo club de lectura
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nombreNuevoClub}
              onChange={(e) => setNombreNuevoClub(e.target.value)}
              placeholder="Ej. Lectores Donostia"
              className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
              required
            />
            <button
              type="submit"
              disabled={procesando}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Crear
            </button>
          </div>
        </form>
      )}

      {modoFormulario === 'unirse' && (
        <form
          onSubmit={unirseAClub}
          className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3"
        >
          <label className="block text-xs font-semibold text-stone-700">
            Código de invitación del club
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={codigoUnirse}
              onChange={(e) => setCodigoUnirse(e.target.value.toUpperCase())}
              placeholder="Ej. A1B2C3"
              className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-xs uppercase font-mono focus:outline-none focus:border-emerald-600"
              required
            />
            <button
              type="submit"
              disabled={procesando}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Entrar
            </button>
          </div>
        </form>
      )}

      {clubes.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="text-center max-w-sm mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              <Users className="w-3.5 h-3.5" />
              <span>Vista previa de un club</span>
            </span>
            <h2 className="font-bold text-stone-900 text-base">
              Comparte estantería con tu grupo
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed">
              Crea un club privado para tus amigos, familia o compañeros y pide prestados sus libros con un toque.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 max-w-md mx-auto select-none pointer-events-none">
            {[
              {
                titulo: 'El infinito en un junco',
                dueno: 'De Ane',
                nota: '4.9',
                color: 'from-stone-800 to-stone-950',
              },
              {
                titulo: 'Cien años de soledad',
                dueno: 'De Mikel',
                nota: '4.8',
                color: 'from-emerald-900 to-stone-950',
              },
              {
                titulo: 'Dune',
                dueno: 'De Jabi',
                nota: '4.7',
                color: 'from-amber-900 to-stone-950',
              },
            ].map((ejemplo) => (
              <div
                key={ejemplo.titulo}
                className="bg-stone-50 rounded-xl border border-dashed border-stone-300 overflow-hidden opacity-75 flex flex-col"
              >
                <div
                  className={`aspect-[2/3] bg-gradient-to-br ${ejemplo.color} p-2.5 flex flex-col justify-between relative text-white`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded">
                      Ejemplo
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white/80" />
                  </div>
                  <div>
                    <p className="font-serif font-bold text-[11px] leading-tight line-clamp-3">
                      {ejemplo.titulo}
                    </p>
                    <p className="text-[9px] text-amber-300 font-semibold mt-1">
                      ★ {ejemplo.nota}
                    </p>
                  </div>
                </div>
                <div className="p-2 bg-white space-y-1">
                  <p className="font-semibold text-stone-800 text-[10px] truncate">
                    {ejemplo.titulo}
                  </p>
                  <p className="text-[9px] text-stone-500 truncate">{ejemplo.dueno}</p>
                  <div className="py-1 bg-emerald-700/90 text-white rounded-md text-[9px] font-semibold text-center">
                    Pedir
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setModoFormulario('crear')}
              className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear mi primer club</span>
            </button>
            <button
              type="button"
              onClick={() => setModoFormulario('unirse')}
              className="py-2.5 px-4 bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Tengo un código</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {clubes.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => setClubActivo(club)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    clubActivo?.id === club.id
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {club.nombre}
                </button>
              ))}
            </div>

            {clubActivo && (
              <div className="relative flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setMostrarMiembros((prev) => !prev)}
                  className="px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[11px] font-medium text-stone-700 hover:bg-stone-50 flex items-center gap-1 cursor-pointer"
                  title="Ver miembros del club"
                >
                  <Users className="w-3.5 h-3.5 text-stone-500" />
                  <span>{miembrosClub.length}</span>
                </button>

                <button
                  type="button"
                  onClick={copiarCodigo}
                  className="px-2.5 py-1.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-[11px] font-medium text-emerald-900 hover:bg-emerald-100 flex items-center gap-1.5 cursor-pointer"
                  title="Copiar código de invitación"
                >
                  <span className="text-emerald-700">Código:</span>
                  <strong className="font-mono tracking-wider">
                    {clubActivo.codigo_invitacion}
                  </strong>
                  {copiado ? (
                    <Check className="w-3 h-3 text-emerald-700" />
                  ) : (
                    <Copy className="w-3 h-3 text-emerald-700" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={compartirClubNativo}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                  title="Compartir invitación del club"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Compartir</span>
                </button>

                {menuCompartirAbierto && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-stone-200 rounded-2xl shadow-lg p-1.5 z-30 space-y-0.5">
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-stone-100">
                      <span className="text-[11px] font-bold text-stone-800">
                        Invitar al club
                      </span>
                      <button
                        type="button"
                        onClick={() => setMenuCompartirAbierto(false)}
                        className="text-stone-400 hover:text-stone-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(datosCompartir.texto)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuCompartirAbierto(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 transition"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>

                    <a
                      href={`mailto:?subject=${encodeURIComponent(datosCompartir.asunto)}&body=${encodeURIComponent(datosCompartir.texto)}`}
                      onClick={() => setMenuCompartirAbierto(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
                    >
                      <Mail className="w-4 h-4 text-sky-600" />
                      <span>Correo electrónico</span>
                    </a>

                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(datosCompartir.url)}&text=${encodeURIComponent(`Únete a "${clubActivo.nombre}" en Exlibris · Código: ${clubActivo.codigo_invitacion}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuCompartirAbierto(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
                    >
                      <Send className="w-4 h-4 text-sky-500" />
                      <span>Telegram</span>
                    </a>

                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`¡Compartimos estantería en "${clubActivo.nombre}" en Exlibris! Código: ${clubActivo.codigo_invitacion} ${datosCompartir.url}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuCompartirAbierto(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
                    >
                      <Share2 className="w-4 h-4 text-stone-700" />
                      <span>X / Redes sociales</span>
                    </a>

                    <button
                      type="button"
                      onClick={copiarInvitacionCompleta}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-100 transition cursor-pointer border-t border-stone-100 mt-1 pt-2"
                    >
                      {invitacionCopiada ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">
                            ¡Invitación copiada!
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-stone-500" />
                          <span>Copiar mensaje y enlace</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {clubActivo && mostrarMiembros && (
            <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  Miembros de {clubActivo.nombre} ({miembrosClub.length})
                </span>
                <button
                  type="button"
                  onClick={() => setMostrarMiembros(false)}
                  className="text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-stone-100">
                {miembrosClub.map((m) => (
                  <div
                    key={m.usuario_id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-stone-800 truncate">{m.nombre}</span>
                      {m.usuario_id === clubActivo.creado_por && (
                        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          Creador
                        </span>
                      )}
                    </div>
                    {esCreadorClubActivo && m.usuario_id !== userId && (
                      <button
                        type="button"
                        onClick={() =>
                          handleExpulsarMiembro(clubActivo.id, m.usuario_id, m.nombre)
                        }
                        title="Expulsar del club"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Expulsar</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {librosClub.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por título, autor o miembro..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      onClick={() => setBusqueda('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center bg-white border border-stone-200 rounded-xl p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVistaClub('grid')}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaClub === 'grid'
                        ? 'bg-emerald-700 text-white'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Vista cuadrícula de portadas"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaClub('lista')}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaClub === 'lista'
                        ? 'bg-emerald-700 text-white'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Vista lista detallada"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {(
                    [
                      { id: 'todos', label: `Todos (${librosClub.length})` },
                      { id: 'ajenos', label: `De amigos (${contadoresAlcance.ajenos})` },
                      {
                        id: 'disponibles',
                        label: `Disponibles (${contadoresAlcance.disponibles})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroAlcance(f.id)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                        filtroAlcance === f.id
                          ? 'bg-stone-900 text-white'
                          : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {generosDisponibles.length > 2 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {generosDisponibles.map((gen) => {
                      const cantidad =
                        gen === 'Todos'
                          ? librosBaseFiltrados.length
                          : conteoPorGenero[gen] || 0
                      return (
                        <button
                          key={gen}
                          type="button"
                          onClick={() => setGeneroFiltro(gen)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition flex items-center gap-1 cursor-pointer ${
                            generoFiltro === gen
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'
                          }`}
                        >
                          {gen !== 'Todos' && <Tag className="w-2.5 h-2.5 opacity-75" />}
                          <span>{gen}</span>
                          <span
                            className={`text-[10px] px-1 rounded-full ${
                              generoFiltro === gen
                                ? 'bg-emerald-800 text-emerald-100'
                                : 'text-stone-500'
                            }`}
                          >
                            {cantidad}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {cargandoLibros ? (
            <div className="py-10 text-center text-xs text-stone-500">
              Cargando biblioteca del club...
            </div>
          ) : librosClub.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-xs text-stone-500">
              Aún no hay libros compartidos en este club. Abre cualquier libro de tu Estantería para activarlo aquí.
            </div>
          ) : librosFiltrados.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold text-stone-700">
                No hay libros que coincidan con este filtro dentro del club
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('')
                  setFiltroAlcance('todos')
                  setGeneroFiltro('Todos')
                }}
                className="mt-3 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium cursor-pointer"
              >
                Limpiar filtros
              </button>
            </div>
          ) : vistaClub === 'grid' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3">
              {librosFiltrados.map((item) => {
                const esMio = item.propietario_id === userId
                return (
                  <div
                    key={item.id}
                    onClick={() => abrirDetalleClub(item)}
                    className="group bg-white rounded-xl border border-stone-200/90 overflow-hidden shadow-2xs flex flex-col cursor-pointer hover:border-emerald-500 hover:shadow-sm transition"
                  >
                    <div className="aspect-[2/3] bg-stone-100 relative overflow-hidden">
                      <PortadaLibro
                        src={item.libros_catalogo?.portada_url}
                        alt={item.libros_catalogo?.titulo || 'Libro'}
                        isbn={item.isbn}
                      />

                      {item.libros_catalogo?.premios && (
                        <span
                          title={item.libros_catalogo.premios}
                          className="absolute top-1.5 left-1.5 bg-amber-400/95 text-amber-950 p-1 rounded-full shadow-2xs"
                        >
                          <Award className="w-2.5 h-2.5" />
                        </span>
                      )}

                      {item.estado === 'disponible' ? (
                        <span
                          title="Disponible"
                          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-2xs"
                        />
                      ) : (
                        <span
                          className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs ${
                            item.estado === 'prestado'
                              ? 'bg-blue-600/95 text-white'
                              : 'bg-amber-500/95 text-white'
                          }`}
                        >
                          {item.estado === 'prestado' ? 'Prestado' : 'No disp.'}
                        </span>
                      )}

                      {item.media_estrellas && (
                        <span className="absolute bottom-1.5 left-1.5 bg-stone-900/85 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span>{item.media_estrellas}</span>
                        </span>
                      )}
                    </div>

                    <div className="p-2 flex-1 flex flex-col justify-between gap-1.5">
                      <div>
                        <h3 className="font-semibold text-stone-900 text-[11px] leading-snug line-clamp-2 group-hover:text-emerald-800 transition">
                          {item.libros_catalogo?.titulo}
                        </h3>
                        <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                          {esMio ? (
                            <span className="text-stone-400">Tuyo</span>
                          ) : (
                            <>
                              De <strong className="text-stone-700">{item.propietario_nombre}</strong>
                            </>
                          )}
                        </p>
                      </div>

                      {!esMio && (
                        <div className="flex items-center gap-1 pt-0.5">
                          {item.estado === 'disponible' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                solicitarPrestamo(item)
                              }}
                              disabled={solicitandoId === item.id}
                              className="flex-1 py-1 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                            >
                              <Send className="w-2.5 h-2.5" />
                              <span>{solicitandoId === item.id ? 'Pidiendo...' : 'Pedir'}</span>
                            </button>
                          ) : (
                            <span className="flex-1 text-[10px] text-stone-400 truncate">
                              En préstamo
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleDeseo(item)
                            }}
                            disabled={guardandoDeseoId === item.id}
                            title={
                              deseosIsbns.has(item.isbn)
                                ? 'Quitar de mi lista ¡Me lo apunto!'
                                : 'Guardar en mi lista ¡Me lo apunto!'
                            }
                            className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
                              deseosIsbns.has(item.isbn)
                                ? 'bg-amber-50 border-amber-300 text-amber-700'
                                : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
                            }`}
                          >
                            {deseosIsbns.has(item.isbn) ? (
                              <BookmarkCheck className="w-3 h-3" />
                            ) : (
                              <Bookmark className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {librosFiltrados.map((item) => {
                const esMio = item.propietario_id === userId
                return (
                  <div
                    key={item.id}
                    onClick={() => abrirDetalleClub(item)}
                    className="bg-white rounded-xl border border-stone-200 p-2.5 flex items-center gap-3 cursor-pointer hover:border-emerald-500 transition"
                  >
                    <div className="w-11 h-16 rounded-lg overflow-hidden bg-stone-100 shrink-0 relative">
                      <PortadaLibro
                        src={item.libros_catalogo?.portada_url}
                        alt={item.libros_catalogo?.titulo || 'Libro'}
                        isbn={item.isbn}
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

                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-[10px] text-stone-500">
                            De: <strong className="text-stone-700">{item.propietario_nombre}</strong>
                          </span>
                          {item.libros_catalogo?.genero && (
                            <span className="text-[10px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md truncate">
                              {item.libros_catalogo.genero}
                            </span>
                          )}
                          {item.media_estrellas && (
                            <span className="text-[10px] font-semibold text-amber-700 inline-flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                              {item.media_estrellas} ({item.resenas_count})
                            </span>
                          )}
                        </div>

                        {!esMio ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.estado === 'disponible' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  solicitarPrestamo(item)
                                }}
                                disabled={solicitandoId === item.id}
                                className="py-1 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Send className="w-2.5 h-2.5" />
                                <span>{solicitandoId === item.id ? 'Pidiendo...' : 'Pedir'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleDeseo(item)
                              }}
                              disabled={guardandoDeseoId === item.id}
                              title={
                                deseosIsbns.has(item.isbn)
                                  ? 'Quitar de mi lista ¡Me lo apunto!'
                                  : 'Guardar en mi lista ¡Me lo apunto!'
                              }
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                deseosIsbns.has(item.isbn)
                                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                                  : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
                              }`}
                            >
                              {deseosIsbns.has(item.isbn) ? (
                                <BookmarkCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="shrink-0 text-[10px] text-emerald-700 font-medium flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" />
                            <span>Ficha</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {clubActivo && esCreadorClubActivo && (
            <div className="pt-4 mt-6 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => handleEliminarClub(clubActivo.id, clubActivo.nombre)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar club</span>
              </button>
            </div>
          )}
        </>
      )}

      <LibroModal
        libro={libroSeleccionado}
        onClose={() => {
          setLibroSeleccionado(null)
          if (clubActivo) cargarLibrosDelClub(clubActivo.id)
        }}
        onActualizado={() => clubActivo && cargarLibrosDelClub(clubActivo.id)}
      />
    </div>
  )
}