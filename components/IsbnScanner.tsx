'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { createClient } from '@/utils/supabase/client'
import { extraerPremios, normalizarGenero } from '@/utils/generos'
import {
  Award,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react'

interface BookData {
  isbn: string
  titulo: string
  autor: string
  portada_url: string
  genero?: string | null
  sinopsis?: string | null
  premios?: string | null
}

interface ClubOpcion {
  id: string
  nombre: string
}

interface IsbnScannerProps {
  userId: string
  onClose: () => void
  onBookAdded: () => void
}

export default function IsbnScanner({ userId, onClose, onBookAdded }: IsbnScannerProps) {
  const [book, setBook] = useState<BookData | null>(null)
  const [manualIsbn, setManualIsbn] = useState('')
  const [status, setStatus] = useState<
    'scanning' | 'searching' | 'found' | 'saving' | 'saved' | 'error'
  >('scanning')
  const [errorMsg, setErrorMsg] = useState('')

  // Clubes del usuario para visibilidad selectiva al guardar
  const [misClubes, setMisClubes] = useState<ClubOpcion[]>([])
  const [clubesSeleccionados, setClubesSeleccionados] = useState<string[]>([])

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const supabase = createClient()

  // Cargar clubes a los que pertenece el usuario
  useEffect(() => {
    const cargarClubesUsuario = async () => {
      const { data: membresias } = await supabase
        .from('miembros_club')
        .select('club_id')
        .eq('usuario_id', userId)

      if (membresias && membresias.length > 0) {
        const clubIds = membresias.map((m) => m.club_id)
        const { data: clubesData } = await supabase
          .from('clubes')
          .select('id, nombre')
          .in('id', clubIds)

        if (clubesData && clubesData.length > 0) {
          setMisClubes(clubesData)
          // Por defecto seleccionados; el usuario puede desmarcar los que no quiera
          setClubesSeleccionados(clubesData.map((c) => c.id))
        }
      }
    }

    cargarClubesUsuario()
  }, [supabase, userId])

  useEffect(() => {
    const startCamera = async () => {
      try {
        const html5QrCode = new Html5Qrcode('reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
          ],
          verbose: false,
        })
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          async (decodedText) => {
            await stopCamera()
            buscarLibro(decodedText)
          },
          () => {}
        )
      } catch (err) {
        console.error(err)
        setErrorMsg(
          'No se pudo acceder a la cámara. Puedes introducir el ISBN manualmente abajo.'
        )
      }
    }

    startCamera()

    return () => {
      stopCamera()
    }
  }, [])

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (e) {
        console.error(e)
      }
    }
  }

  const toggleClub = (clubId: string) => {
    setClubesSeleccionados((prev) =>
      prev.includes(clubId) ? prev.filter((id) => id !== clubId) : [...prev, clubId]
    )
  }

  const buscarLibro = async (rawIsbn: string) => {
    const cleanIsbn = rawIsbn.replace(/[^0-9X]/gi, '')
    if (!cleanIsbn) return

    setStatus('searching')
    setErrorMsg('')

    try {
      // 1. Buscar en el catálogo de Supabase
      const { data: existingBook } = await supabase
        .from('libros_catalogo')
        .select('*')
        .eq('isbn', cleanIsbn)
        .maybeSingle()

      if (existingBook) {
        setBook({
          isbn: existingBook.isbn,
          titulo: existingBook.titulo,
          autor: existingBook.autor || 'Autor desconocido',
          portada_url: existingBook.portada_url || '',
          genero: existingBook.genero || null,
          sinopsis: existingBook.sinopsis || null,
          premios: existingBook.premios || null,
        })
        setStatus('found')
        return
      }

      // 2. Consultar Google Books API
      const gRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`
      )
      const gData = await gRes.json()

      if (gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo
        setBook({
          isbn: cleanIsbn,
          titulo: info.title || 'Sin título',
          autor: info.authors ? info.authors.join(', ') : 'Autor desconocido',
          portada_url:
            info.imageLinks?.thumbnail?.replace('http://', 'https://') || '',
          genero: normalizarGenero(info.categories),
          sinopsis: info.description || null,
          premios: extraerPremios(info.categories, info.description),
        })
        setStatus('found')
        return
      }

      // 3. Fallback a Open Library API
      const olRes = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
      )
      const olData = await olRes.json()
      const olBook = olData[`ISBN:${cleanIsbn}`]

      if (olBook) {
        const subjects = olBook.subjects?.map((s: any) => s.name) || []
        setBook({
          isbn: cleanIsbn,
          titulo: olBook.title || 'Sin título',
          autor: olBook.authors
            ? olBook.authors.map((a: any) => a.name).join(', ')
            : 'Autor desconocido',
          portada_url: olBook.cover?.medium || '',
          genero: normalizarGenero(subjects),
          sinopsis: null,
          premios: extraerPremios(subjects, null),
        })
        setStatus('found')
        return
      }

      setStatus('error')
      setErrorMsg(`No encontramos datos para el ISBN ${cleanIsbn}.`)
    } catch {
      setStatus('error')
      setErrorMsg('Error de conexión al buscar el libro.')
    }
  }

  const guardarEnEstanteria = async () => {
    if (!book) return
    setStatus('saving')

    try {
      // 1. Insertar o actualizar en catálogo global
      const { error: catError } = await supabase.from('libros_catalogo').upsert([
        {
          isbn: book.isbn,
          titulo: book.titulo,
          autor: book.autor,
          portada_url: book.portada_url,
          genero: book.genero || 'Otros',
          sinopsis: book.sinopsis || null,
          premios: book.premios || null,
        },
      ])

      if (catError) throw catError

      // 2. Comprobar si ya tienes este libro en tu estantería
      const { data: yaLoTengo } = await supabase
        .from('ejemplares')
        .select('id')
        .eq('isbn', book.isbn)
        .eq('propietario_id', userId)
        .maybeSingle()

      if (yaLoTengo) {
        setStatus('error')
        setErrorMsg('Ya tienes un ejemplar de este libro en tu estantería.')
        return
      }

      // 3. Crear el ejemplar físico y recuperar su ID generado
      const { data: nuevoEjemplar, error: ejError } = await supabase
        .from('ejemplares')
        .insert({
          isbn: book.isbn,
          propietario_id: userId,
          estado: 'disponible',
        })
        .select('id')
        .single()

      if (ejError || !nuevoEjemplar) throw ejError

      // 4. Registrar la visibilidad en los clubes seleccionados
      if (clubesSeleccionados.length > 0) {
        const filasClubes = clubesSeleccionados.map((clubId) => ({
          ejemplar_id: nuevoEjemplar.id,
          club_id: clubId,
        }))
        const { error: clubRelError } = await supabase
          .from('ejemplares_club')
          .insert(filasClubes)

        if (clubRelError) {
          console.error('Error al asociar clubes:', clubRelError)
        }
      }

      setStatus('saved')
      setTimeout(() => {
        onBookAdded()
        onClose()
      }, 1200)
    } catch (err: any) {
      console.error(err)
      setStatus('error')
      setErrorMsg(
        `Error al guardar en Supabase: ${err.message || 'Verifica nombres de columnas/RLS'}`
      )
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={async () => {
            await stopCamera()
            onClose()
          }}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5 text-emerald-700" />
          Añadir libro por ISBN
        </h2>

        {status === 'scanning' && (
          <div className="space-y-4">
            <div
              id="reader"
              className="w-full overflow-hidden rounded-xl bg-stone-100 min-h-[220px]"
            />
            <p className="text-xs text-center text-stone-500">
              Apunta la cámara al código de barras trasero del libro
            </p>

            <div className="pt-2 border-t border-stone-100">
              <label className="block text-xs font-medium text-stone-600 mb-1">
                O introduce el ISBN manualmente (ej. 9788408043645):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                  placeholder="978..."
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
                />
                <button
                  onClick={() => {
                    stopCamera()
                    buscarLibro(manualIsbn)
                  }}
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 flex items-center gap-1 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  Buscar
                </button>
              </div>
            </div>
          </div>
        )}

        {status === 'searching' && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-700 animate-spin mx-auto" />
            <p className="text-sm text-stone-600">
              Consultando catálogo y bases bibliográficas...
            </p>
          </div>
        )}

        {status === 'found' && book && (
          <div className="space-y-4">
            <div className="flex gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
              {book.portada_url ? (
                <img
                  src={book.portada_url}
                  alt={book.titulo}
                  className="w-20 h-28 object-cover rounded-md shadow-sm"
                />
              ) : (
                <div className="w-20 h-28 bg-stone-200 rounded-md flex items-center justify-center text-xs text-stone-500 text-center p-1">
                  Sin portada
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-mono text-stone-400">
                  ISBN: {book.isbn}
                </span>
                <h3 className="font-bold text-stone-900 leading-snug mt-0.5">
                  {book.titulo}
                </h3>
                <p className="text-sm text-stone-600 mt-1">{book.autor}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {book.genero && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-700">
                      {book.genero}
                    </span>
                  )}
                  {book.premios && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      <Award className="w-2.5 h-2.5" />
                      {book.premios}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Selector de clubes donde compartir este libro */}
            {misClubes.length > 0 && (
              <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-700" />
                    Compartir en mis clubes
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {clubesSeleccionados.length === 0
                      ? 'Solo estantería personal'
                      : `${clubesSeleccionados.length} de ${misClubes.length}`}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {misClubes.map((club) => {
                    const marcado = clubesSeleccionados.includes(club.id)
                    return (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => toggleClub(club.id)}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                          marcado
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <span className="truncate">{club.nombre}</span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            marcado
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {marcado && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStatus('scanning')}
                className="flex-1 py-2.5 px-4 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 cursor-pointer"
              >
                Reintentar
              </button>
              <button
                onClick={guardarEnEstanteria}
                className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-medium cursor-pointer"
              >
                Guardar en mi estantería
              </button>
            </div>
          </div>
        )}

        {status === 'saving' && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-700 animate-spin mx-auto" />
            <p className="text-sm text-stone-600">Guardando en tu biblioteca...</p>
          </div>
        )}

        {status === 'saved' && (
          <div className="py-10 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="font-bold text-stone-900">¡Libro añadido a tu estantería!</p>
          </div>
        )}

        {(status === 'error' || errorMsg) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}