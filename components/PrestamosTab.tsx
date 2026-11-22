'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, RotateCcw, X } from 'lucide-react'

interface PrestamoItem {
  id: string
  ejemplar_id: string
  propietario_id: string
  solicitante_id: string
  estado: 'solicitado' | 'activo' | 'devuelto' | 'rechazado'
  titulo: string
  portada_url: string
  otra_persona: string
}

export default function PrestamosTab({
  userId,
  onCambioEstado,
}: {
  userId: string
  onCambioEstado: () => void
}) {
  const [recibidos, setRecibidos] = useState<PrestamoItem[]>([])
  const [enviados, setEnviados] = useState<PrestamoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const supabase = createClient()

  const cargarPrestamos = useCallback(async () => {
    setLoading(true)
    const { data: prestamos } = await supabase
      .from('prestamos')
      .select('*')
      .or(`propietario_id.eq.${userId},solicitante_id.eq.${userId}`)
      .order('fecha_solicitud', { ascending: false })

    if (!prestamos || prestamos.length === 0) {
      setRecibidos([])
      setEnviados([])
      setLoading(false)
      return
    }

    const ejemplarIds = Array.from(new Set(prestamos.map((p) => p.ejemplar_id)))
    const userIds = Array.from(
      new Set(prestamos.flatMap((p) => [p.propietario_id, p.solicitante_id]))
    )

    const [{ data: ejemplares }, { data: perfiles }] = await Promise.all([
      supabase.from('ejemplares').select('id, isbn').in('id', ejemplarIds),
      supabase.from('perfiles').select('id, nombre').in('id', userIds),
    ])

    const isbns = Array.from(new Set((ejemplares || []).map((e) => e.isbn)))
    const { data: catalogo } = await supabase
      .from('libros_catalogo')
      .select('isbn, titulo, portada_url')
      .in('isbn', isbns)

    const formateados: PrestamoItem[] = prestamos.map((p) => {
      const ej = ejemplares?.find((e) => e.id === p.ejemplar_id)
      const libro = catalogo?.find((c) => c.isbn === ej?.isbn)
      const otroId = p.propietario_id === userId ? p.solicitante_id : p.propietario_id
      const otroPerfil = perfiles?.find((pf) => pf.id === otroId)

      return {
        id: p.id,
        ejemplar_id: p.ejemplar_id,
        propietario_id: p.propietario_id,
        solicitante_id: p.solicitante_id,
        estado: p.estado,
        titulo: libro?.titulo || 'Libro',
        portada_url: libro?.portada_url || '',
        otra_persona: otroPerfil?.nombre || 'Miembro del club',
      }
    })

    setRecibidos(formateados.filter((p) => p.propietario_id === userId))
    setEnviados(formateados.filter((p) => p.solicitante_id === userId))
    setLoading(false)
  }, [supabase, userId])

  useEffect(() => {
    cargarPrestamos()
  }, [cargarPrestamos])

  const actualizarPrestamo = async (
    item: PrestamoItem,
    nuevoEstado: 'activo' | 'rechazado' | 'devuelto'
  ) => {
    setProcesandoId(item.id)

    const updates: Record<string, any> = { estado: nuevoEstado }
    if (nuevoEstado === 'activo') updates.fecha_inicio = new Date().toISOString()
    if (nuevoEstado === 'devuelto') updates.fecha_devolucion = new Date().toISOString()

    await supabase.from('prestamos').update(updates).eq('id', item.id)

    // Sincronizar disponibilidad en la estantería del propietario
    if (nuevoEstado === 'activo') {
      await supabase.from('ejemplares').update({ estado: 'prestado' }).eq('id', item.ejemplar_id)
    } else if (nuevoEstado === 'devuelto') {
      await supabase.from('ejemplares').update({ estado: 'disponible' }).eq('id', item.ejemplar_id)
    }

    setProcesandoId(null)
    await cargarPrestamos()
    onCambioEstado()
  }

  const badgeEstado = (estado: PrestamoItem['estado']) => {
    switch (estado) {
      case 'solicitado':
        return <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">Pendiente</span>
      case 'activo':
        return <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">En préstamo</span>
      case 'devuelto':
        return <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">Devuelto</span>
      case 'rechazado':
        return <span className="text-[11px] font-semibold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md">Rechazado</span>
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-7 h-7 text-emerald-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Peticiones sobre MIS libros */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
          <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
          Libros que me han pedido ({recibidos.length})
        </h2>

        {recibidos.length === 0 ? (
          <p className="text-xs text-stone-500 bg-white p-4 rounded-2xl border border-stone-200">
            Nadie ha solicitado ninguno de tus libros todavía.
          </p>
        ) : (
          recibidos.map((item) => (
            <div key={item.id} className="bg-white p-3.5 rounded-2xl border border-stone-200 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-stone-900 line-clamp-1">{item.titulo}</p>
                  <p className="text-xs text-stone-500">
                    Solicitado por <strong>{item.otra_persona}</strong>
                  </p>
                </div>
                {badgeEstado(item.estado)}
              </div>

              {item.estado === 'solicitado' && (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={procesandoId === item.id}
                    onClick={() => actualizarPrestamo(item, 'rechazado')}
                    className="flex-1 py-1.5 border border-stone-300 text-stone-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1 hover:bg-stone-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Rechazar
                  </button>
                  <button
                    disabled={procesandoId === item.id}
                    onClick={() => actualizarPrestamo(item, 'activo')}
                    className="flex-1 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 hover:bg-emerald-800 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Prestar libro
                  </button>
                </div>
              )}

              {item.estado === 'activo' && (
                <button
                  disabled={procesandoId === item.id}
                  onClick={() => actualizarPrestamo(item, 'devuelto')}
                  className="w-full py-1.5 bg-stone-900 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-stone-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Confirmar que me lo han devuelto
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {/* Libros que YO he pedido */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
          <ArrowUpRight className="w-4 h-4 text-blue-700" />
          Libros que he pedido ({enviados.length})
        </h2>

        {enviados.length === 0 ? (
          <p className="text-xs text-stone-500 bg-white p-4 rounded-2xl border border-stone-200">
            No has pedido ningún libro a tus clubes todavía.
          </p>
        ) : (
          enviados.map((item) => (
            <div
              key={item.id}
              className="bg-white p-3.5 rounded-2xl border border-stone-200 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-bold text-sm text-stone-900 line-clamp-1">{item.titulo}</p>
                <p className="text-xs text-stone-500">
                  Propietario: <strong>{item.otra_persona}</strong>
                </p>
              </div>
              {badgeEstado(item.estado)}
            </div>
          ))
        )}
      </section>
    </div>
  )
}