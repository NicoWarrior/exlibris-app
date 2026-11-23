import { createClient } from '@/utils/supabase/client'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function activarNotificacionesPush(userId: string): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    alert(
      'Tu navegador no soporta notificaciones Push. En iPhone añade primero la app a la pantalla de inicio.'
    )
    return false
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    alert('Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY.')
    return false
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    alert('Has bloqueado el permiso de notificaciones en el navegador.')
    return false
  }

  const registro = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let suscripcion = await registro.pushManager.getSubscription()
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = suscripcion.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  const supabase = createClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  )

  return !error
}

export async function enviarNotificacionPush(params: {
  destinatarioId: string
  titulo: string
  cuerpo: string
  url?: string
}) {
  try {
    await fetch('/api/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch {
    // No bloquear el flujo principal si falla la notificación
  }
}