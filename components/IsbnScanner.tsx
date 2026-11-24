'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { createClient } from '@/utils/supabase/client'
import { GENEROS_EXLIBRIS, normalizarGenero } from '@/utils/generos'
import {
  Camera,
  Check,
  Flashlight,
  Keyboard,
  Loader2,
  ScanBarcode,
  ZoomIn,
  X,
} from 'lucide-react'

interface IsbnScannerProps {
  userId: string
  onClose: () => void
  onBookAdded: () => void
}

interface BorradorManual {
  isbn: string
  titulo: string
  autor: string
  portadaUrl: string
  genero: string
  sinopsis: string | null
}

function limpiarHtml(texto?: string | null): string | null {
  if (!texto) return null
  const limpio = texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return limpio || null
}

export default function IsbnScanner({ userId, onClose, onBookAdded }: IsbnScannerProps) {
  const supabase = createClient()
  const [modo, setModo] = useState<'camara' | 'manual'>('camara')
  const [isbnManual, setIsbnManual] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [linternaActiva, setLinternaActiva] = useState(false)
  const [soportaLinterna, setSoportaLinterna] = useState(false)
  const [zoomActivo, setZoomActivo] = useState(false)
  const [soportaZoom, setSoportaZoom] = useState(false)
  const [borradorManual, setBorradorManual] = useState<BorradorManual | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const escaneadoRef = useRef(false)

  const detenerCamaraSegura = useCallback(async () => {
    const track = videoTrackRef.current
    if (track) {
      try {
        track.stop()
      } catch {
        // Ignorar
      }
      videoTrackRef.current = null
    }

    const qr = scannerRef.current
    scannerRef.current = null
    if (qr) {
      try {
        if (qr.isScanning) {
          await qr.stop()
        }
        qr.clear()
      } catch {
        // Ignorar si ya estaba detenido
      }
    }
  }, [])

  const guardarLibroEnEstanteria = useCallback(
    async (datos: BorradorManual) => {
      setProcesando(true)
      try {
        const { error: catError } = await supabase.from('libros_catalogo').upsert({
          isbn: datos.isbn,
          titulo: datos.titulo.trim(),
          autor: datos.autor.trim(),
          portada_url: datos.portadaUrl,
          genero: datos.genero || 'Otros',
          sinopsis: datos.sinopsis?.trim() || null,
        })

        if (catError) throw catError

        const { data: nuevoEjemplar, error: ejError } = await supabase
          .from('ejemplares')
          .insert({
            isbn: datos.isbn,
            propietario_id: userId,
            estado: 'disponible',
            visible_local: false,
          })
          .select('id')
          .single()

        if (ejError) throw ejError

        if (nuevoEjemplar?.id) {
          const { data: membresias } = await supabase
            .from('miembros_club')
            .select('club_id')
            .eq('usuario_id', userId)

          if (membresias && membresias.length > 0) {
            await supabase.from('ejemplares_club').insert(
              membresias.map((m) => ({
                ejemplar_id: nuevoEjemplar.id,
                club_id: m.club_id,
              }))
            )
          }
        }

        onBookAdded()
        onClose()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al guardar el libro'
        alert(msg)
        setProcesando(false)
      }
    },
    [supabase, userId, onBookAdded, onClose]
  )

  const registrarLibroPorIsbn = useCallback(
    async (isbnCrudo: string) => {
      const isbn = isbnCrudo.replace(/[^0-9Xx]/g, '').toUpperCase()
      if (isbn.length !== 10 && isbn.length !== 13) {
        alert('El ISBN debe tener 10 o 13 dígitos.')
        escaneadoRef.current = false
        return
      }

      setProcesando(true)

      try {
        const { data: existente } = await supabase
          .from('libros_catalogo')
          .select('isbn, titulo, autor, portada_url, genero, sinopsis')
          .eq('isbn', isbn)
          .maybeSingle()

        let titulo = existente?.titulo || ''
        let autor = existente?.autor || ''
        let portadaUrl = existente?.portada_url || ''
        let genero = existente?.genero || 'Otros'
        let sinopsis: string | null = existente?.sinopsis || null
        let categoriasCrudas: string[] = []

        const necesitaMetadatos =
          !existente ||
          titulo.startsWith('Libro ISBN ') ||
          autor === 'Autor desconocido' ||
          genero === 'Otros' ||
          !sinopsis

        if (necesitaMetadatos) {
          if (titulo.startsWith('Libro ISBN ')) titulo = ''
          if (autor === 'Autor desconocido') autor = ''

          // 1. Google Books por ISBN exacto
          try {
            const resGoogle = await fetch(
              `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
            )
            if (resGoogle.ok) {
              const dataGoogle = await resGoogle.json()
              const items = Array.isArray(dataGoogle.items) ? dataGoogle.items : []

              for (const item of items) {
                const info = item?.volumeInfo
                if (!info) continue
                if (!titulo && info.title) titulo = info.title
                if (!autor && Array.isArray(info.authors)) {
                  autor = info.authors.join(', ')
                }
                if (!portadaUrl && info.imageLinks?.thumbnail) {
                  portadaUrl = info.imageLinks.thumbnail.replace('http://', 'https://')
                }
                if (Array.isArray(info.categories)) {
                  categoriasCrudas.push(...info.categories)
                }
                const descLimpia = limpiarHtml(info.description)
                if (descLimpia && (!sinopsis || descLimpia.length > sinopsis.length)) {
                  sinopsis = descLimpia
                }
              }
            }
          } catch {
            // Continuar
          }

          // 2. Rescate en Google Books por título + autor (para coger sinopsis/categorías de otras ediciones)
          if (titulo && (!sinopsis || categoriasCrudas.length === 0)) {
            try {
              const primerAutor = autor.split(',')[0]?.trim()
              const queryBusqueda = primerAutor
                ? `intitle:${encodeURIComponent(titulo)}+inauthor:${encodeURIComponent(primerAutor)}`
                : `intitle:${encodeURIComponent(titulo)}`

              const resAlt = await fetch(
                `https://www.googleapis.com/books/v1/volumes?q=${queryBusqueda}&langRestrict=es&maxResults=5`
              )
              if (resAlt.ok) {
                const dataAlt = await resAlt.json()
                const itemsAlt = Array.isArray(dataAlt.items) ? dataAlt.items : []

                for (const item of itemsAlt) {
                  const info = item?.volumeInfo
                  if (!info) continue
                  if (!portadaUrl && info.imageLinks?.thumbnail) {
                    portadaUrl = info.imageLinks.thumbnail.replace('http://', 'https://')
                  }
                  if (Array.isArray(info.categories)) {
                    categoriasCrudas.push(...info.categories)
                  }
                  const descLimpia = limpiarHtml(info.description)
                  if (descLimpia && (!sinopsis || descLimpia.length > sinopsis.length)) {
                    sinopsis = descLimpia
                  }
                }
              }
            } catch {
              // Continuar
            }
          }

          // 3. Fallback Open Library
          if (!titulo || !autor || !sinopsis || categoriasCrudas.length === 0) {
            try {
              const resOL = await fetch(
                `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
              )
              if (resOL.ok) {
                const dataOL = await resOL.json()
                const libroOL = dataOL[`ISBN:${isbn}`]

                if (libroOL) {
                  if (!titulo && libroOL.title) {
                    titulo = libroOL.subtitle
                      ? `${libroOL.title}: ${libroOL.subtitle}`
                      : libroOL.title
                  }
                  if (!autor && Array.isArray(libroOL.authors) && libroOL.authors.length > 0) {
                    autor = libroOL.authors
                      .map((a: { name?: string }) => a.name)
                      .filter(Boolean)
                      .join(', ')
                  }
                  if (!portadaUrl && libroOL.cover) {
                    portadaUrl = libroOL.cover.medium || libroOL.cover.large || ''
                  }
                  if (!sinopsis) {
                    const descOL =
                      typeof libroOL.description === 'string'
                        ? libroOL.description
                        : libroOL.description?.value || libroOL.notes
                    sinopsis = limpiarHtml(descOL)
                  }
                  if (Array.isArray(libroOL.subjects)) {
                    const temas = libroOL.subjects
                      .map((s: { name?: string }) => s.name)
                      .filter(Boolean)
                    categoriasCrudas.push(...temas)
                  }
                }
              }
            } catch {
              // Ignorar
            }
          }

          if (genero === 'Otros') {
            genero = normalizarGenero(categoriasCrudas, sinopsis, titulo)
          }
        }

        const portadaFinal =
          portadaUrl ||
          `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`

        // Si ninguna fuente devolvió título o autor, pedirlos a mano al usuario
        if (!titulo.trim() || !autor.trim()) {
          setBorradorManual({
            isbn,
            titulo: titulo.trim(),
            autor: autor.trim(),
            portadaUrl: portadaFinal,
            genero,
            sinopsis,
          })
          setProcesando(false)
          return
        }

        await guardarLibroEnEstanteria({
          isbn,
          titulo,
          autor,
          portadaUrl: portadaFinal,
          genero,
          sinopsis,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al buscar el libro'
        alert(msg)
        escaneadoRef.current = false
        setProcesando(false)
      }
    },
    [supabase, guardarLibroEnEstanteria]
  )

  const registrarRef = useRef(registrarLibroPorIsbn)
  useEffect(() => {
    registrarRef.current = registrarLibroPorIsbn
  }, [registrarLibroPorIsbn])

  useEffect(() => {
    if (modo !== 'camara' || borradorManual) return

    let montado = true
    escaneadoRef.current = false
    setErrorCamara(null)

    const iniciarCamara = async () => {
      try {
        const html5Qr = new Html5Qrcode('reader-isbn', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
          ],
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        })
        scannerRef.current = html5Qr

        await html5Qr.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.min(Math.floor(viewfinderWidth * 0.85), 320),
              height: Math.min(Math.floor(viewfinderHeight * 0.35), 120),
            }),
            aspectRatio: 1.5,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          async (decodedText) => {
            if (escaneadoRef.current || !montado) return
            const limpio = decodedText.replace(/\D/g, '')
            if (limpio.length === 13 || limpio.length === 10) {
              escaneadoRef.current = true
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(70)
                } catch {
                  // Ignorar
                }
              }
              await detenerCamaraSegura()
              if (montado) {
                registrarRef.current(limpio)
              }
            }
          },
          () => {
            // Ignorar frames sin lectura
          }
        )

        if (!montado) {
          await detenerCamaraSegura()
          return
        }

        const videoEl = document.querySelector('#reader-isbn video') as HTMLVideoElement | null
        const stream = videoEl?.srcObject as MediaStream | null
        const track = stream?.getVideoTracks()?.[0] || null
        videoTrackRef.current = track

        if (track && typeof track.getCapabilities === 'function') {
          try {
            const caps = track.getCapabilities() as MediaTrackCapabilities & {
              focusMode?: string[]
              torch?: boolean
              zoom?: { min: number; max: number; step: number }
            }

            const constraintsAvanzados: Record<string, unknown> = {}

            if (caps.focusMode?.includes('continuous')) {
              constraintsAvanzados.focusMode = 'continuous'
            }

            if (caps.zoom && caps.zoom.max >= 1.4) {
              setSoportaZoom(true)
              constraintsAvanzados.zoom = Math.min(1.4, caps.zoom.max)
              setZoomActivo(true)
            }

            if (caps.torch) {
              setSoportaLinterna(true)
            }

            if (Object.keys(constraintsAvanzados).length > 0) {
              await track.applyConstraints({
                advanced: [constraintsAvanzados as MediaTrackConstraintSet],
              })
            }
          } catch {
            // Ignorar
          }
        }
      } catch {
        if (montado) {
          setErrorCamara(
            'No se pudo abrir la cámara. Comprueba los permisos del navegador o introduce el ISBN a mano.'
          )
        }
      }
    }

    iniciarCamara()

    return () => {
      montado = false
      detenerCamaraSegura()
      setLinternaActiva(false)
      setZoomActivo(false)
    }
  }, [modo, borradorManual, detenerCamaraSegura])

  const toggleLinterna = async () => {
    const track = videoTrackRef.current
    if (!track) return
    const nuevoEstado = !linternaActiva
    try {
      await track.applyConstraints({
        advanced: [{ torch: nuevoEstado } as MediaTrackConstraintSet],
      })
      setLinternaActiva(nuevoEstado)
    } catch {
      // Ignorar
    }
  }

  const toggleZoom = async () => {
    const track = videoTrackRef.current
    if (!track) return
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & {
        zoom?: { min: number; max: number }
      }
      if (!caps.zoom) return
      const nuevoZoom = zoomActivo ? 1 : Math.min(1.5, caps.zoom.max)
      await track.applyConstraints({
        advanced: [{ zoom: nuevoZoom } as MediaTrackConstraintSet],
      })
      setZoomActivo(!zoomActivo)
    } catch {
      // Ignorar
    }
  }

  const tocarParaEnfocar = async () => {
    const track = videoTrackRef.current
    if (!track) return
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      })
    } catch {
      // Ignorar
    }
  }

  const handleCerrar = async () => {
    await detenerCamaraSegura()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl border border-stone-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
            <ScanBarcode className="w-4 h-4 text-emerald-700" />
            <span>Añadir libro por ISBN</span>
          </div>
          <button
            type="button"
            onClick={handleCerrar}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!procesando && !borradorManual && (
            <div className="grid grid-cols-2 gap-2 bg-stone-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setModo('camara')}
                className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modo === 'camara'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Cámara</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await detenerCamaraSegura()
                  setModo('manual')
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modo === 'manual'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Escribir ISBN</span>
              </button>
            </div>
          )}

          {procesando ? (
            <div className="py-14 flex flex-col items-center justify-center text-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
              <p className="text-xs font-semibold text-stone-800">
                Buscando ficha, género y sinopsis del libro...
              </p>
            </div>
          ) : borradorManual ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!borradorManual.titulo.trim() || !borradorManual.autor.trim()) return
                guardarLibroEnEstanteria(borradorManual)
              }}
              className="space-y-3 py-1"
            >
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                No hemos encontrado la ficha completa del ISBN{' '}
                <strong>{borradorManual.isbn}</strong> en los catálogos externos. Complétala a mano para guardarlo:
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Título del libro *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={borradorManual.titulo}
                  onChange={(e) =>
                    setBorradorManual({ ...borradorManual, titulo: e.target.value })
                  }
                  placeholder="Ej. La muerte contada por un sapiens a un neandertal"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Autor o autores *
                </label>
                <input
                  type="text"
                  required
                  value={borradorManual.autor}
                  onChange={(e) =>
                    setBorradorManual({ ...borradorManual, autor: e.target.value })
                  }
                  placeholder="Ej. Juan José Millás, Juan Luis Arsuaga"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Género</label>
                <select
                  value={borradorManual.genero}
                  onChange={(e) =>
                    setBorradorManual({ ...borradorManual, genero: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
                >
                  {GENEROS_EXLIBRIS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Sinopsis (opcional)
                </label>
                <textarea
                  rows={3}
                  value={borradorManual.sinopsis || ''}
                  onChange={(e) =>
                    setBorradorManual({ ...borradorManual, sinopsis: e.target.value })
                  }
                  placeholder="Breve resumen del libro..."
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBorradorManual(null)
                    escaneadoRef.current = false
                  }}
                  className="px-3.5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar en mi estantería</span>
                </button>
              </div>
            </form>
          ) : modo === 'camara' ? (
            <div className="space-y-3">
              {errorCamara ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
                  <p>{errorCamara}</p>
                  <button
                    type="button"
                    onClick={() => setModo('manual')}
                    className="px-3 py-1.5 bg-amber-800 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    Introducir ISBN manualmente
                  </button>
                </div>
              ) : (
                <>
                  <div
                    onClick={tocarParaEnfocar}
                    className="relative rounded-2xl overflow-hidden bg-black border border-stone-200 cursor-pointer"
                  >
                    <div id="reader-isbn" className="w-full" />

                    {(soportaLinterna || soportaZoom) && (
                      <div
                        className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {soportaZoom && (
                          <button
                            type="button"
                            onClick={toggleZoom}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                              zoomActivo
                                ? 'bg-emerald-600 text-white'
                                : 'bg-black/70 text-white hover:bg-black/85'
                            }`}
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>{zoomActivo ? '1.4x' : '1x'}</span>
                          </button>
                        )}
                        {soportaLinterna && (
                          <button
                            type="button"
                            onClick={toggleLinterna}
                            className={`p-2 rounded-lg transition cursor-pointer ${
                              linternaActiva
                                ? 'bg-amber-400 text-stone-950'
                                : 'bg-black/70 text-white hover:bg-black/85'
                            }`}
                            title="Encender/apagar linterna"
                          >
                            <Flashlight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-stone-500 text-center leading-relaxed">
                    Separa el móvil unos <strong>15–20 cm</strong> del código de barras (el que empieza por <strong>978</strong> o <strong>979</strong>) y toca la imagen si necesita reenfocar.
                  </p>
                </>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                registrarLibroPorIsbn(isbnManual)
              }}
              className="space-y-3 py-2"
            >
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Código ISBN (10 o 13 dígitos)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={isbnManual}
                  onChange={(e) => setIsbnManual(e.target.value)}
                  placeholder="Ej. 9788408043645"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                Buscar y añadir libro
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}