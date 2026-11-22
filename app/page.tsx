'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import IsbnScanner from '@/components/IsbnScanner'
import ClubesTab from '@/components/ClubesTab'
import PrestamosTab from '@/components/PrestamosTab'
import LibroModal, { LibroDetalle } from '@/components/LibroModal'
import { ArrowLeftRight, BookOpen, LogOut, Plus, ScanBarcode, Users } from 'lucide-react'

interface LibroEstanteria {
  id: string
  estado: string
  libros_catalogo: {
    isbn: string
    titulo: string
    autor: string
    portada_url: string
    genero?: string | null
    sinopsis?: string | null
  }
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'estanteria' | 'clubes' | 'prestamos'>('estanteria')
  const [misLibros, setMisLibros] = useState<LibroEstanteria[]>([])
  const [pendientesCount, setPendientesCount] = useState(0)
  const [showScanner, setShowScanner] = useState(false)
  const [libroSeleccionado, setLibroSeleccionado] = useState<LibroDetalle | null>(null)
  const supabase = createClient()

  const cargarDatos = useCallback(async (uid: string) => {
    const { data: ejemplaresData, error: ejError } = await supabase
      .from('ejemplares')
      .select('id, isbn, estado')
      .eq('propietario_id', uid)

    if (!ejError && ejemplaresData) {
      if (ejemplaresData.length === 0) {
        setMisLibros([])
      } else {
        const isbns = ejemplaresData.map((e) => e.isbn)
        const { data: catalogoData } = await supabase
          .from('libros_catalogo')
          .select('isbn, titulo, autor, portada_url, genero, sinopsis')
          .in('isbn', isbns)

        const combinados = ejemplaresData.map((ej) => ({
          id: ej.id,
          estado: ej.estado,
          libros_catalogo: catalogoData?.find((c) => c.isbn === ej.isbn) || {
            isbn: ej.isbn,
            titulo: `ISBN: ${ej.isbn}`,
            autor: 'Sin datos en catálogo',
            portada_url: '',
            genero: null,
            sinopsis: null,
          },
        }))
        setMisLibros(combinados)
      }
    }

    const { count } = await supabase
      .from('prestamos')
      .select('id', { count: 'exact', head: true })
      .eq('propietario_id', uid)
      .eq('estado', 'solicitado')

    setPendientesCount(count || 0)
  }, [supabase])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        await cargarDatos(user.id)
      }
      setLoading(false)
    }
    getUser()
  }, [supabase, cargarDatos])

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
          <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Exlibris</h1>
          <p className="text-stone-600 text-sm mb-8">
            Tu estantería digital compartida. Escanea tus libros físicos, únete a clubes de lectura y presta ejemplares a tus amigos.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl transition flex items-center justify-center gap-3 cursor-pointer"
          >
            Continuar con Google
          </button>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-stone-900 text-lg">
            <BookOpen className="w-5 h-5 text-emerald-700" />
            <span>Exlibris</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-500 hidden sm:inline">{user.email}</span>
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
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-lg font-bold text-stone-900">Mi Estantería</h1>
                <p className="text-xs text-stone-500">
                  {misLibros.length} {misLibros.length === 1 ? 'ejemplar' : 'ejemplares'}
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

            {misLibros.length === 0 ? (
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {misLibros.map((item) => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setLibroSeleccionado({
                        ejemplarId: item.id,
                        estado: item.estado,
                        propietarioNombre: user.user_metadata?.full_name || user.email || 'Tú',
                        esPropio: true,
                        isbn: item.libros_catalogo.isbn,
                        titulo: item.libros_catalogo.titulo,
                        autor: item.libros_catalogo.autor,
                        portada_url: item.libros_catalogo.portada_url,
                        genero: item.libros_catalogo.genero,
                        sinopsis: item.libros_catalogo.sinopsis,
                      })
                    }
                    className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm flex flex-col cursor-pointer hover:border-emerald-500 transition"
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
                      <span
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm ${
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
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-stone-900 text-xs line-clamp-2">
                          {item.libros_catalogo?.titulo}
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                          {item.libros_catalogo?.autor}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'clubes' && (
          <ClubesTab userId={user.id} onSolicitado={() => cargarDatos(user.id)} />
        )}

        {tab === 'prestamos' && (
          <PrestamosTab userId={user.id} onCambioEstado={() => cargarDatos(user.id)} />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-20">
        <div className="max-w-3xl mx-auto grid grid-cols-3 h-16">
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
            onClick={() => setTab('prestamos')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium relative cursor-pointer ${
              tab === 'prestamos' ? 'text-emerald-700' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div className="relative">
              <ArrowLeftRight className="w-5 h-5" />
              {pendientesCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pendientesCount}
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
    </div>
  )
}