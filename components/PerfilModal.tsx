'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { AlertTriangle, Check, MapPin, ShieldCheck, Trash2, User, X } from 'lucide-react'

interface PerfilModalProps {
  isOpen: boolean
  userId: string
  userEmail: string
  defaultName: string
  onClose: () => void
  onPerfilGuardado: (nuevoAlias: string) => void
}

export default function PerfilModal({
  isOpen,
  userId,
  userEmail,
  defaultName,
  onClose,
  onPerfilGuardado,
}: PerfilModalProps) {
  const supabase = createClient()
  const [alias, setAlias] = useState(defaultName)
  const [codigoPostal, setCodigoPostal] = useState('')
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [mostrarBorrarCuenta, setMostrarBorrarCuenta] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false)

  useEffect(() => {
    if (!isOpen || !userId) return

    const cargarPerfil = async () => {
      setCargando(true)
      const { data } = await supabase
        .from('perfiles')
        .select('nombre, nombre_usuario, codigo_postal')
        .eq('id', userId)
        .maybeSingle()

      setAlias(data?.nombre || data?.nombre_usuario || defaultName)
      setCodigoPostal(data?.codigo_postal || '')
      setMostrarBorrarCuenta(false)
      setTextoConfirmacion('')
      setCargando(false)
    }

    cargarPerfil()
  }, [isOpen, userId, defaultName, supabase])

  if (!isOpen) return null

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardando) return

    const aliasLimpio = alias.trim() || defaultName || 'Lector'
    const cpLimpio = codigoPostal.trim()

    if (cpLimpio && !/^\d{5}$/.test(cpLimpio)) {
      alert('Introduce un código postal válido de 5 dígitos (ej. 20001) o déjalo vacío.')
      return
    }

    setGuardando(true)

    const { error } = await supabase.from('perfiles').upsert({
      id: userId,
      email: userEmail,
      nombre: aliasLimpio,
      nombre_usuario: aliasLimpio,
      codigo_postal: cpLimpio || null,
    })

    setGuardando(false)

    if (error) {
      alert(`No se pudo guardar el perfil: ${error.message}`)
    } else {
      onPerfilGuardado(aliasLimpio)
      onClose()
    }
  }

  const handleEliminarCuenta = async () => {
    if (textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR' || eliminandoCuenta) return
    setEliminandoCuenta(true)

    try {
      const res = await fetch('/api/eliminar-cuenta', { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'No se pudo eliminar la cuenta.')
        setEliminandoCuenta(false)
        return
      }

      await supabase.auth.signOut()
      window.location.href = '/'
    } catch {
      alert('Error de conexión al intentar eliminar la cuenta.')
      setEliminandoCuenta(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl border border-stone-200 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-100 px-5 py-3.5 flex items-center justify-between sticky top-0 bg-white z-10">
          <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Mi Perfil y Barrio
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={guardarPerfil} className="p-5 space-y-4">
          {cargando ? (
            <p className="text-xs text-stone-400 text-center py-6">Cargando perfil...</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Alias público en tus clubes</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Tu nombre o apodo lector"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Cuenta conectada: {userEmail}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  <span>Código postal (opcional · Préstamo vecinal)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 20001"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-sky-600"
                />
                <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                  Permite descubrir libros de vecinos en tu zona. Tu identidad permanece anónima hasta que aceptes una solicitud.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{guardando ? 'Guardando...' : 'Guardar cambios'}</span>
                </button>
              </div>

              <div className="pt-3 border-t border-stone-100 flex flex-col items-center gap-3">
                <Link
                  href="/privacidad"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-emerald-700 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Términos de Uso y Política de Privacidad</span>
                </Link>

                {!mostrarBorrarCuenta ? (
                  <button
                    type="button"
                    onClick={() => setMostrarBorrarCuenta(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Eliminar mi cuenta y todos mis datos</span>
                  </button>
                ) : (
                  <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-2.5 text-left">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>¿Eliminar definitivamente tu cuenta?</span>
                    </div>
                    <p className="text-[11px] text-red-800 leading-relaxed">
                      Se borrarán de forma permanente tu perfil, tus libros catalogados, tu lista «¡Me lo apunto!», tus clubes creados y tu acceso. Esta acción no se puede deshacer.
                    </p>
                    <input
                      type="text"
                      value={textoConfirmacion}
                      onChange={(e) => setTextoConfirmacion(e.target.value)}
                      placeholder="Escribe ELIMINAR para confirmar"
                      className="w-full px-3 py-1.5 bg-white border border-red-300 rounded-lg text-xs text-stone-900 placeholder:text-red-300 focus:outline-none focus:border-red-600"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMostrarBorrarCuenta(false)
                          setTextoConfirmacion('')
                        }}
                        disabled={eliminandoCuenta}
                        className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleEliminarCuenta}
                        disabled={
                          textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR' ||
                          eliminandoCuenta
                        }
                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold cursor-pointer transition"
                      >
                        {eliminandoCuenta ? 'Eliminando...' : 'Borrar cuenta para siempre'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}