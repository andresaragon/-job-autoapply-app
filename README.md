# Job AutoApply — Fases 0, 1, 2 y 3

Plataforma integral Next.js con Supabase para datos/autenticación, agregador de vacantes públicas (Remotive & Arbeitnow),
arquitectura de **IA Híbrida** (Ollama Local en GPU RTX 4060, Claude Sonnet 5.5 y Google Gemini), módulo de auto-llenado ATS (Greenhouse, Lever, Ashby)
y puente de webhooks para automatizaciones con n8n y Telegram.

## Qué incluye

- Estructura de **Next.js 16** (App Router, Turbopack) con TypeScript y Tailwind CSS.
- **Autenticación y Sesiones:** Flujo completo de registro, inicio de sesión y callback con Supabase Auth y Middleware de protección de rutas privadas (`/dashboard`, `/dashboard/jobs`, `/dashboard/applications`, `/dashboard/resumes`, `/dashboard/profile`).
- **Perfil de Candidato (`/dashboard/profile`):** Datos persistentes del candidato (nombre, teléfono, LinkedIn, GitHub, portafolio, ubicación) para rellenado automático de formularios.
- **Gestión y Carga de CVs:** Interfaz en `/dashboard/resumes` para subir archivos (`.txt`, `.md`), previsualizar, editar y marcar un CV como principal (`es_actual`) con políticas RLS.
- **Agregador de Vacantes (`/dashboard/jobs`):**
  - Ingesta automática e idempotente desde feeds públicos abiertos (**Remotive** y **Arbeitnow**) sin API keys.
  - Detección automática de sistemas ATS (*Greenhouse, Lever, Ashby, Workday, SmartRecruiters*).
  - Búsqueda reactiva por palabras clave y filtros por modalidad (*100% Remoto* vs *Presencial/Híbrido*) o tipo de ATS.
  - Ingesta manual de vacantes para registrar ofertas directas de LinkedIn.
  - Botón de acción directa **"⚡ Postular con IA"** que precarga la oferta seleccionada en el generador.
- **Seguimiento de Postulaciones (`/dashboard/applications`):**
  - Registro y guardado de postulaciones adaptadas con CV y carta generados.
  - Gestión de ciclo de vida con estados (*Borrador*, *Lista para revisión*, *Enviada*, *En Proceso*, *Entrevista*, *Rechazada*, *¡Oferta!*).
  - Visor modal para inspeccionar y copiar los documentos generados.
- **Asistente Auto-Fill ATS (`lib/worker/ats/filler.ts` & `/api/worker/autofill`):**
  - Mapeo determinista de campos para Greenhouse, Lever, Ashby y formularios genéricos.
  - Generador de inyector JavaScript (one-click copy) que dispara eventos reactivos del DOM (`input`/`change`) y resalta campos completados en verde.
  - Script runner con Playwright (`worker/autoapply-playwright.mjs`) para ejecución automatizada headless/headed desde terminal o VPS.
- **Puente de Webhooks para n8n & Telegram (`app/api/webhooks/n8n/route.ts`):**
  - Endpoint protegido por token de webhook (`x-webhook-secret`).
  - Soporta acciones: `sync_jobs`, `get_pending`, `update_status` y `telegram_digest` (resumen formateado en Markdown para bots de Telegram).
- **Navbar reactiva:** Indicador de estado de sesión, correo del usuario, créditos disponibles en tiempo real y navegación fluida.
- **Arquitectura de IA Tri-Híbrida:**
  - **Local On-Device ($0 / Offline):** Ollama con `qwen2.5:7b` corriendo en tu GPU local (RTX 4060).
  - **Nube Primaria:** Claude (`claude-sonnet-5-5`) para máxima calidad editorial.
  - **Nube Respaldo (Fallback):** Google Gemini (`gemini-2.5-flash`) con cuota gratuita.
- `supabase/schema.sql` y migraciones en `supabase/migrations/`: tablas `subscriptions`, `profiles`, `resumes`, `job_postings`, `applications` y `ai_generations`, con Row Level Security (RLS) activado, restricciones de saldo no negativo, soporte de auditoría multi-proveedor e índices de rendimiento.
- `app/api/generate/route.ts`: endpoint resiliente con reserva atómica de créditos (`gt("creditos_disponibles", 0)`) y reembolso automático en fallo para evitar costes indebidos (*anti-TOCTOU*).
- `app/dashboard/page.tsx`: panel funcional con precarga de vacantes desde el catálogo, selector automático de CV principal, selector de motor de IA, feedback de carga y guardado directo a *Mis Postulaciones*.

## Cómo arrancarlo

1. Crea un proyecto en [supabase.com](https://supabase.com) y, en el SQL Editor, ejecuta el contenido de `supabase/schema.sql` (o las migraciones delta en `supabase/migrations/` si ya tenías tablas de fases anteriores: `20260929_audit_remediation.sql`, `20260929_job_aggregator.sql` y `20260929_user_profiles.sql`).
2. Si vas a usar **Ollama Local**: asegúrate de que Ollama esté corriendo y con el modelo descargado:
   ```bash
   ollama pull qwen2.5:7b
   ```
3. Copia `.env.example` a `.env.local` y completa las variables de Supabase. Puedes dejar las API keys vacías si solo usas Ollama Local.
4. Instala dependencias y arranca en desarrollo:

   ```bash
   npm install
   npm run dev
   ```

5. Abre `http://localhost:3000`. Para probar el generador en modo local:
   - Inserta una fila de prueba en `resumes` desde Supabase con un `user_id` válido y el texto de tu CV.
   - Pega ese `id` en el panel de `/dashboard` junto con una oferta laboral, selecciona tu motor de IA y haz clic en **Generar**.

## Despliegue

El proyecto está listo para desplegarse en Vercel: conecta el repositorio, agrega las variables de entorno de Supabase y de tu proveedor nube (Anthropic / Gemini) en la configuración del proyecto de Vercel, y despliega.
