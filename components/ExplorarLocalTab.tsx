'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import PortadaLibro from '@/components/PortadaLibro'
import { enviarNotificacionPush } from '@/utils/notificaciones'
import MapaPuntosExlibris from '@/components/MapaPuntosExlibris'
import TablonEventosTab from '@/components/TablonEventosTab'
import {
  Award,
  Bookmark,
  BookmarkCheck,
  LayoutGrid,
  List,
  MapPin,
  Megaphone,
  Search,
  Send,
  ShieldCheck,
  Star,
  Tag,
  UserCircle2,
  X,
} from 'lucide-react'

interface EjemplarLocal {
  id: string
  isbn: string
  estado: string
  propietario_id: string
  codigo_postal: string
  municipio: string | null
  prioridad_cercania: number
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

interface ExplorarLocalTabProps {
  userId: string
  onAbrirPerfil: () => void
  onSolicitado: () => void
}

function calcularPrioridadCp(cpItem: string, cpBuscado: string): number {
  const a = cpItem.trim()
  const b = cpBuscado.trim()
  if (a === b) return 0
  if (a.slice(0, 4) === b.slice(0, 4)) return 1
  if (a.slice(0, 3) === b.slice(0, 3)) return 2
  if (a.slice(0, 2) === b.slice(0, 2)) return 3
  return 4
}

export default function ExplorarLocalTab({
  userId,
  onAbrirPerfil,
  onSolicitado,
}: ExplorarLocalTabProps) {
  const supabase = createClient()
  const [cpActual, setCpActual] = useState<string>('')
  const [cpInput, setCpInput] = useState<string>('')
  const [librosZona, setLibrosZona] = useState<EjemplarLocal[]>([])
  const [vistaZona, setVistaZona] = useState<'grid' | 'lista'>('grid')
  const [busqueda, setBusqueda] = useState('')
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)

  const [cargandoPerfil, setCargandoPerfil] = useState(true)
  const [cargandoLibros, setCargandoLibros] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)
  const [deseosIsbns, setDeseosIsbns] = useState<Set<string>>(new Set())
  const [guardandoDeseoId, setGuardandoDeseoId] = useState<string | null>(null)
  const [mostrarMapa, setMostrarMapa] = useState(false)
  const [mostrarTablon, setMostrarTablon] = useState(false)



  const cargarMisDeseos = useCallback(async () => {
    const { data } = await supabase
      .from('lista_deseos')
      .select('isbn')
      .eq('usuario_id', userId)

    if (data) {
      setDeseosIsbns(new Set(data.map((d) => d.isbn)))
    }
  }, [supabase, userId])

const [eventosActivosCount, setEventosActivosCount] = useState(0)
const [hayEventosNuevos, setHayEventosNuevos] = useState(false)

const comprobarEventosZona = useCallback(
  async (cpLimpio: string) => {
    const ahoraIso = new Date().toISOString()
    const prefijoProvincia = cpLimpio.slice(0, 2)

    const { data: eventosData, count } = await supabase
      .from('eventos_literarios')
      .select('id, creado_en', { count: 'exact' })
      .like('codigo_postal', `${prefijoProvincia}%`)
      .gte('fecha_evento', ahoraIso)
      .order('creado_en', { ascending: false })
      .limit(1)

    const total = count || 0
    setEventosActivosCount(total)

    if (total > 0 && eventosData && eventosData[0] && typeof window !== 'undefined') {
      const claveVisto = `exlibris_tablon_ultimo_visto_${prefijoProvincia}`
      const ultimoVisto = window.localStorage.getItem(claveVisto)
      const ultimaMarca = eventosData[0].creado_en || String(eventosData[0].id)
      setHayEventosNuevos(ultimoVisto !== ultimaMarca)
    } else {
      setHayEventosNuevos(false)
    }
  },
  [supabase]
)

  const buscarEnCodigoPostal = useCallback(
    async (cp: string) => {
      const cpLimpio = cp.replace(/\D/g, '').slice(0, 5)
      if (cpLimpio.length !== 5) {
        setLibrosZona([])
        setEventosActivosCount(0)
        setHayEventosNuevos(false)
      return
      }

      setCargandoLibros(true)
      setCpActual(cpLimpio)
      setGeneroFiltro('Todos')

      // Buscamos por prefijo provincial (2 dígitos) para priorizar CP exacto y luego alrededores
      const prefijoProvincia = cpLimpio.slice(0, 2)

      const { data: vecinosData } = await supabase
        .from('perfiles')
        .select('id, codigo_postal, ciudad')
        .like('codigo_postal', `${prefijoProvincia}%`)
        .eq('busqueda_local_activa', true)
        .neq('id', userId)

      if (!vecinosData || vecinosData.length === 0) {
        setLibrosZona([])
        setCargandoLibros(false)
        return
      }

      const vecinoPorId = new Map(
        vecinosData
          .filter((v) => Boolean(v.codigo_postal))
          .map((v) => [v.id, v])
      )
      const vecinoIds = Array.from(vecinoPorId.keys())

      if (vecinoIds.length === 0) {
        setLibrosZona([])
        setCargandoLibros(false)
        return
      }

      const { data: ejemplaresData } = await supabase
        .from('ejemplares')
        .select('id, isbn, estado, propietario_id')
        .in('propietario_id', vecinoIds)
        .eq('visible_local', true)
        .eq('estado', 'disponible')

      if (!ejemplaresData || ejemplaresData.length === 0) {
        setLibrosZona([])
        setCargandoLibros(false)
        return
      }

      const isbns = Array.from(new Set(ejemplaresData.map((e) => e.isbn)))
      const [{ data: catalogoData }, { data: resenasData }] = await Promise.all([
        supabase
          .from('libros_catalogo')
          .select('isbn, titulo, autor, portada_url, genero, sinopsis, premios')
          .in('isbn', isbns),
        supabase.from('resenas_libro').select('isbn, puntuacion').in('isbn', isbns),
      ])

      const combinados: EjemplarLocal[] = ejemplaresData
        .map((ej) => {
          const vecino = vecinoPorId.get(ej.propietario_id)
          const cpVecino = vecino?.codigo_postal || cpLimpio
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
            codigo_postal: cpVecino,
            municipio: vecino?.ciudad || null,
            prioridad_cercania: calcularPrioridadCp(cpVecino, cpLimpio),
            resenas_count: resenasLibro.length,
            media_estrellas: media,
            libros_catalogo: catalogoData?.find((c) => c.isbn === ej.isbn) || {
              isbn: ej.isbn,
              titulo: `ISBN: ${ej.isbn}`,
              autor: 'Autor desconocido',
              portada_url: '',
              genero: 'Otros',
              sinopsis: null,
              premios: null,
            },
          }
        })
        .sort((a, b) => {
          if (a.prioridad_cercania !== b.prioridad_cercania) {
            return a.prioridad_cercania - b.prioridad_cercania
          }
          return a.libros_catalogo.titulo.localeCompare(b.libros_catalogo.titulo, 'es', {
            sensitivity: 'base',
          })
        })

      setLibrosZona(combinados)
      await comprobarEventosZona(cpLimpio)
      setCargandoLibros(false)
    },
    [supabase, userId, comprobarEventosZona]
    
    
  )

  useEffect(() => {
    const inicializar = async () => {
      setCargandoPerfil(true)
      const [{ data: perfil }] = await Promise.all([
        supabase.from('perfiles').select('codigo_postal').eq('id', userId).maybeSingle(),
        cargarMisDeseos(),
      ])

      if (perfil?.codigo_postal) {
        setCpInput(perfil.codigo_postal)
        await buscarEnCodigoPostal(perfil.codigo_postal)
      }
      setCargandoPerfil(false)
    }

    inicializar()
  }, [supabase, userId, buscarEnCodigoPostal, cargarMisDeseos])

  const handleBuscarCp = (e: React.FormEvent) => {
    e.preventDefault()
    if (cpInput.length === 5) {
      buscarEnCodigoPostal(cpInput)
    }
  }

  const toggleDeseo = async (ejemplar: EjemplarLocal) => {
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
      const etiquetaVecino = ejemplar.municipio
        ? `Vecino · ${ejemplar.municipio} (${ejemplar.codigo_postal})`
        : `Vecino · CP ${ejemplar.codigo_postal}`

      const { error } = await supabase.from('lista_deseos').upsert(
        {
          usuario_id: userId,
          ejemplar_id: ejemplar.id,
          club_id: null,
          isbn: ejemplar.isbn,
          titulo: ejemplar.libros_catalogo.titulo,
          autor: ejemplar.libros_catalogo.autor,
          portada_url: ejemplar.libros_catalogo.portada_url || '',
          propietario_nombre: etiquetaVecino,
        },
        { onConflict: 'usuario_id,isbn' }
      )

      if (!error) {
        setDeseosIsbns((prev) => new Set(prev).add(ejemplar.isbn))
      }
    }

    setGuardandoDeseoId(null)
  }

  const solicitarPrestamoLocal = async (ejemplar: EjemplarLocal) => {
    if (ejemplar.propietario_id === userId || solicitandoId) return
    setSolicitandoId(ejemplar.id)

    const { error } = await supabase.from('prestamos').insert({
      ejemplar_id: ejemplar.id,
      propietario_id: ejemplar.propietario_id,
      lector_id: userId,
      club_id: null,
      estado: 'solicitado',
    })

    setSolicitandoId(null)
    if (error) {
      alert(`No se pudo enviar la solicitud: ${error.message}`)
    } else {
      enviarNotificacionPush({
        destinatarioId: ejemplar.propietario_id,
        titulo: `Solicitud vecinal (CP ${ejemplar.codigo_postal})`,
        cuerpo: `Un vecino te ha pedido prestado "${ejemplar.libros_catalogo.titulo}"`,
        url: '/',
      })
      alert(
        `Solicitud enviada al lector de CP ${ejemplar.codigo_postal}. Podréis acordar el punto de entrega desde la pestaña Préstamos.`
      )
      onSolicitado()
    }
  }

  const abrirDetalleLocal = (item: EjemplarLocal) => {
    const etiquetaVecino = item.municipio
      ? `Vecino · ${item.municipio} (${item.codigo_postal})`
      : `Vecino · CP ${item.codigo_postal}`

    setLibroSeleccionado({
      ejemplarId: item.id,
      estado: item.estado,
      propietarioId: item.propietario_id,
      propietarioNombre: etiquetaVecino,
      esPropio: false,
      isbn: item.libros_catalogo.isbn,
      titulo: item.libros_catalogo.titulo,
      autor: item.libros_catalogo.autor,
      portada_url: item.libros_catalogo.portada_url,
      genero: item.libros_catalogo.genero,
      sinopsis: item.libros_catalogo.sinopsis,
      premios: item.libros_catalogo.premios,
    })
  }

  const librosPorTexto = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return librosZona
    return librosZona.filter(
      (l) =>
        l.libros_catalogo?.titulo?.toLowerCase().includes(termino) ||
        l.libros_catalogo?.autor?.toLowerCase().includes(termino) ||
        l.codigo_postal.includes(termino) ||
        (l.municipio && l.municipio.toLowerCase().includes(termino))
    )
  }, [librosZona, busqueda])

  const conteoPorGenero = useMemo(() => {
    return librosPorTexto.reduce<Record<string, number>>((acc, item) => {
      const g = item.libros_catalogo?.genero || 'Otros'
      acc[g] = (acc[g] || 0) + 1
      return acc
    }, {})
  }, [librosPorTexto])

  const generosDisponibles = useMemo(() => {
    const presentes = Object.keys(conteoPorGenero).sort((a, b) => a.localeCompare(b, 'es'))
    return ['Todos', ...presentes]
  }, [conteoPorGenero])

  const librosFiltrados = useMemo(() => {
    if (generoFiltro === 'Todos') return librosPorTexto
    return librosPorTexto.filter((l) => (l.libros_catalogo?.genero || 'Otros') === generoFiltro)
  }, [librosPorTexto, generoFiltro])

  const resumenCercania = useMemo(() => {
    const exactos = librosZona.filter((l) => l.prioridad_cercania === 0).length
    const cercanos = librosZona.length - exactos
    return { exactos, cercanos }
  }, [librosZona])

  if (cargandoPerfil) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Comprobando tu zona de lectura...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Explorar en tu Barrio</h1>
          <p className="text-xs text-stone-500">
            Primero tu código postal y, a continuación, los alrededores disponibles
          </p>
        </div>

        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
          <span>Identidad protegida</span>
        </span>
      </div>

      <form
        onSubmit={handleBuscarCp}
        className="bg-white p-3 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-2"
      >
        <MapPin className="w-4 h-4 text-emerald-700 shrink-0 ml-1" />
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={cpInput}
          onChange={(e) => setCpInput(e.target.value.replace(/\D/g, ''))}
          placeholder="Código postal (ej. 20001)"
          className="flex-1 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={cpInput.length !== 5 || cargandoLibros}
          className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40"
        >
          Buscar CP
        </button>
      </form>

      {!cpActual ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center space-y-3">
          <MapPin className="w-9 h-9 text-stone-300 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-semibold text-stone-800 text-sm">
              Introduce un código postal o guarda el tuyo
            </h2>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Escribe arriba un código postal de 5 dígitos para ver libros en tu zona y alrededores o configura tu CP en Mi Perfil.
            </p>
          </div>
          <button
            type="button"
            onClick={onAbrirPerfil}
            className="py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UserCircle2 className="w-4 h-4" />
            <span>Configurar mi código postal</span>
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMostrarMapa((prev) => !prev)
                setMostrarTablon(false)
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition ${
                mostrarMapa
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{mostrarMapa ? 'Ocultar mapa' : 'Puntos de intercambio'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const abrir = !mostrarTablon
                setMostrarTablon(abrir)
                setMostrarMapa(false)
                if (abrir && cpActual && typeof window !== 'undefined') {
                  const prefijoProvincia = cpActual.slice(0, 2)
                  supabase
                    .from('eventos_literarios')
                    .select('id, creado_en')
                    .like('codigo_postal', `${prefijoProvincia}%`)
                    .order('creado_en', { ascending: false })
                    .limit(1)
                    .then(({ data }) => {
                      if (data && data[0]) {
                        const marca = data[0].creado_en || String(data[0].id)
                        window.localStorage.setItem(`exlibris_tablon_ultimo_visto_${prefijoProvincia}`, marca)
                      }
                      setHayEventosNuevos(false)
                    })
                }
              }}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition ${
                mostrarTablon
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>{mostrarTablon ? 'Ocultar tablón' : 'Tablón literario'}</span>

              {eventosActivosCount > 0 && !mostrarTablon && (
                <span
                  className={`ml-0.5 text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center shadow-2xs ${
                    hayEventosNuevos
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}
                >
                  {eventosActivosCount > 99 ? '99+' : eventosActivosCount}
                </span>
              )}
            </button>
          </div>

          {mostrarMapa && (
            <MapaPuntosExlibris
              codigoPostalInicial={cpActual}
              onClose={() => setMostrarMapa(false)}
            />
          )}

          {mostrarTablon && (
            <TablonEventosTab
              codigoPostalUsuario={cpActual}
              onClose={() => setMostrarTablon(false)}
            />
          )}

          {librosZona.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 px-0.5">
                <span>
                  Mostrando <strong className="text-stone-800">{librosZona.length}</strong>{' '}
                  {librosZona.length === 1 ? 'ejemplar' : 'ejemplares'} desde{' '}
                  <strong className="text-stone-800">CP {cpActual}</strong>
                </span>
                <span>
                  {resumenCercania.exactos} en tu CP · {resumenCercania.cercanos} en alrededores
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={`Filtrar cerca de CP ${cpActual} por título, autor o CP...`}
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
                    onClick={() => setVistaZona('grid')}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaZona === 'grid'
                        ? 'bg-emerald-700 text-white'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Vista cuadrícula de portadas"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaZona('lista')}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaZona === 'lista'
                        ? 'bg-emerald-700 text-white'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Vista lista detallada"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {generosDisponibles.length > 2 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {generosDisponibles.map((gen) => {
                    const cantidad =
                      gen === 'Todos' ? librosPorTexto.length : conteoPorGenero[gen] || 0
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
          )}

          {cargandoLibros ? (
            <div className="py-10 text-center text-xs text-stone-500">
              Buscando ejemplares en CP {cpActual} y alrededores...
            </div>
          ) : librosZona.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
              <div className="text-center max-w-sm mx-auto space-y-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-3 py-1 rounded-full">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>CP {cpActual} · Vista previa del barrio</span>
                </span>
                <h2 className="font-bold text-stone-900 text-base">
                  Aún no hay libros activos cerca del CP {cpActual}
                </h2>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Así aparecerán los ejemplares anónimos de tus vecinos. Puedes estrenar esta zona activando alguno de tus libros desde Estantería.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 max-w-md mx-auto select-none pointer-events-none">
                {[
                  {
                    titulo: 'Los detectives salvajes',
                    autor: 'Roberto Bolaño',
                    cp: cpActual,
                    color: 'from-sky-900 to-stone-950',
                  },
                  {
                    titulo: 'Canto yo y la montaña baila',
                    autor: 'Irene Solà',
                    cp: cpActual,
                    color: 'from-emerald-900 to-stone-950',
                  },
                  {
                    titulo: 'Ficciones',
                    autor: 'Jorge Luis Borges',
                    cp: cpActual,
                    color: 'from-stone-800 to-stone-950',
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
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-900">
                          {ejemplo.cp}
                        </span>
                      </div>
                      <div>
                        <p className="font-serif font-bold text-[11px] leading-tight line-clamp-3">
                          {ejemplo.titulo}
                        </p>
                        <p className="text-[9px] text-white/75 mt-1 truncate">
                          {ejemplo.autor}
                        </p>
                      </div>
                    </div>
                    <div className="p-2 bg-white space-y-1">
                      <p className="font-semibold text-stone-800 text-[10px] truncate">
                        {ejemplo.titulo}
                      </p>
                      <p className="text-[9px] text-stone-400 truncate">Vecino anónimo</p>
                      <div className="py-1 bg-emerald-700/90 text-white rounded-md text-[9px] font-semibold text-center">
                        Pedir
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : librosFiltrados.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold text-stone-700">
                No hay libros que coincidan con ese filtro cerca del CP {cpActual}
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('')
                  setGeneroFiltro('Todos')
                }}
                className="mt-3 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium cursor-pointer"
              >
                Limpiar filtros
              </button>
            </div>
          ) : vistaZona === 'grid' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3">
              {librosFiltrados.map((item) => {
                const esCpExacto = item.prioridad_cercania === 0
                return (
                  <div
                    key={item.id}
                    onClick={() => abrirDetalleLocal(item)}
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

                      <span
                        className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs ${
                          esCpExacto
                            ? 'bg-emerald-100/95 text-emerald-900'
                            : 'bg-sky-100/95 text-sky-900'
                        }`}
                      >
                        {item.codigo_postal}
                      </span>

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
                          {item.libros_catalogo?.autor}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            solicitarPrestamoLocal(item)
                          }}
                          disabled={solicitandoId === item.id}
                          className="flex-1 py-1 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Send className="w-2.5 h-2.5" />
                          <span>{solicitandoId === item.id ? 'Pidiendo...' : 'Pedir'}</span>
                        </button>

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
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {librosFiltrados.map((item) => {
                const esCpExacto = item.prioridad_cercania === 0
                const etiquetaVecino = item.municipio
                  ? `Vecino · ${item.municipio} (${item.codigo_postal})`
                  : `Vecino · CP ${item.codigo_postal}`

                return (
                  <div
                    key={item.id}
                    onClick={() => abrirDetalleLocal(item)}
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
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-stone-900 text-xs line-clamp-1">
                          {item.libros_catalogo?.titulo}
                        </h3>
                        <span
                          className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            esCpExacto
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-sky-100 text-sky-900'
                          }`}
                        >
                          {esCpExacto ? 'Tu CP' : 'Cerca'}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 truncate mt-0.5">
                        {item.libros_catalogo?.autor}
                      </p>

                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-[10px] text-stone-500 inline-flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                            <span className="truncate">{etiquetaVecino}</span>
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

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              solicitarPrestamoLocal(item)
                            }}
                            disabled={solicitandoId === item.id}
                            className="py-1 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>{solicitandoId === item.id ? 'Pidiendo...' : 'Pedir'}</span>
                          </button>

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
                      </div>
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
          if (cpActual) buscarEnCodigoPostal(cpActual)
        }}
        onActualizado={() => cpActual && buscarEnCodigoPostal(cpActual)}
      />
    </div>
  )
}