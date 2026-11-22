'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { BookOpen, LogOut, ScanBarcode, Library } from 'lucide-react'
import IsbnScanner from '@/components/IsbnScanner'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [misLibros, setMisLibros] = useState<any[]>([])
  const supabase = createClient()

  const cargarEstanteria = useCallback(async (uid: string) => {
    // 1. Traer tus ejemplares sin depender de columnas de ordenación opcionales
    const { data: ejemplaresData, error: ejError } = await supabase
      .from('ejemplares')
      .select('id, isbn, estado')
      .eq('propietario_id', uid)

    if (ejError) {
      console.error('Error cargando ejemplares:', ejError.message)
      return
    }

    if (!ejemplaresData || ejemplaresData.length === 0) {
      setMisLibros([])
      return
    }

    // 2. Traer los datos de esos ISBN desde libros_catalogo
    const isbns = ejemplaresData.map((e) => e.isbn)
    const { data: catalogoData, error: catError } = await supabase
      .from('libros_catalogo')
      .select('isbn, titulo, autor, portada_url')
      .in('isbn', isbns)

    if (catError) {
      console.error('Error cargando catálogo:', catError.message)
      return
    }

    // 3. Combinar ambos resultados manteniendo la estructura que espera la interfaz
    const combinados = ejemplaresData.map((ej) => ({
      id: ej.id,
      estado: ej.estado,
      libros_catalogo: catalogoData?.find((c) => c.isbn === ej.isbn) || {
        isbn: ej.isbn,
        titulo: `ISBN: ${ej.isbn}`,
        autor: 'Sin datos en catálogo',
        portada_url: '',
      },
    }))

    setMisLibros(combinados)
  }, [supabase])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) await cargarEstanteria(user.id)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) cargarEstanteria(currentUser.id)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth, cargarEstanteria])

  const handleLoginGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setMisLibros([])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-600">
        Cargando Exlibris...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 p-6">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Exlibris</h1>
          <p className="text-stone-500 text-sm mb-6">Tu biblioteca compartida y clubes de lectura.</p>

          {!user ? (
            <button
              onClick={handleLoginGoogle}
              className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl transition cursor-pointer"
            >
              Continuar con Google
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left">
                <div>
                  <p className="font-medium text-stone-900 text-sm">{user.user_metadata?.full_name || user.email}</p>
                  <p className="text-xs text-stone-500">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="p-2 text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowScanner(true)}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ScanBarcode className="w-5 h-5" />
                Escanear libro (ISBN)
              </button>
            </div>
          )}
        </div>

        {/* Listado de mi estantería */}
        {user && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500 mb-4 flex items-center gap-2">
              <Library className="w-4 h-4" />
              Mi estantería ({misLibros.length})
            </h2>

            {misLibros.length === 0 ? (
              <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center text-sm text-stone-500">
                Aún no tienes libros registrados. Pulsa el botón verde para escanear el primero.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {misLibros.map((item) => {
                  const libro = Array.isArray(item.libros_catalogo) ? item.libros_catalogo[0] : item.libros_catalogo
                  return (
                    <div key={item.id} className="bg-white p-3 rounded-xl border border-stone-200 flex gap-3 shadow-xs">
                      {libro?.portada_url ? (
                        <img src={libro.portada_url} alt={libro.titulo} className="w-14 h-20 object-cover rounded" />
                      ) : (
                        <div className="w-14 h-20 bg-stone-100 rounded flex items-center justify-center text-[10px] text-stone-400">
                          Sin foto
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-stone-900 line-clamp-2">{libro?.titulo}</h3>
                        <p className="text-xs text-stone-500 truncate mt-0.5">{libro?.autor}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full capitalize">
                          {item.estado}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {showScanner && user && (
        <IsbnScanner
          userId={user.id}
          onClose={() => setShowScanner(false)}
          onBookAdded={() => cargarEstanteria(user.id)}
        />
      )}
    </main>
  )
}