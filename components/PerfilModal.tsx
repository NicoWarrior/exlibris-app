'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Check, Loader2, MapPin, ShieldCheck, User, X } from 'lucide-react'

interface PerfilModalProps {
  isOpen: boolean
  userId: string
  userEmail: string
  defaultName?: string
  onClose: () => void
  onPerfilGuardado: (nuevoAlias: string) => void
}

export default function PerfilModal({
  isOpen,
  userId,
  userEmail,
  defaultName = '',
  onClose,
  onPerfilGuardado,
}: PerfilModalProps) {
  const supabase = createClient()
  const [alias, setAlias] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [codigoPostal, setCodigoPostal] = useState('')
  const [bio, setBio] = useState('')
  const [busquedaLocal, setBusquedaLocal] = useState(false)

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)

  useEffect(() => {
    if (!isOpen || !userId) return

    const cargarPerfil = async () => {
      setCargando(true)
      setGuardadoOk(false)

      const { data } = await supabase
        .from('perfiles')
        .select('nombre, nombre_usuario, ciudad, codigo_postal, bio, busqueda_local_activa')
        .eq('id', userId)
        .maybeSingle()

      if (data) {
        setAlias(data.nombre || data.nombre_usuario || defaultName)
        setCiudad(data.ciudad || '')
        setCodigoPostal(data.codigo_postal || '')
        setBio(data.bio || '')
        setBusquedaLocal(Boolean(data.busqueda_local_activa))
      } else {
        setAlias(defaultName)
        setCiudad('')
        setCodigoPostal('')
        setBio('')
        setBusquedaLocal(false)
      }

      setCargando(false)
    }

    cargarPerfil()
  }, [isOpen, userId, defaultName, supabase])

  if (!isOpen) return null

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alias.trim() || guardando) return
    setGuardando(true)
    setGuardadoOk(false)

    const aliasLimpio = alias.trim()
    const cpLimpio = codigoPostal.replace(/\D/g, '').slice(0, 5)

    const { error } = await supabase.from('perfiles').upsert({
      id: userId,
      email: userEmail,
      nombre: aliasLimpio,
      nombre_usuario: aliasLimpio,
      ciudad: ciudad.trim() || null,
      codigo_postal: cpLimpio || null,
      bio: bio.trim() || null,
      busqueda_local_activa: busquedaLocal,
    })

    setGuardando(false)
    if (error) {
      alert(`No se pudo guardar el perfil: ${error.message}`)
    } else {
      setGuardadoOk(true)
      onPerfilGuardado(aliasLimpio)
      setTimeout(() => {
        onClose()
      }, 700)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur-xs border-b border-stone-100 px-5 py-3.5 flex items-center justify-between z-10">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-700" />
            <span>Mi Perfil y Privacidad</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {cargando ? (
          <div className="py-12 flex items-center justify-center text-xs text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2 text-emerald-700" />
            Cargando datos de perfil...
          </div>
        ) : (
          <form onSubmit={guardarPerfil} className="p-5 space-y-4">
            {/* Alias visible */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Alias o nombre visible en los clubes *
              </label>
              <input
                type="text"
                maxLength={40}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej. Nico G."
                className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
                required
              />
              <p className="text-[11px] text-stone-400 mt-1">
                Así te verán tus compañeros en clubes, reseñas y préstamos (tu correo nunca se muestra).
              </p>
            </div>

            {/* Municipio y Código Postal */}
            <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                <span>Zona aproximada para entregas</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Municipio
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    placeholder="Ej. Donostia"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Cód. Postal
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={codigoPostal}
                    onChange={(e) => setCodigoPostal(e.target.value.replace(/\D/g, ''))}
                    placeholder="20001"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={busquedaLocal}
                  onChange={(e) => setBusquedaLocal(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span className="text-[11px] text-stone-600 leading-snug">
                  Permitir que lectores de mi mismo código postal vean mis libros marcados como disponibles de forma anónima.
                </span>
              </label>

              <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1.5 rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                <span>Nunca pedimos ni almacenamos tu calle o número de portal.</span>
              </div>
            </div>

            {/* Breve bio o gustos lectores */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Sobre tus lecturas (opcional)
              </label>
              <textarea
                rows={2}
                maxLength={200}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ej. Me gusta la novela histórica, ciencia ficción y ensayos..."
                className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-emerald-600"
              />
            </div>

            {/* Botón Guardar */}
            <div className="pt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || !alias.trim()}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {guardando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{guardadoOk ? '¡Guardado!' : 'Guardar perfil'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}