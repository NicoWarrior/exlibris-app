'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import {
  Award,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Plus,
  Send,
  Tag,
  Users,
} from 'lucide-react'

interface Club {
  id: string
  nombre: string
  codigo_invitacion: string
  creador_id: string
}

interface EjemplarClub {
  id: string
  isbn: string
  estado: string
  propietario_id: string
  propietario_nombre: string
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
  const [generoFiltro, setGeneroFiltro] = useState<string>('Todos')
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)

  const [cargandoClubes, setCargandoClubes] = useState(true)
  const [cargandoLibros, setCargandoLibros] = useState(false)

  // Formularios crear / unirse
  const [modoFormulario, setModoFormulario] = useState<'ninguno' | 'crear' | 'unirse'>('ninguno')
  const [nombreNuevoClub, setNombreNuevoClub] = useState('')
  const [codigoUnirse, setCodigoUnirse] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)

  const cargarMisClubes = useCallback(async () => {
    setCargandoClubes(true)
    const { data: membresias } = await supabase
      .from('club_miembros')
      .select('club_id')
      .eq('usuario_id', userId)

    if (membresias && membresias.length > 0) {
      const clubIds = membresias.map((m) => m.club_id)
      const { data: clubesData } = await supabase
        .from('clubes')
        .select('id, nombre, codigo_invitacion, creador_id')
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

      // 1. Obtener miembros del club
      const { data: miembros } = await supabase
        .from('club_miembros')
        .select('usuario_id')
        .eq('club_id', clubId)

      if (!miembros || miembros.length === 0) {
        setLibrosClub([])
        setCargandoLibros(false)
        return
      }

      const memberIds = miembros.map((m) => m.usuario_id)

      // 2. Intentar obtener nombres desde perfiles (si existe la tabla)
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('id, nombre')
        .in('id', memberIds)

      // 3. Obtener ejemplares de todos los miembros del club
      const { data: ejemplaresData } = await supabase
        .from('ejemplares')
        .select('id, isbn, estado, propietario_id')
        .in('propietario_id', memberIds)

      if (!ejemplaresData || ejemplaresData.length === 0) {
        setLibrosClub([])
        setCargandoLibros(false)
        return
      }

      // 4. Obtener metadatos enriquecidos del catálogo (incluyendo genero, sinopsis y premios)
      const isbns = Array.from(new Set(ejemplaresData.map((e) => e.isbn)))
      const { data: catalogoData } = await supabase
        .from('libros_catalogo')
        .select('isbn, titulo, autor, portada_url, genero, sinopsis, premios')
        .in('isbn', isbns)

      const combinados: EjemplarClub[] = ejemplaresData.map((ej) => {
        const perfil = perfilesData?.find((p) => p.id === ej.propietario_id)
        const esMio = ej.propietario_id === userId

        return {
          id: ej.id,
          isbn: ej.isbn,
          estado: ej.estado,
          propietario_id: ej.propietario_id,
          propietario_nombre: esMio
            ? 'Tú'
            : perfil?.nombre || `Miembro #${ej.propietario_id.slice(0, 4)}`,
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
        creador_id: userId,
      })
      .select()
      .single()

    if (error || !nuevoClub) {
      alert(`Error al crear el club: ${error?.message || 'Desconocido'}`)
      setProcesando(false)
      return
    }

    await supabase.from('club_miembros').insert({
      club_id: nuevoClub.id,
      usuario_id: userId,
    })

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
      .select('id, nombre, codigo_invitacion, creador_id')
      .eq('codigo_invitacion', cleanCode)
      .maybeSingle()

    if (error || !clubEncontrado) {
      alert('No existe ningún club con ese código de invitación.')
      setProcesando(false)
      return
    }

    const { error: joinError } = await supabase.from('club_miembros').insert({
      club_id: clubEncontrado.id,
      usuario_id: userId,
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
    if (ejemplar.propietario_id === userId || ejemplar.estado !== 'disponible' || solicitandoId) {
      return
    }
    setSolicitandoId(ejemplar.id)

    const { error } = await supabase.from('prestamos').insert({
      ejemplar_id: ejemplar.id,
      propietario_id: ejemplar.propietario_id,
      solicitante_id: userId,
      estado: 'solicitado',
    })

    setSolicitandoId(null)
    if (error) {
      alert(`No se pudo solicitar el préstamo: ${error.message}`)
    } else {
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

  // Géneros disponibles dinámicamente en el club activo
  const generosDisponibles = [
    'Todos',
    ...Array.from(
      new Set(librosClub.map((l) => l.libros_catalogo?.genero || 'Otros'))
    ).sort((a, b) => (a === 'Otros' ? 1 : b === 'Otros' ? -1 : a.localeCompare(b))),
  ]

  const librosFiltrados =
    generoFiltro === 'Todos'
      ? librosClub
      : librosClub.filter((l) => (l.libros_catalogo?.genero || 'Otros') === generoFiltro)

  if (cargandoClubes) {
    return (
      <div className="py-12 text-center text-xs text-stone-500">
        Cargando tus clubes de lectura...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cabecera y botones de acción */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Mis Clubes</h1>
          <p className="text-xs text-stone-500">
            Comparte estantería y pide libros en tus grupos privados
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

      {/* Formulario Crear Club */}
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
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold cursor-pointer