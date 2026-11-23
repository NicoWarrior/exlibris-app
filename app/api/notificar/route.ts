import { NextResponse } from 'next/server'
import * as webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || ''

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    'mailto:soporte@exlibris.app',
    publicVapidKey,
    privateVapidKey
  )
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    if (!publicVapidKey || !privateVapidKey) {
      return NextResponse.json(
        { error: 'Claves VAPID no configuradas en el servidor' },
        { status: 500 }
      )
    }

    const { destinatarioId, titulo, cuerpo, url } = await request.json()

    if (!destinatarioId || !titulo || !cuerpo) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const { data: suscripciones, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', destinatarioId)

    if (error || !suscripciones || suscripciones.length === 0) {
      return NextResponse.json({ enviados: 0 })
    }

    const payload = JSON.stringify({
      title: titulo,
      body: cuerpo,
      url: url || '/',
    })

    let enviados = 0
    await Promise.all(
      suscripciones.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          enviados++
        } catch (err: unknown) {
          const statusCode =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? (err as { statusCode?: number }).statusCode
              : undefined
          if (statusCode === 410 || statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      })
    )

    return NextResponse.json({ enviados })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}