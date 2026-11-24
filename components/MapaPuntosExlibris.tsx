'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Coffee,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Send,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

export interface PuntoExlibris {
  id: string
  nombre: string
  tipo: 'cafeteria' | 'libreria' | 'centro_cultural'
  direccion: string
  codigo_postal: string
  latitud: number
  longitud: number
  horario_orientativo: string | null
  verificado: boolean
}

interface MapaPuntosExlibrisProps {
  codigoPostalInicial?: string | null
  modoSelector?: boolean
  onSeleccionarPunto?: (punto: PuntoExlibris) => void
  onClose?: () => void
}

const ETIQUETAS_TIPO: Record<
  PuntoExlibris['tipo'],
  { label: string; color: string; bg: string }
> = {
  cafeteria: { label: 'Cafetería', color: 'text-amber-800', bg: 'bg-amber-100' },
  libreria: { label: 'Librería de barrio', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  centro_cultural: { label: 'Biblioteca / Cultural', color: 'text-sky-800', bg: 'bg-sky-100' },
}

export default function MapaPuntosExlibris({
  codigoPostalInicial,
  modoSelector = false,
  onSeleccionarPunto,
  onClose,
}: MapaPuntosExlibrisProps) {
  const supabase = createClient()

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const markersLayerRef = useRef<import('leaflet').LayerGroup | null>(null)

  const [puntos, setPuntos] = useState<PuntoExlibris[]>([])
  const [cpFiltro, setCpFiltro] = useState<string>(codigoPostalInicial || '')
  const [verTodosCercanos, setVerTodosCercanos] = useState<boolean>(!codigoPostalInicial)
  const [cargando, setCargando] = useState(true)
  const [puntoActivo, setPuntoActivo] = useState<PuntoExlibris | null>(null)

  // Formulario para sugerir nuevo punto
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [tipoNuevo, setTipoNuevo] = useState<PuntoExlibris['tipo']>('cafeteria')
  const [direccionNueva, setDireccionNueva] = useState('')
  const [cpNuevo, setCpNuevo] = useState(codigoPostalInicial || '')
  const [horarioNuevo, setHorarioNuevo] = useState('')
  const [guardandoPunto, setGuardandoPunto] = useState(false)

  const cargarPuntos = useCallback(async () => {
    setCargando(true)
    let query = supabase
      .from('puntos_intercambio')
      .select('*')
      .order('verificado', { ascending: false })
      .order('nombre', { ascending: true })

    if (!verTodosCercanos && cpFiltro.trim().length >= 4) {
      query = query.eq('codigo_postal', cpFiltro.trim())
    }

    const { data } = await query
    const lista = (data as PuntoExlibris[]) || []
    setPuntos(lista)
    setPuntoActivo(lista[0] || null)
    setCargando(false)
  }, [supabase, cpFiltro, verTodosCercanos])

  useEffect(() => {
    cargarPuntos()
  }, [cargarPuntos])

  // Inicializar mapa Leaflet solo en cliente
  useEffect(() => {
    let montado = true

    const initMap = async () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return
      const L = (await import('leaflet')).default
      if (!montado || !mapContainerRef.current) return

      const map = L.map(mapContainerRef.current, {
        center: [43.3183, -1.9812],
        zoom: 14,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map)

      const layerGroup = L.layerGroup().addTo(map)
      mapInstanceRef.current = map
      markersLayerRef.current = layerGroup
    }

    initMap()

    return () => {
      montado = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersLayerRef.current = null
      }
    }
  }, [])

  // Pintar marcadores cuando cambian los puntos
  useEffect(() => {
    const actualizarMarcadores = async () => {
      const map = mapInstanceRef.current
      const layerGroup = markersLayerRef.current
      if (!map || !layerGroup) return

      const L = (await import('leaflet')).default
      layerGroup.clearLayers()

      if (puntos.length === 0) return

      const bounds: [number, number][] = []

      puntos.forEach((p) => {
        const colorHex =
          p.tipo === 'libreria'
            ? '#047857'
            : p.tipo === 'cafeteria'
            ? '#b45309'
            : '#0369a1'

        const icono = L.divIcon({
          className: 'custom-exlibris-pin',
          html: `<div style="background:${colorHex};width:26px;height:26px;border-radius:9999px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;">E</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })

        const marker = L.marker([p.latitud, p.longitud], { icon: icono })
        marker.on('click', () => {
          setPuntoActivo(p)
        })
        marker.addTo(layerGroup)
        bounds.push([p.latitud, p.longitud])
      })

      if (bounds.length === 1) {
        map.setView(bounds[0], 16)
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 })
      }
    }

    actualizarMarcadores()
  }, [puntos])

  const sugerirPunto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardandoPunto) return
    setGuardandoPunto(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Debes iniciar sesión.')

      // Geocodificar dirección con Nominatim (OpenStreetMap gratuito)
      const q = encodeURIComponent(`${direccionNueva.trim()}, ${cpNuevo.trim()}, España`)
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
        { headers: { 'Accept-Language': 'es' } }
      )
      const geoData = await geoRes.json()

      if (!Array.isArray(geoData) || geoData.length === 0) {
        throw new Error(
          'No hemos podido ubicar esa dirección exacta en el mapa. Prueba añadiendo la calle y el número.'
        )
      }

      const latitud = parseFloat(geoData[0].lat)
      const longitud = parseFloat(geoData[0].lon)

      const { error } = await supabase.from('puntos_intercambio').insert({
        nombre: nombreNuevo.trim(),
        tipo: tipoNuevo,
        direccion: direccionNueva.trim(),
        codigo_postal: cpNuevo.trim(),
        latitud,
        longitud,
        horario_orientativo: horarioNuevo.trim() || null,
        verificado: false,
        creado_por: user.id,
      })

      if (error) throw error

      setNombreNuevo('')
      setDireccionNueva('')
      setHorarioNuevo('')
      setMostrandoForm(false)
      setCpFiltro(cpNuevo.trim())
      setVerTodosCercanos(false)
      await cargarPuntos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el punto'
      alert(msg)
    } finally {
      setGuardandoPunto(false)
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-700" />
            <span>Puntos Exlibris de intercambio</span>
          </h3>
          <p className="text-[11px] text-stone-500">
            Cafeterías, librerías y espacios públicos neutrales para entregar libros con seguridad.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Controles de filtro por CP y botón sugerir */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            maxLength={5}
            value={cpFiltro}
            onChange={(e) => {
              setCpFiltro(e.target.value.replace(/\D/g, ''))
              setVerTodosCercanos(false)
            }}
            placeholder="CP (ej. 20004)"
            className="w-28 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => setVerTodosCercanos((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition ${
              verTodosCercanos
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
            }`}
          >
            {verTodosCercanos ? 'Mostrando todos' : 'Ver todos'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMostrandoForm((prev) => !prev)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Sugerir punto</span>
        </button>
      </div>

      {/* Formulario sugerir punto */}
      {mostrandoForm && (
        <form
          onSubmit={sugerirPunto}
          className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-2.5"
        >
          <p className="text-xs font-bold text-stone-800">Proponer nuevo punto de intercambio</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Nombre (ej. Café Botanika)"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
            <select
              value={tipoNuevo}
              onChange={(e) => setTipoNuevo(e.target.value as PuntoExlibris['tipo'])}
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            >
              <option value="cafeteria">Cafetería</option>
              <option value="libreria">Librería de barrio</option>
              <option value="centro_cultural">Biblioteca / Centro cultural</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              required
              value={direccionNueva}
              onChange={(e) => setDireccionNueva(e.target.value)}
              placeholder="Calle y número"
              className="col-span-2 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
            <input
              type="text"
              required
              maxLength={5}
              value={cpNuevo}
              onChange={(e) => setCpNuevo(e.target.value.replace(/\D/g, ''))}
              placeholder="CP"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>
          <input
            type="text"
            value={horarioNuevo}
            onChange={(e) => setHorarioNuevo(e.target.value)}
            placeholder="Horario orientativo (opcional, ej. L-S 10:00–20:00)"
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMostrandoForm(false)}
              className="px-3 py-1.5 bg-stone-200/70 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoPunto}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {guardandoPunto && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{guardandoPunto ? 'Ubicando...' : 'Guardar punto'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Contenedor del mapa */}
      <div className="relative h-64 w-full rounded-2xl overflow-hidden border border-stone-200 z-0">
        <div ref={mapContainerRef} className="h-full w-full" />
        {cargando && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-stone-600 font-medium">
            Cargando mapa...
          </div>
        )}
      </div>

      {/* Tarjeta de detalle del punto seleccionado en el mapa */}
      {puntoActivo ? (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  ETIQUETAS_TIPO[puntoActivo.tipo].bg
                } ${ETIQUETAS_TIPO[puntoActivo.tipo].color}`}
              >
                {puntoActivo.tipo === 'cafeteria' ? (
                  <Coffee className="w-3 h-3" />
                ) : puntoActivo.tipo === 'libreria' ? (
                  <BookOpen className="w-3 h-3" />
                ) : (
                  <Building2 className="w-3 h-3" />
                )}
                {ETIQUETAS_TIPO[puntoActivo.tipo].label}
              </span>
              {puntoActivo.verificado && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> Verificado
                </span>
              )}
            </div>

            <h4 className="text-xs font-bold text-stone-900">{puntoActivo.nombre}</h4>
            <p className="text-[11px] text-stone-600">
              {puntoActivo.direccion} ({puntoActivo.codigo_postal})
            </p>
            {puntoActivo.horario_orientativo && (
              <p className="text-[11px] text-stone-400">Horario: {puntoActivo.horario_orientativo}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`https://www.openstreetmap.org/?mlat=${puntoActivo.latitud}&mlon=${puntoActivo.longitud}#map=17/${puntoActivo.latitud}/${puntoActivo.longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-medium inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Cómo llegar</span>
            </a>

            {modoSelector && onSeleccionarPunto && (
              <button
                type="button"
                onClick={() => onSeleccionarPunto(puntoActivo)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Proponer aquí</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        !cargando && (
          <p className="text-xs text-stone-400 text-center py-2">
            No hay puntos registrados todavía en este código postal. ¡Pulsa &ldquo;Sugerir punto&rdquo; para añadir el primero!
          </p>
        )
      )}

      {/* Lista rápida horizontal para cambiar de punto sin tocar el pin */}
      {puntos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {puntos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPuntoActivo(p)
                mapInstanceRef.current?.setView([p.latitud, p.longitud], 16)
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border cursor-pointer transition ${
                puntoActivo?.id === p.id
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}