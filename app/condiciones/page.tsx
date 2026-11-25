import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'

export const metadata = {
  title: 'Condiciones del Servicio · Exlibris',
  description: 'Normas de uso y condiciones del servicio de intercambio gratuito de libros Exlibris.',
}

export default function CondicionesPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-800 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <BookOpen className="w-5 h-5" />
            <span>Exlibris</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a la app</span>
          </Link>
        </div>

        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900">
            Condiciones del Servicio
          </h1>
          <p className="text-xs text-stone-400">
            Última actualización: noviembre de 2026
          </p>
        </header>

        <section className="space-y-4 text-xs sm:text-sm text-stone-600 leading-relaxed">
          <div className="space-y-1.5">
            <h2 className="font-bold text-stone-900 text-sm">1. Objeto del servicio</h2>
            <p>
              Exlibris es una plataforma colaborativa y gratuita diseñada para catalogar
              bibliotecas personales y facilitar el préstamo temporal de libros físicos entre
              miembros de clubes de lectura privados y vecinos cercanos.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bold text-stone-900 text-sm">2. Carácter gratuito</h2>
            <p>
              Todos los préstamos gestionados a través de Exlibris son estrictamente gratuitos.
              Queda prohibida la venta, el alquiler con ánimo de lucro o el uso comercial de
              la plataforma y de los ejemplares publicados en ella.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bold text-stone-900 text-sm">3. Responsabilidad sobre los ejemplares</h2>
            <p>
              Cada usuario conserva la propiedad de sus libros y decide libremente con qué clubes
              o zonas compartirlos, así como a quién aceptar una solicitud de préstamo. Las personas
              participantes se comprometen a cuidar los ejemplares prestados y devolverlos en el
              estado acordado.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bold text-stone-900 text-sm">4. Buen uso y convivencia</h2>
            <p>
              Los usuarios se comprometen a utilizar el chat de intercambio y las valoraciones de
              lectura de forma respetuosa, veraz y acorde con la finalidad cultural de la comunidad.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bold text-stone-900 text-sm">5. Privacidad y protección de datos</h2>
            <p>
              El tratamiento de los datos personales se rige por lo establecido en nuestra{' '}
              <Link href="/privacidad" className="text-emerald-700 font-semibold underline">
                Política de Privacidad
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}