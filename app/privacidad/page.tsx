import Link from 'next/link'
import { ArrowLeft, BookOpen, Scale, ShieldCheck } from 'lucide-react'

export const metadata = {
  title: 'Términos de Uso y Privacidad · Exlibris',
  description: 'Condiciones de uso y política de protección de datos de Exlibris.',
}

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 pb-16">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Exlibris</span>
          </Link>
          <div className="flex items-center gap-1.5 font-bold text-stone-900 text-sm">
            <BookOpen className="w-4 h-4 text-emerald-700" />
            <span>Exlibris</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-8">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
          <h1 className="text-xl font-bold text-stone-900">
            Términos de Uso y Política de Privacidad
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Última actualización: noviembre de 2026 · Adaptado al RGPD (UE) 2016/679 y LOPDGDD
          </p>
        </div>

        {/* BLOQUE 1: TÉRMINOS DE USO */}
        <section className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4 text-xs leading-relaxed text-stone-700">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <Scale className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2 className="text-base font-bold text-stone-900">
              1. Términos y Condiciones de Uso
            </h2>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">1.1. Objeto y naturaleza del servicio</h3>
            <p>
              <strong>Exlibris</strong> es una plataforma digital que facilita la catalogación de bibliotecas personales y el préstamo gratuito de libros físicos entre miembros de clubes privados de lectura o entre vecinos de un mismo código postal. Exlibris actúa únicamente como herramienta tecnológica de contacto y gestión; los acuerdos de entrega, plazo de lectura y devolución se establecen directamente entre el propietario del ejemplar y el lector solicitante.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">1.2. Registro y cuenta de usuario</h3>
            <p>
              El acceso se realiza mediante autenticación con cuenta de Google. El usuario se compromete a hacer un uso personal y lícito de su cuenta, pudiendo configurar un alias público y, de forma opcional, un código postal para participar en el intercambio vecinal.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">1.3. Reglas de uso, préstamos y convivencia</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Cuidado de los ejemplares:</strong> Devolver los libros prestados en el mismo estado de conservación en el que fueron entregados y dentro del plazo acordado en el chat privado.
              </li>
              <li>
                <strong>Respeto en el chat y reseñas:</strong> No publicar contenidos ilícitos, difamatorios, discriminatorios o spam en las reseñas ni en los chats de intercambio.
              </li>
              <li>
                <strong>Uso no comercial:</strong> No utilizar la plataforma para la venta encubierta de libros ni para fines publicitarios no autorizados.
              </li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">1.4. Contenidos y fotografías subidas</h3>
            <p>
              El usuario conserva la titularidad sobre las reseñas y fotografías que suba (portadas reales de libros o fotografías del estado de entrega y devolución) y concede a Exlibris una licencia gratuita y limitada al funcionamiento del servicio para almacenarlas y mostrarlas a los miembros autorizados del club o a la contraparte del préstamo. Queda prohibido subir imágenes con datos personales sensibles o de terceros sin su consentimiento.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">1.5. Propiedad intelectual y responsabilidad</h3>
            <p>
              El código fuente, diseño, estructura de base de datos y marca de Exlibris pertenecen a su titular (<strong>Nicolás Guerrero</strong>). Exlibris no responde por la pérdida, deterioro o retraso en la devolución de ejemplares prestados entre usuarios, sin perjuicio de las herramientas de seguimiento y registro fotográfico ofrecidas en la aplicación.
            </p>
          </div>
        </section>

        {/* BLOQUE 2: POLÍTICA DE PRIVACIDAD */}
        <section className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4 text-xs leading-relaxed text-stone-700">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2 className="text-base font-bold text-stone-900">
              2. Política de Privacidad (RGPD)
            </h2>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">2.1. Responsable del tratamiento</h3>
            <p>
              <strong>Responsable:</strong> Nicolás Guerrero (Proyecto Exlibris) · Donostia-San Sebastián (Gipuzkoa), España.<br />
              <strong>Contacto de privacidad:</strong>{' '}
              <a
                href="mailto:nicolas.guerrero.aguirre@gmail.com"
                className="text-emerald-700 underline font-medium"
              >
                nicolas.guerrero.aguirre@gmail.com
              </a>
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">2.2. Datos tratados y finalidad</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Cuenta e identificación (Google OAuth):</strong> Correo electrónico, identificador de usuario y alias público para gestionar tu estantería, clubes y préstamos (ejecución del servicio, art. 6.1.b RGPD).
              </li>
              <li>
                <strong>Código postal (opcional):</strong> Usado exclusivamente para mostrar ejemplares disponibles en tu barrio de forma anónima; tu nombre y correo permanecen ocultos hasta que aceptas una solicitud (consentimiento / activación voluntaria, art. 6.1.a RGPD).
              </li>
              <li>
                <strong>Actividad y multimedia:</strong> Ejemplares registrados, historial de préstamos, mensajes de chat, reseñas y fotos de estado o portada subidas voluntariamente.
              </li>
              <li>
                <strong>Notificaciones Web Push (opcional):</strong> Tokens criptográficos del navegador (<code className="bg-stone-100 px-1 rounded">endpoint</code>, <code className="bg-stone-100 px-1 rounded">p256dh</code>, <code className="bg-stone-100 px-1 rounded">auth</code>) guardados únicamente si activas las notificaciones, revocables en cualquier momento desde tu navegador (art. 6.1.a RGPD).
              </li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">2.3. Destinatarios y encargados</h3>
            <p>
              Tus datos no se venden ni ceden a terceros con fines comerciales. Para prestar el servicio técnicamente intervienen como encargados del tratamiento: <strong>Supabase Inc.</strong> (base de datos, autenticación y almacenamiento), <strong>Vercel Inc.</strong> (alojamiento web) y <strong>Google LLC</strong> (inicio de sesión OAuth y consulta técnica de metadatos públicos de libros por ISBN).
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">2.4. Conservación y derechos del usuario</h3>
            <p>
              Los datos se conservan mientras mantengas activa tu cuenta. Puedes eliminar tu cuenta y todos tus datos asociados (perfil, ejemplares registrados, listas, membresías e historial) de forma inmediata y automática desde el apartado <strong>«Mi Perfil y Barrio»</strong> dentro de la aplicación. Asimismo, puedes ejercer tus derechos de <strong>acceso, rectificación, supresión, oposición, limitación y portabilidad</strong> escribiendo a{' '}
              <a
                href="mailto:nicolas.guerrero.aguirre@gmail.com"
                className="text-emerald-700 underline font-medium"
              >
                nicolas.guerrero.aguirre@gmail.com
              </a>
              , así como reclamar ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> en <code className="bg-stone-100 px-1 rounded">www.aepd.es</code>.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-stone-900 text-sm">2.5. Cookies y almacenamiento local</h3>
            <p>
              Exlibris utiliza únicamente cookies técnicas de sesión y almacenamiento local necesarios para la autenticación y el funcionamiento offline/push de la PWA. No emplea cookies publicitarias ni de rastreo.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}