interface NotificacionEmailParams {
  tipo?: 'feedback_admin' | 'usuario'
  destinatarioId?: string
  asunto: string
  titulo: string
  cuerpo: string
  url?: string
}

export async function enviarNotificacionEmail(params: NotificacionEmailParams) {
  try {
    await fetch('/api/notificar-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch {
    // Fallo silencioso para no interrumpir la acción principal del usuario
  }
}