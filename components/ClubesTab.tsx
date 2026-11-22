'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { BookOpen, Check, Copy, Loader2, Plus, Search, UserPlus, Users } from 'lucide-react'

interface Club {
  id: string
  nombre: string
  descripcion: string | null
  codigo_invitacion: string
}

interface LibroClub {
  id: string
  isbn: string
  estado: string
  propietario_id: string
  propietario_nombre: string
  titulo: string
  autor: string
  portada_url: string
  ya_solicitado: boolean
}

export default function ClubesTab({ userId, onSolicitado }: { userId: string; onSolicitado: () => void }) {
  const [clubes, setClubes] = useState<Club[]>([])
  const [clubActivo, setClubActivo] = useState<Club | null>(null)
  const [librosClub, setLibrosClub] = useState<LibroClub[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingLibros, setLoadingLibros] = useState(false)

  // Modales/formularios inline
  const [modo, setModo] = useState<'none' | 'crear' | 'unirse'>('none')
  const [nombreClub, setNombreClub] = useState('')
  const [descClub, setDescClub] = useState('')
  const [codigoInput, setCodigoInput] = useState('')
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'err'; msg: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null)

  const supabase = createClient()

  const cargarMisClubes = useCallback(async () => {
    setLoading(true)
    const { data: membresias } = await supabase
      .from('miembros_club')
      .select('club_id')
      .eq('usuario_id', userId)

    if (!membresias || membresias.length === 0) {
      setClubes([])
      setClubActivo(null)
      setLoading(false)
      return
    }

    const clubIds = membresias.map((m) => m.club_id)
    const { data: clubesData } = await supabase
      .from('clubes')
      .select('id, nombre, descripcion, codigo_invitacion')
      .in('id', clubIds)

    const lista = clubesData || []
    setClubes(lista)
    if (lista.length > 0) {
      setClubActivo((prev) => lista.find((c) => c.id === prev?.id) || lista[0])
    }
    setLoading(false)
  }, [supabase, userId])

  const cargarLibrosDelClub = useCallback(async (clubId: string) => {
    setLoadingLibros(true)
    try {
      // 1. Miembros del club
      const { data: miembros } = await supabase
        .from('miembros_club')
        .select('usuario_id')
        .eq('club_id', clubId)

      const memberIds = miembros?.map((m) => m.usuario_id) || []
      if (memberIds.length === 0) {
        setLibrosClub([])
        return
      }

      // 2. Perfiles de los miembros
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre')
        .in('id', memberIds)

      // 3. Ejemplares de todos los miembros del club
      const { data: ejemplares } = await supabase
        .from('ejemplares')
        .select('id, isbn, estado, propietario_id')
        .in('propietario_id', memberIds)

      if (!ejemplares || ejemplares.length === 0) {
        setLibrosClub([])
        return
      }

      // 4. Datos bibliográficos y préstamos activos/solicitados por mí
      const isbns = Array.from(new Set(ejemplares.map((e) => e.isbn)))
      const [{ data: catalogo }, { data: misSolicitudes }] = await Promise.all([
        supabase.from('libros_catalogo').select('isbn, titulo, autor, portada_url').in('isbn', isbns),
        supabase
          .from('prestamos')
          .select('ejemplar_id')
          .eq('solicitante_id', userId)
          .in('estado', ['solicitado', 'activo']),
      ])

      const solicitadosSet = new Set((misSolicitudes || []).map((p) => p.ejemplar_id))

      const combinados: LibroClub[] = ejemplares.map((ej) => {
        const libro = catalogo?.find((c) => c.isbn === ej.isbn)
        const perfil = perfiles?.find((p) => p.id === ej.propietario_id)
        return {
          id: ej.id,
          isbn: ej.isbn,
          estado: ej.estado,
          propietario_id: ej.propietario_id,
          propietario_nombre: ej.propietario_id === userId ? 'Tú' : perfil?.nombre || 'Lector',
          titulo: libro?.titulo || `ISBN: ${ej.isbn}`,
          autor: libro?.autor || 'Autor desconocido',
          portada_url: libro?.portada_url || '',
          ya_solicitado: solicitadosSet.has(ej.id),
        }
      })

      setLibrosClub(combinados)
    } finally {
      setLoadingLibros(false)
    }
  }, [supabase, userId])

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
    if (!nombreClub.trim()) return
    setFeedback(null)

    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: nuevoClub, error } = await supabase
      .from('clubes')
      .insert({
        nombre: nombreClub.trim(),
        descripcion: descClub.trim() || null,
        codigo_invitacion: codigo,
        creador_id: userId,
      })
      .select()
      .single()

    if (error || !nuevoClub) {
      setFeedback({ tipo: 'err', msg: error?.message || 'Error al crear el club' })
      return
    }

    await supabase.from('miembros_club').insert({
      club_id: nuevoClub.id,
      usuario_id: userId,
    })

    setNombreClub('')
    setDescClub('')
    setModo('none')
    setFeedback({ tipo: 'ok', msg: `Club creado. Código: ${codigo}` })
    await cargarMisClubes()
  }

  const unirseAClub = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = codigoInput.trim().toUpperCase()
    if (!cleanCode) return
    setFeedback(null)

    const { data: club, error } = await supabase
      .from('clubes')
      .select('id, nombre')
      .eq('codigo_invitacion', cleanCode)
      .maybeSingle()

    if (error || !club) {
      setFeedback({ tipo: 'err', msg: 'Código de invitación no válido.' })
      return
    }

    const { error: joinError } = await supabase.from('miembros_club').insert({
      club_id: club.id,
      usuario_id: userId,
    })

    if (joinError) {
      setFeedback({
        tipo: 'err',
        msg: joinError.code === '23505' ? 'Ya formas parte de este club.' : joinError.message,
      })
      return
    }

    setCodigoInput('')
    setModo('none')
    setFeedback({ tipo: 'ok', msg: `Te has unido a "${club.nombre}"` })
    await cargarMisClubes()
  }

  const pedirPrestado = async (libro: LibroClub) => {
    setSolicitandoId(libro.id)
    const { error } = await supabase.from('prestamos').insert({
      ejemplar_id: libro.id,
      propietario_id: libro.propietario_id,
      solicitante_id: userId,
      estado: 'solicitado',
    })

    setSolicitandoId(null)
    if (error) {
      setFeedback({ tipo: 'err', msg: error.message })
      return
    }

    setFeedback({ tipo: 'ok', msg: `Solicitud enviada a ${libro.propietario_nombre}` })
    if (clubActivo) cargarLibrosDelClub(clubActivo.id)
    onSolicitado()
  }

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const librosFiltrados = librosClub.filter(
    (l) =>
      l.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.autor.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.propietario_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-7 h-7 text-emerald-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cabecera y botones de acción */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-stone-900">Mis Clubes</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setModo(modo === 'unirse' ? 'none' : 'unirse')}
            className="px-3 py-1.5 bg-white border border-stone-300 text-stone-700 rounded-xl text-xs font-medium flex items-center gap-1 hover:bg-stone-50 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Unirse
          </button>
          <button
            onClick={() => setModo(modo === 'crear' ? 'none' : 'crear')}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-medium flex items-center gap-1 hover:bg-emerald-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear club
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Formulario Crear Club */}
      {modo === 'crear' && (
        <form onSubmit={crearClub} className="bg-white p-4 rounded-2xl border border-stone-200 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900">Nuevo club de lectura</h3>
          <input
            type="text"
            required
            value={nombreClub}
            onChange={(e) => setNombreClub(e.target.value)}
            placeholder="Nombre (ej. Lectores de Donostia)"
            className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-emerald-600"
          />
          <input
            type="text"
            value={descClub}
            onChange={(e) => setDescClub(e.target.value)}
            placeholder="Descripción breve (opcional)"
            className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-emerald-600"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModo('none')}
              className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-medium hover:bg-emerald-800 cursor-pointer"
            >
              Crear grupo
            </button>
          </div>
        </form>
      )}

      {/* Formulario Unirse con Código */}
      {modo === 'unirse' && (
        <form onSubmit={unirseAClub} className="bg-white p-4 rounded-2xl border border-stone-200 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900">Unirse con código</h3>
          <div className="flex gap-2">
            <input
              type="text"
              required
              maxLength={8}
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
              placeholder="Ej. X7K9P2"
              className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-sm font-mono uppercase tracking-widest focus:outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 cursor-pointer"
            >
              Entrar
            </button>
          </div>
        </form>
      )}

      {/* Selector de clubes */}
      {clubes.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center space-y-2">
          <Users className="w-9 h-9 text-stone-300 mx-auto" />
          <p className="text-sm font-medium text-stone-700">Aún no estás en ningún club</p>
          <p className="text-xs text-stone-500">Crea un club y comparte el código con tus amigos, o únete a uno existente.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {clubes.map((c) => (
              <button
                key={c.id}
                onClick={() => setClubActivo(c)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  clubActivo?.id === c.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </div>

          {clubActivo && (
            <div className="bg-emerald-900 text-white p-4 rounded-2xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate">{clubActivo.nombre}</h3>
                {clubActivo.descripcion && (
                  <p className="text-xs text-emerald-200 truncate">{clubActivo.descripcion}</p>
                )}
              </div>
              <button
                onClick={() => copiarCodigo(clubActivo.codigo_invitacion)}
                className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 rounded-xl text-xs font-mono flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Copiar código de invitación"
              >
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {clubActivo.codigo_invitacion}
              </button>
            </div>
          )}

          {/* Buscador del catálogo del club */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar libro, autor o miembro..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* Lista de libros compartidos */}
          {loadingLibros ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 text-emerald-700 animate-spin" />
            </div>
          ) : librosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-xs text-stone-500">
              No hay libros que coincidan en la biblioteca de este club.
            </div>
          ) : (
            <div className="space-y-3">
              {librosFiltrados.map((libro) => {
                const esMio = libro.propietario_id === userId
                const disponible = libro.estado === 'disponible'

                return (
                  <div
                    key={libro.id}
                    className="bg-white p-3.5 rounded-2xl border border-stone-200 flex gap-3.5 items-center shadow-sm"
                  >
                    {libro.portada_url ? (
                      <img
                        src={libro.portada_url}
                        alt={libro.titulo}
                        className="w-14 h-20 object-cover rounded-lg bg-stone-100 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-20 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400 shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-stone-900 line-clamp-1">{libro.titulo}</h4>
                      <p className="text-xs text-stone-500 line-clamp-1">{libro.autor}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md truncate">
                          De: <strong>{libro.propietario_nombre}</strong>
                        </span>

                        {esMio ? (
                          <span className="text-[11px] font-medium text-stone-400">Tu ejemplar</span>
                        ) : libro.ya_solicitado ? (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                            Solicitado
                          </span>
                        ) : disponible ? (
                          <button
                            disabled={solicitandoId === libro.id}
                            onClick={() => pedirPrestado(libro)}
                            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                          >
                            {solicitandoId === libro.id ? 'Pidiendo...' : 'Pedir'}
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-stone-400 capitalize">{libro.estado}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}