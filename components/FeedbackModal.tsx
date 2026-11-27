'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { enviarNotificacionPush } from '@/utils/notificaciones'
import { Bug, CheckCircle2, Lightbulb, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react'
import { enviarNotificacionEmail } from '@/utils/notificacionesEmail'

interface FeedbackModalProps {
  abierto: boolean
  onClose: () => void
  userId: string
  nombreUsuario: string
  pantallaActual?: string
}

const ADMIN_USER_ID = '69f95e0c-da67-4725-806c-a58d9da86095'

export default function FeedbackModal({
  abierto,
  onClose,
  userId,
  nombreUsuario,
  pantallaActual = 'General',
}: FeedbackModalProps) {
  const supabase = createClient()
  const [tipo, setTipo] = useState<'fallo' | 'mejora' | 'idea' | 'otro'>('fallo')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  if (!abierto) return null

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mensaje.trim() || enviando) return
    setEnviando(true)

    const textoLimpio = mensaje.trim()
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''

    const { error } = await supabase.from('feedback_usuarios').insert({
      usuario_id: userId,
      tipo,
      mensaje: textoLimpio,
      pantalla: pantallaActual,
      user_agent: userAgent,
    })

    setEnviando(false)

    if (error) {
      alert(`No se pudo enviar el mensaje: ${error.message}`)
      return
    }

    if (ADMIN_USER_ID) {
      enviarNotificacionPush({
        destinatarioId: ADMIN_USER_ID,
        titulo: `Feedback (${tipo.toUpperCase()}) de ${nombreUsuario}`,
        cuerpo: textoLimpio.slice(0, 120),
        url: '/',
      })
    }

    enviarNotificacionEmail({
      tipo: 'feedback_admin',
      asunto: `[Exlibris · ${tipo.toUpperCase()}] Comentario de ${nombreUsuario}`,
      titulo: `Nuevo feedback (${tipo.toUpperCase()})`,
      cuerpo: `De: ${nombreUsuario}\nPantalla: ${pantallaActual}\n\n${textoLimpio}\n\nDispositivo: ${userAgent}`,
    })

    setEnviando(false)

    if (error) {
      alert(`No se pudo enviar el mensaje: ${error.message}`)
      return
    }

    if (ADMIN_USER_ID) {
      enviarNotificacionPush({
        destinatarioId: ADMIN_USER_ID,
        titulo: `Feedback (${tipo.toUpperCase()}) de ${nombreUsuario}`,
        cuerpo: textoLimpio.slice(0, 120),
        url: '/',
      })
    }

    setEnviado(true)
    setMensaje('')
    setTimeout(() => {
      setEnviado(false)
      onClose()
    }, 1500)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-stone-200 shadow-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-stone-900">
              Enviar feedback a Nico
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {enviado ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-stone-900">¡Recibido! Muchas gracias</p>
            <p className="text-xs text-stone-500">
              Me llega directo al móvil para revisarlo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleEnviar} className="space-y-3.5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'fallo', label: 'Algo falla', icon: Bug },
                { id: 'mejora', label: 'Mejora', icon: Sparkles },
                { id: 'idea', label: 'Idea', icon: Lightbulb },
              ].map((op) => {
                const Icono = op.icon
                const activo = tipo === op.id
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setTipo(op.id as 'fallo' | 'mejora' | 'idea')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      activo
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Icono className="w-3.5 h-3.5" />
                    <span>{op.label}</span>
                  </button>
                )
              })}
            </div>

            <div>
              <textarea
                rows={4}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder={
                  tipo === 'fallo'
                    ? 'Cuéntame qué estabas haciendo y qué ha pasado...'
                    : '¿Qué cambiarías o añadirías para que sea más cómoda?'
                }
                className="w-full p-3 border border-stone-300 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-emerald-600 resize-none"
                required
              />
              <p className="text-[10px] text-stone-400 mt-1">
                Se adjunta automáticamente la pestaña actual ({pantallaActual}) y tu modelo de dispositivo para reproducir fallos.
              </p>
            </div>

            <button
              type="submit"
              disabled={enviando || !mensaje.trim()}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{enviando ? 'Enviando...' : 'Enviar comentario'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}