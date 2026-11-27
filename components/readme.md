# Exlibris

**Exlibris** es una Progressive Web App (PWA) full-stack para catalogar bibliotecas personales y gestionar el préstamo gratuito de libros físicos tanto entre miembros de clubes privados de lectura como entre vecinos mediante búsqueda anónima por código postal.

---

## 1. Stack Tecnológico y Arquitectura

La aplicación sigue una arquitectura *serverless* dividida en tres capas:

| Capa | Tecnología | Responsabilidad |
| :--- | :--- | :--- |
| **Frontend & API** | Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind CSS, Lucide Icons — alojado en **Vercel** | Interfaz móvil-first instalable (PWA), escáner de códigos de barras ISBN, gestión de estado, suscripción Push en cliente y endpoint seguro `/api/notificar`. |
| **Backend, Auth & Datos** | **Supabase** (PostgreSQL, Auth Google OAuth, Storage, Realtime) | Autenticación con Google, base de datos relacional protegida por Row Level Security (RLS), almacenamiento de imágenes comprimidas y canales WebSocket en tiempo real. |
| **Notificaciones Push** | Web Push API + estándar **VAPID** (`web-push`) + Service Worker | Entrega de notificaciones nativas en Android, iOS (PWA añadida a pantalla de inicio) y escritorio aunque la aplicación esté cerrada. |

---

## 2. Estructura del Proyecto

```text
exlibris-app/
├── app/
│   ├── api/
│   │   └── notificar/
│   │       └── route.ts          # Endpoint server-side que envía Web Push usando Service Role + VAPID
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts          # Intercambio de código OAuth de Google por sesión Supabase
│   ├── privacidad/
│   │   └── page.tsx              # Página pública con Términos de Uso y Política de Privacidad (RGPD)
│   ├── layout.tsx                # Layout raíz, metadatos PWA y configuración global
│   └── page.tsx                  # Contenedor principal (Estantería, Clubes, Barrio, Préstamos y badges Realtime)
├── components/
│   ├── ClubesTab.tsx             # Creación/unión a clubes privados, catálogo compartido y solicitudes
│   ├── ExplorarLocalTab.tsx      # Búsqueda vecinal anónima por código postal
│   ├── IsbnScanner.tsx           # Escáner de cámara + alta manual ISBN con enriquecimiento Google Books/Open Library
│   ├── LibroModal.tsx            # Ficha de libro, estado, visibilidad, foto real de portada y reseñas
│   ├── PerfilModal.tsx           # Edición de alias público, código postal y enlace legal
│   └── PrestamosTab.tsx          # Ciclo de préstamos, acta fotográfica entrega/devolución y chat en tiempo real
├── public/
│   ├── manifest.json             # Manifiesto PWA (nombre, iconos, modo standalone)
│   └── sw.js                     # Service Worker para recepción en segundo plano y apertura de notificaciones Push
├── utils/
│   ├── supabase/
│   │   ├── client.ts             # Cliente Supabase para componentes cliente
│   │   └── server.ts             # Cliente Supabase para rutas de servidor
│   ├── comprimirImagen.ts        # Redimensionado y compresión JPEG en navegador antes de subir a Storage
│   ├── generos.ts                # Diccionario y normalizador de categorías literarias
│   └── notificaciones.ts         # Permisos Push, registro de suscripción y helper cliente
└── README.md