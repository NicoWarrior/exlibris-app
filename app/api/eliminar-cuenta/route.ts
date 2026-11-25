import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function DELETE() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Falta configurar las claves de Supabase en el servidor.' },
        { status: 500 }
      )
    }

    // 1. Verificar sesión del usuario actual mediante las cookies de Next.js
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // En Route Handlers de borrado se puede ignorar si ya se cierra sesión
          }
        },
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado. Inicia sesión de nuevo.' },
        { status: 401 }
      )
    }

    // 2. Cliente administrador (solo en servidor) para limpiar registros y borrar auth.users
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const userId = user.id

    // 3. Borrado ordenado de datos asociados al usuario
    await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId)
    await supabaseAdmin.from('lista_deseos').delete().eq('usuario_id', userId)
    await supabaseAdmin.from('miembros_club').delete().eq('usuario_id', userId)
    await supabaseAdmin.from('resenas_libro').delete().eq('usuario_id', userId)
    await supabaseAdmin.from('valoraciones').delete().eq('usuario_id', userId)
    await supabaseAdmin.from('mensajes_prestamo').delete().eq('remitente_id', userId)

    // Eliminar préstamos donde participe como dueño o lector
    await supabaseAdmin
      .from('prestamos')
      .delete()
      .or(`propietario_id.eq.${userId},lector_id.eq.${userId}`)

    // Eliminar ejemplares físicos y su vínculo en clubes
    const { data: misEjemplares } = await supabaseAdmin
      .from('ejemplares')
      .select('id')
      .eq('propietario_id', userId)

    if (misEjemplares && misEjemplares.length > 0) {
      const idsEjemplares = misEjemplares.map((e) => e.id)
      await supabaseAdmin
        .from('ejemplares_club')
        .delete()
        .in('ejemplar_id', idsEjemplares)
    }

    await supabaseAdmin.from('ejemplares').delete().eq('propietario_id', userId)

    // Eliminar clubes creados por este usuario
    const { data: misClubes } = await supabaseAdmin
      .from('clubes')
      .select('id')
      .eq('creado_por', userId)

    if (misClubes && misClubes.length > 0) {
      const idsClubes = misClubes.map((c) => c.id)
      await supabaseAdmin.from('ejemplares_club').delete().in('club_id', idsClubes)
      await supabaseAdmin.from('miembros_club').delete().in('club_id', idsClubes)
      await supabaseAdmin.from('clubes').delete().in('id', idsClubes)
    }

    // Borrar fila de perfil
    await supabaseAdmin.from('perfiles').delete().eq('id', userId)

    // 4. Eliminar definitivamente la cuenta de autenticación (auth.users)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      return NextResponse.json(
        { error: `No se pudo eliminar la cuenta: ${deleteUserError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}