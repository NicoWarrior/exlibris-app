'use client'

import { useEffect, useState } from 'react'
import { Download, PlusSquare, Share, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY_DISMISSED = 'exlibris_install_banner_dismissed_v1'

export default function InstalarAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [mostrarIosGuide, setMostrarIosGuide] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const [oculto, setOculto] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Si ya está abierta como app instalada (PWA standalone), no mostrar nada
    const esStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (esStandalone) return

    // 2. Si el usuario ya cerró el aviso manualmente, respetarlo
    if (localStorage.getItem(STORAGE_KEY_DISMISSED) === '1') return

    // 3. Capturar evento nativo de instalación en Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setMostrarIosGuide(false)
      setOculto(false)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setMostrarIosGuide(false)
      setOculto(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // 4. Detectar iPhone / iPad en Safari (Apple no soporta beforeinstallprompt)
    const ua = window.navigator.userAgent
    const esIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const esSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)

    if (esIos && esSafari) {
      setMostrarIosGuide(true)
      setOculto(false)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const cerrarBanner = () => {
    setOculto(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DISMISSED, '1')
    }
  }

  const lanzarInstalacionAndroid = async () => {
    if (!deferredPrompt || instalando) return
    setInstalando(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setOculto(true)
      }
    } finally {
      setDeferredPrompt(null)
      setInstalando(false)
    }
  }

  if (oculto || (!deferredPrompt && !mostrarIosGuide)) {
    return null
  }

  return (
    <div className="bg-emerald-950 text-white rounded-2xl p-3.5 shadow-sm border border-emerald-800/80 mb-4 relative">
      <button
        type="button"
        onClick={cerrarBanner}
        aria-label="Cerrar aviso de instalación"
        className="absolute top-2.5 right-2.5 p-1 text-emerald-300/80 hover:text-white rounded-lg hover:bg-emerald-900 transition cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <img
          src="/logo.png"
          alt="Exlibris"
          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-emerald-700/70 bg-white"
        />

        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-xs font-bold text-white leading-tight">
              Instala Exlibris en tu pantalla de inicio
            </p>
            <p className="text-[11px] text-emerald-200/90 mt-0.5 leading-snug">
              Accede al escáner ISBN y a tus préstamos en un toque, como una app nativa.
            </p>
          </div>

          {deferredPrompt ? (
            <button
              type="button"
              onClick={lanzarInstalacionAndroid}
              disabled={instalando}
              className="py-1.5 px-3.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{instalando ? 'Instalando...' : 'Instalar aplicación'}</span>
            </button>
          ) : (
            <div className="bg-emerald-900/70 border border-emerald-800 rounded-xl px-3 py-2 text-[11px] text-emerald-100 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>En Safari: pulsa</span>
              <span className="inline-flex items-center gap-1 font-semibold text-white bg-emerald-800 px-1.5 py-0.5 rounded-md">
                <Share className="w-3 h-3 text-sky-300" />
                Compartir
              </span>
              <span>y elige</span>
              <span className="inline-flex items-center gap-1 font-semibold text-white bg-emerald-800 px-1.5 py-0.5 rounded-md">
                <PlusSquare className="w-3 h-3 text-emerald-300" />
                Añadir a pantalla de inicio
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}