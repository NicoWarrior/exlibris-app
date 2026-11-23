'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { createClient } from '@/utils/supabase/client'
import { normalizarGenero } from '@/utils/generos'
import {
  Camera,
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

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const escaneadoRef = useRef(false)

  const registrarLibroPorIsbn = useCallback(
    async (isbnCrudo: string) => {
      const isbn = isbnCrudo.replace(/[^0-9Xx]/g, '').toUpperCase()
      if (isbn.length !== 10 && isbn.length !== 13) {
        alert('El ISBN debe tener 10 o 13 dígitos.')
        return
      }

      if (procesando) return
      setProcesando(true)

      try {
        // 1. Comprobar si ya existe en libros_catalogo
        const { data: existente } = await supabase
          .from('libros_catalogo')
          .select('isbn, titulo')
          .eq('isbn', isbn)
          .maybeSingle()

        if (!existente) {
          let titulo = `Libro ISBN ${isbn}`
          let autor = 'Autor desconocido'
          let portadaUrl = ''
          let genero = 'Otros'
          let sinopsis: string | null = null

          // Consultar Google Books
          const resGoogle = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
          )
          const dataGoogle = await resGoogle.json()
          const info = dataGoogle.items?.[0]?.volumeInfo

          if (info) {
            titulo = info.title || titulo
            autor = Array.isArray(info.authors) ? info.authors.join(', ') : autor
            portadaUrl =
              info.imageLinks?.thumbnail?.replace('http://', 'https://') || ''
            genero = normalizarGenero(info.categories)
            sinopsis = info.description || null
          }

          if (!portadaUrl) {
            portadaUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`
          }

          const { error: catError } = await supabase.from('libros_catalogo').insert({
            isbn,
            titulo,
            autor,
            portada_url: portadaUrl,
            genero,
            sinopsis,
          })

          if (catError) throw catError
        }

        // 2. Crear ejemplar en la estantería del usuario
        const { data: nuevoEjemplar, error: ejError } = await supabase
          .from('ejemplares')
          .insert({
            isbn,
            propietario_id: userId,
            estado: 'disponible',
            visible_local: false,
          })
          .select('id')
          .single()

        if (ejError) throw ejError

        // 3. Compartir automáticamente en los clubes del usuario
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
        escaneadoRef.current = false
      } finally {
        setProcesando(false)
      }
    },
    [supabase, userId, procesando, onBookAdded, onClose]
  )

  useEffect(() => {
    if (modo !== 'camara') return

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
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.min(Math.floor(viewfinderWidth * 0.85), 340),
              height: Math.min(Math.floor(viewfinderHeight * 0.35), 130),
            }),
            aspectRatio: 1.5,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          (decodedText) => {
            if (escaneadoRef.current) return
            const limpio = decodedText.replace(/\D/g, '')
            if (limpio.length === 13 || limpio.length === 10) {
              escaneadoRef.current = true
              if (navigator.vibrate) navigator.vibrate(80)
              html5Qr
                .stop()
                .catch(() => {})
                .finally(() => registrarLibroPorIsbn(limpio))
            }
          },
          () => {
            // Ignorar frames sin lectura
          }
        )

        // Aplicar enfoque continuo y comprobar capacidades de linterna / zoom
        if (montado) {
          const videoEl = document.querySelector('#reader-isbn video') as HTMLVideoElement | null
          const stream = videoEl?.srcObject as MediaStream | null
          const track = stream?.getVideoTracks()?.[0] || null
          videoTrackRef.current = track

          if (track && typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities() as MediaTrackCapabilities & {
              focusMode?: string[]
              torch?: boolean
              zoom?: { min: number; max: number; step: number }
            }

            const constraintsAvanzados: Record<string, unknown> = {}

            if (caps.focusMode?.includes('continuous')) {
              constraintsAvanzados.focusMode = 'continuous'
            }

            if (caps.zoom && caps.zoom.max >= 1.5) {
              setSoportaZoom(true)
              const zoomInicial = Math.min(1.5, caps.zoom.max)
              constraintsAvanzados.zoom = zoomInicial
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
      const qr = scannerRef.current
      if (qr) {
        qr.stop()
          .then(() => qr.clear())
          .catch(() => {})
      }
      videoTrackRef.current = null
      setLinternaActiva(false)
      setZoomActivo(false)
    }
  }, [modo, registrarLibroPorIsbn])

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
      // Dispositivo no permite alternar torch en caliente
    }
  }

  const toggleZoom = async () => {
    const track = videoTrackRef.current
    if (!track) return
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number }
    }
    if (!caps.zoom) return
    const nuevoZoom = zoomActivo ? 1 : Math.min(1.6, caps.zoom.max)
    try {
      await track.applyConstraints({
        advanced: [{ zoom: nuevoZoom } as MediaTrackConstraintSet],
      })
      setZoomActivo(!zoomActivo)
    } catch {
      // Ignorar si no aplica
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
      // Ignorar en navegadores sin control manual de foco
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
            <ScanBarcode className="w-4 h-4 text-emerald-700" />
            <span>Añadir libro por ISBN</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
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
              onClick={() => setModo('manual')}
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

          {procesando ? (
            <div className="py-14 flex flex-col items-center justify-center text-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
              <p className="text-xs font-semibold text-stone-800">
                Buscando ficha y portada del libro...
              </p>
            </div>
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
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 backdrop-blur-xs transition cursor-pointer ${
                              zoomActivo
                                ? 'bg-emerald-600 text-white'
                                : 'bg-black/65 text-white hover:bg-black/80'
                            }`}
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>{zoomActivo ? '1.5x' : '1x'}</span>
                          </button>
                        )}
                        {soportaLinterna && (
                          <button
                            type="button"
                            onClick={toggleLinterna}
                            className={`p-2 rounded-lg backdrop-blur-xs transition cursor-pointer ${
                              linternaActiva
                                ? 'bg-amber-400 text-stone-950'
                                : 'bg-black/65 text-white hover:bg-black/80'
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