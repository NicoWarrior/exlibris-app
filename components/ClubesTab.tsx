'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { enviarNotificacionPush } from '@/utils/notificaciones'
import { GENEROS_ESTANDAR } from '@/utils/generos'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import {
  Award,
  Check,
  Copy,
  KeyRound,
  MessageSquare,
  Plus,
  Search,
  Send,
  Star,
  Tag,
  Users,
  X,
} from 'lucide-react'

interface Club {
  id: string
  nombre: string
  codigo_invitacion: string
  creado_por: string
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

  const [busqueda, setBusqueda] = useState('')
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)

  const [cargandoClubes, setCargandoClubes] = useState(true)
  const [cargandoLibros, setCargandoLibros] = useState(false)

  const [modoFormulario, setModoFormulario] = useState<'ninguno' | 'crear' | 'unirse'>('ninguno')
  const [nombreNuevoClub, setNombreNuevoClub] = useState('')
  const [codigoUnirse, setCodigoUnirse] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)

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

  const cargarLibrosDelClub = useCallback(
    async (clubId: string) => {
      setCargandoLibros(true)
      setGeneroFiltro('Todos')
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
            .eq('club_id', clubId)
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

      setLibrosClub(combinados)
      setCargandoLibros(false)
    },
    [supabase, userId]
  )

  useEffect(() => {
    cargarMisClubes()
  }, [cargarMisClubes])

  useEffect(() => {
    if (clubActivo) {
      cargarLibrosDelClub(clubActivo.id)
    }
  }, [clubActivo, cargarLibrosDelClub])

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

    setSolicitandoId(null)
    if (error) {
      alert(`No se pudo solicitar el préstamo: ${error.message}`)
    } else {
      enviarNotificacionPush({
        destinatarioId: ejemplar.propietario_id,
        titulo: `Nueva solicitud en ${clubActivo.nombre}`,
        cuerpo: `Te han pedido prestado "${ejemplar.libros_catalogo.titulo}"`,
        url: '/',
      })
      alert(`Solicitud enviada a ${ejemplar.propietario_nombre}.`)
      onSolicitado()
    }
  }

  const copiarCodigo = () => {
    if (!clubActivo) return
    navigator.clipboard.writeText(clubActivo.codigo_invitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const termino = busqueda.trim().toLowerCase()
  const librosPorTexto = termino
    ? librosClub.filter(
        (l) =>
          l.libros_catalogo?.titulo?.toLowerCase().includes(termino) ||
          l.libros_catalogo?.autor?.toLowerCase().includes(termino) ||
          l.propietario_nombre.toLowerCase().includes(termino)
      )
    : librosClub

  const conteoPorGenero = librosPorTexto.reduce<Record<string, number>>((acc, item) => {
    const g = item.libros_catalogo?.genero || 'Otros'
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {})

  const generosDisponibles = [
    'Todos',
    ...GENEROS_ESTANDAR.filter((g) => g !== 'Otros' || (conteoPorGenero['Otros'] || 0) > 0),
  ]

  const librosFiltrados =
    generoFiltro === 'Todos'
      ? librosPorTexto
      : librosPorTexto.filter((l) => (l.libros_catalogo?.genero || 'Otros') === generoFiltro)

  if (cargandoClubes) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Cargando tus clubes de lectura...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Mis Clubes</h1>
          <p className="text-xs text-stone-500">
            Comparte estantería, reseña lecturas y pide libros en tus grupos
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
            className="py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear club</span>
          </button>
        </div>
      </div>

      {modoFormulario === 'crear' && (
        <form
          onSubmit={crearClub}
          className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3"
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
          className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3"
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
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h2 className="font-semibold text-stone-800 mb-1 text-sm">
            Aún no perteneces a ningún club
          </h2>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            Crea un club privado y comparte el código con tus amigos, o únete usando un código que te hayan pasado.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {clubes.map((club) => (
              <button
                key={club.id}
                type="button"
                onClick={() => setClubActivo(club)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
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
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-emerald-900">
                  Código para invitar amigos a <strong>{clubActivo.nombre}</strong>:
                </p>
                <p className="text-sm font-mono font-bold text-emerald-800 tracking-wider mt-0.5">
                  {clubActivo.codigo_invitacion}
                </p>
              </div>
              <button
                type="button"
                onClick={copiarCodigo}
                className="px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5 cursor-pointer"
              >
                {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiado ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          )}

          {librosClub.length > 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por título, autor o amigo..."
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

              <div className="flex gap-1.5 overflow-x-auto pb-1.5">
                {generosDisponibles.map((gen) => {
                  const cantidad =
                    gen === 'Todos' ? librosPorTexto.length : conteoPorGenero[gen] || 0
                  return (
                    <button
                      key={gen}
                      type="button"
                      onClick={() => setGeneroFiltro(gen)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                        generoFiltro === gen
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {gen !== 'Todos' && <Tag className="w-3 h-3 opacity-75" />}
                      <span>{gen}</span>
                      {cantidad > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            generoFiltro === gen
                              ? 'bg-emerald-800 text-emerald-100'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {cantidad}
                        </span>
                      )}
                    </button>
                  )
                })}
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
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-xs text-stone-500">
              No hay libros que coincidan con este filtro dentro del club.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {librosFiltrados.map((item) => {
                const esMio = item.propietario_id === userId
                return (
                  <div
                    key={item.id}
                    onClick={() =>
                      setLibroSeleccionado({
                        ejemplarId: item.id,
                        estado: item.estado,
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
                    className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs flex flex-col cursor-pointer hover:border-emerald-500 transition"
                  >
                    <div className="aspect-[2/3] bg-stone-100 relative">
                      {item.libros_catalogo?.portada_url ? (
                        <img
                          src={item.libros_catalogo.portada_url}
                          alt={item.libros_catalogo.titulo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs p-4 text-center">
                          Sin portada
                        </div>
                      )}

                      {item.libros_catalogo?.premios && (
                        <span
                          title={item.libros_catalogo.premios}
                          className="absolute top-2 left-2 bg-amber-400/95 text-amber-950 p-1 rounded-full shadow-xs"
                        >
                          <Award className="w-3 h-3" />
                        </span>
                      )}

                      <span
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs ${
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

                      {item.media_estrellas && (
                        <span className="absolute bottom-2 left-2 bg-stone-900/85 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span>{item.media_estrellas}</span>
                          <span className="text-stone-300">({item.resenas_count})</span>
                        </span>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                      <div>
                        <h3 className="font-semibold text-stone-900 text-xs line-clamp-2">
                          {item.libros_catalogo?.titulo}
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                          {item.libros_catalogo?.autor}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-stone-400">
                            De: <strong className="text-stone-600">{item.propietario_nombre}</strong>
                          </p>
                          <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5">
                            <MessageSquare className="w-2.5 h-2.5" />
                            <span>Reseñar</span>
                          </span>
                        </div>
                      </div>

                      {!esMio && item.estado === 'disponible' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            solicitarPrestamo(item)
                          }}
                          disabled={solicitandoId === item.id}
                          className="w-full py-1.5 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>
                            {solicitandoId === item.id ? 'Pidiendo...' : 'Pedir prestado'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
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