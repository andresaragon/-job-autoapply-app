# Job AutoApply — fase 0 y 1

Esqueleto inicial de la app: proyecto Next.js con Supabase para datos/autenticación
y arquitectura de **IA Híbrida** (Ollama Local en GPU RTX 4060, Claude Sonnet 5.5 y Google Gemini) para generar CV y carta de presentación adaptados a una oferta laboral.

## Qué incluye

- Estructura de **Next.js 16** (App Router, Turbopack) con TypeScript y Tailwind CSS.
- **Arquitectura de IA Tri-Híbrida:**
  - **Local On-Device ($0 / Offline):** Ollama con `qwen2.5:7b` corriendo en tu GPU local (RTX 4060).
  - **Nube Primaria:** Claude (`claude-sonnet-5-5`) para máxima calidad editorial.
  - **Nube Respaldo (Fallback):** Google Gemini (`gemini-2.5-flash`) con cuota gratuita.
  - Selección configurable desde la interfaz o automático con tolerancia a fallos.
- `supabase/schema.sql` y `supabase/migrations/20260929_audit_remediation.sql`: tablas `subscriptions`, `resumes`, `job_postings`, `applications` y `ai_generations`, con Row Level Security (RLS) activado, restricciones de saldo no negativo, soporte de auditoría multi-proveedor e índices de rendimiento.
- `app/api/generate/route.ts`: endpoint resiliente con reserva atómica de créditos (`gt("creditos_disponibles", 0)`) y reembolso automático en fallo para evitar costes indebidos (*anti-TOCTOU*).
- `app/dashboard/page.tsx`: panel funcional con selector de motor de IA (Local vs Nube), feedback de carga, manejo de errores y badge dinámico del proveedor utilizado.

## Qué falta a propósito (fases siguientes del plan)

- Pantallas de registro/login (Supabase Auth ya queda listo para conectarlas).
- Subida de CV desde la interfaz (por ahora se inserta directamente en la tabla `resumes` desde el SQL Editor de Supabase para probar).
- El agregador de vacantes (fase 2) y el worker de auto-apply (fases 3 y 4).

## Cómo arrancarlo

1. Crea un proyecto en [supabase.com](https://supabase.com) y, en el SQL Editor, ejecuta el contenido de `supabase/schema.sql` (o la migración delta en `supabase/migrations/20260929_audit_remediation.sql` si ya tenías tablas creadas).
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
