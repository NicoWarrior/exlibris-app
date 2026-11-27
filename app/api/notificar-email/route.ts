import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      tipo,
      destinatarioId,
      asunto,
      titulo,
      cuerpo,
      url = 'https://exlibris-app.vercel.app',
    } = body

    let emailDestino: string | undefined

    if (tipo === 'feedback_admin') {
      emailDestino = process.env.ADMIN_EMAIL || process.env.GMAIL_USER
    } else if (destinatarioId) {
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.admin.getUserById(destinatarioId)

      if (userError || !userData?.user?.email) {
        return NextResponse.json(
          { error: 'Destinatario sin correo válido' },
          { status: 404 }
        )
      }
      emailDestino = userData.user.email
    }

    if (!emailDestino) {
      return NextResponse.json(
        { error: 'Falta correo de destino' },
        { status: 400 }
      )
    }

    await transporter.sendMail({
      from: `"Exlibris· Comparte lectura" <${process.env.GMAIL_USER}>`,
      to: emailDestino,
      subject: asunto || `Exlibris · ${titulo}`,
      text: `${titulo}\n\n${cuerpo}\n\nAbrir Exlibris: ${url}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1917;">
          <h2 style="font-size: 16px; color: #065f46; margin-bottom: 8px;">${titulo}</h2>
          <p style="font-size: 14px; line-height: 1.5; white-space: pre-line;">${cuerpo}</p>
          <div style="margin-top: 20px;">
            <a href="${url}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;">
              Abrir Exlibris
            </a>
          </div>
          <p style="font-size: 11px; color: #78716c; margin-top: 24px;">
            Exlibris · Comparte lectura en tu barrio
          </p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error enviando email:', err)
    return NextResponse.json(
      { error: 'Error interno enviando email' },
      { status: 500 }
    )
  }
}