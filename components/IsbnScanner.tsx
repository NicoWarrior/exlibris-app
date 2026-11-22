'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { createClient } from '@/utils/supabase/client'
import { Camera, CheckCircle2, Loader2, Search, X } from 'lucide-react'

interface BookData {
  isbn: string
  titulo: string
  autor: string
  portada_url: string
}

interface IsbnScannerProps {
  userId: string
  onClose: () => void
  onBookAdded: () => void
}

export default function IsbnScanner({ userId, onClose, onBookAdded }: IsbnScannerProps) {
  const [manualIsbn, setManualIsbn] = useState('')
  const [book, setBook] = useState<BookData | null>(null)
  const [status, setStatus] = useState<'scanning' | 'searching' | 'found' | 'saving' | 'saved' | 'error'>('scanning')
  const [errorMsg, setErrorMsg] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const startCamera = async () => {
      try {
        const html5QrCode = new Html5Qrcode('reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8],
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
        setErrorMsg('No se pudo acceder a la cámara. Puedes introducir el ISBN manualmente abajo.')
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
        })
        setStatus('found')
        return
      }

      // 2. Consultar Google Books API
      const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`)
      const gData = await gRes.json()

      if (gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo
        setBook({
          isbn: cleanIsbn,
          titulo: info.title || 'Sin título',
          autor: info.authors ? info.authors.join(', ') : 'Autor desconocido',
          portada_url: info.imageLinks?.thumbnail?.replace('http://', 'https://') || '',
        })
        setStatus('found')
        return
      }

      // 3. Fallback a Open Library API
      const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`)
      const olData = await olRes.json()
      const olBook = olData[`ISBN:${cleanIsbn}`]

      if (olBook) {
        setBook({
          isbn: cleanIsbn,
          titulo: olBook.title || 'Sin título',
          autor: olBook.authors ? olBook.authors.map((a: any) => a.name).join(', ') : 'Autor desconocido',
          portada_url: olBook.cover?.medium || '',
        })
        setStatus('found')
        return
      }

      setStatus('error')
      setErrorMsg(`No encontramos datos para el ISBN ${cleanIsbn}.`)
    } catch (error) {
      setStatus('error')
      setErrorMsg('Error de conexión al buscar el libro.')
    }
  }

  const guardarEnEstanteria = async () => {
    if (!book) return
    setStatus('saving')

    try {
      // 1. Verificar si ya existe en catálogo global; si no, insertarlo
      const { data: existe } = await supabase
        .from('libros_catalogo')
        .select('isbn')
        .eq('isbn', book.isbn)
        .maybeSingle()

      if (!existe) {
        const { error: catError } = await supabase
          .from('libros_catalogo')
          .insert({
            isbn: book.isbn,
            titulo: book.titulo,
            autor: book.autor,
            portada_url: book.portada_url,
          })

        if (catError) throw catError
      }

      // 2. Comprobar si YA tienes este libro en tu estantería
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

      // 3. Crear el ejemplar físico en tu estantería
      const { error: ejError } = await supabase.from('ejemplares').insert({
        isbn: book.isbn,
        propietario_id: userId,
        estado: 'disponible',
      })

      if (ejError) throw ejError

      setStatus('saved')
      setTimeout(() => {
        onBookAdded()
        onClose()
      }, 1200)
    } catch (err: any) {
      console.error(err)
      setStatus('error')
      setErrorMsg(`Error al guardar en Supabase: ${err.message || 'Verifica nombres de columnas/RLS'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
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
            <div id="reader" className="w-full overflow-hidden rounded-xl bg-stone-100 min-h-[220px]" />
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
            <p className="text-sm text-stone-600">Consultando catálogo y bases bibliográficas...</p>
          </div>
        )}

        {status === 'found' && book && (
          <div className="space-y-5">
            <div className="flex gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
              {book.portada_url ? (
                <img src={book.portada_url} alt={book.titulo} className="w-20 h-28 object-cover rounded-md shadow-sm" />
              ) : (
                <div className="w-20 h-28 bg-stone-200 rounded-md flex items-center justify-center text-xs text-stone-500 text-center p-1">
                  Sin portada
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-mono text-stone-400">ISBN: {book.isbn}</span>
                <h3 className="font-bold text-stone-900 leading-snug mt-0.5">{book.titulo}</h3>
                <p className="text-sm text-stone-600 mt-1">{book.autor}</p>
              </div>
            </div>

            <div className="flex gap-2">
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