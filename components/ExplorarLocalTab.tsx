'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { GENEROS_ESTANDAR } from '@/utils/generos'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import {
  Award,
  BookOpen,
  MapPin,
  Search,
  Send,
  ShieldCheck,
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

export default function ExplorarLocalTab({
  userId,
  onAbrirPerfil,
  onSolicitado,
}: ExplorarLocalTabProps) {
  const supabase = createClient()
  const [cpActual, setCpActual] = useState<string>('')
  const [cpInput, setCpInput] = useState<string>('')
  const [librosZona, setLibrosZona] = useState<EjemplarLocal[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)

  const [cargandoPerfil, setCargandoPerfil] = useState(true)
  const [cargandoLibros, setCargandoLibros] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)

  const buscarEnCodigoPostal = useCallback(
    async (cp: string) => {
      const cpLimpio = cp.replace(/\D/g, '').slice(0, 5)
      if (cpLimpio.length !== 5) {
        setLibrosZona([])
        return
      }

      setCargandoLibros(true)
      setCpActual(cpLimpio)
      setGeneroFiltro('Todos')

      // 1. Buscar vecinos con busqueda_local_activa en ese CP (excluyendo al propio usuario)
      const { data: vecinosData } = await supabase
        .from('perfiles')
        .select('id, codigo_postal, ciudad')
        .eq('codigo_postal', cpLimpio)
        .eq('busqueda_local_activa', true)
        .neq('id', userId)

      if (!vecinosData || vecinosData.length === 0) {
        setLibrosZona([])
        setCargandoLibros(false)
        return
      }

      const vecinoIds = vecinosData.map((v) => v.id)

      // 2. Obtener sus ejemplares marcados como visible_local y disponibles
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

      // 3. Obtener metadatos del catálogo
      const isbns = Array.from(new Set(ejemplaresData.map((e) => e.isbn)))
      const { data: catalogoData } = await supabase
        .from('libros_catalogo')
        .select('isbn, titulo, autor, portada_url, genero, sinopsis, premios')
        .in('isbn', isbns)

      const combinados: EjemplarLocal[] = ejemplaresData.map((ej) => {
        const vecino = vecinosData.find((v) => v.id === ej.propietario_id)
        return {
          id: ej.id,
          isbn: ej.isbn,
          estado: ej.estado,
          propietario_id: ej.propietario_id,
          codigo_postal: cpLimpio,
          municipio: vecino?.ciudad || null,
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

      setLibrosZona(combinados)
      setCargandoLibros(false)
    },
    [supabase, userId]
  )

  useEffect(() => {
    const inicializar = async () => {
      setCargandoPerfil(true)
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('codigo_postal')
        .eq('id', userId)
        .maybeSingle()

      if (perfil?.codigo_postal) {
        setCpInput(perfil.codigo_postal)
        await buscarEnCodigoPostal(perfil.codigo_postal)
      }
      setCargandoPerfil(false)
    }

    inicializar()
  }, [supabase, userId, buscarEnCodigoPostal])

  const handleBuscarCp = (e: React.FormEvent) => {
    e.preventDefault()
    if (cpInput.length === 5) {
      buscarEnCodigoPostal(cpInput)
    }
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
      alert(
        `Solicitud enviada al lector de CP ${ejemplar.codigo_postal}. Podréis acordar el punto de entrega desde la pestaña Préstamos.`
      )
      onSolicitado()
    }
  }

  const termino = busqueda.trim().toLowerCase()
  const librosPorTexto = termino
    ? librosZona.filter(
        (l) =>
          l.libros_catalogo?.titulo?.toLowerCase().includes(termino) ||
          l.libros_catalogo?.autor?.toLowerCase().includes(termino)
      )
    : librosZona

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

  if (cargandoPerfil) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Comprobando tu zona de lectura...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Explorar en tu Barrio</h1>
          <p className="text-xs text-stone-500">
            Libros disponibles de forma anónima por código postal
          </p>
        </div>

        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
          <span>Identidad protegida</span>
        </span>
      </div>

      {/* Buscador de Código Postal */}
      <form
        onSubmit={handleBuscarCp}
        className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-2"
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

      {/* Aviso si aún no tiene CP en su perfil */}
      {!cpActual ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center space-y-3">
          <MapPin className="w-9 h-9 text-stone-300 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-semibold text-stone-800 text-sm">
              Introduce un código postal o guarda el tuyo
            </h2>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Escribe arriba un código postal de 5 dígitos para ver libros cercanos o configura tu zona en Mi Perfil.
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
          {/* Filtro de texto y géneros cuando hay libros en el CP */}
          {librosZona.length > 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={`Filtrar libros en CP ${cpActual} por título o autor...`}
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

          {/* Resultados */}
          {cargandoLibros ? (
            <div className="py-10 text-center text-xs text-stone-500">
              Buscando ejemplares disponibles en CP {cpActual}...
            </div>
          ) : librosZona.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-2">
              <BookOpen className="w-8 h-8 text-stone-300 mx-auto" />
              <p className="text-xs font-semibold text-stone-700">
                Aún no hay libros compartidos de forma anónima en el CP {cpActual}
              </p>
              <p className="text-[11px] text-stone-500 max-w-xs mx-auto">
                Prueba con un código postal colindante o activa tus propios libros desde tu Estantería para estrenar la zona.
              </p>
            </div>
          ) : librosFiltrados.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-xs text-stone-500">
              No hay libros que coincidan con ese filtro en el CP {cpActual}.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {librosFiltrados.map((item) => {
                const etiquetaVecino = item.municipio
                  ? `Vecino · ${item.municipio} (${item.codigo_postal})`
                  : `Vecino · CP ${item.codigo_postal}`

                return (
                  <div
                    key={item.id}
                    onClick={() =>
                      setLibroSeleccionado({
                        ejemplarId: item.id,
                        estado: item.estado,
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

                      <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs bg-sky-100 text-sky-900">
                        CP {item.codigo_postal}
                      </span>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                      <div>
                        <h3 className="font-semibold text-stone-900 text-xs line-clamp-2">
                          {item.libros_catalogo?.titulo}
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                          {item.libros_catalogo?.autor}
                        </p>
                        <p className="text-[10px] text-stone-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                          <span className="truncate">{etiquetaVecino}</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          solicitarPrestamoLocal(item)
                        }}
                        disabled={solicitandoId === item.id}
                        className="w-full py-1.5 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>
                          {solicitandoId === item.id ? 'Pidiendo...' : 'Pedir prestado'}
                        </span>
                      </button>
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
        onClose={() => setLibroSeleccionado(null)}
        onActualizado={() => cpActual && buscarEnCodigoPostal(cpActual)}
      />
    </div>
  )
}