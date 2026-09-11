# Job AutoApply — fase 0 y 1

Esqueleto inicial de la app: proyecto Next.js con Supabase para datos/autenticación
y la API de Claude para generar CV y carta de presentación adaptados a una oferta.
Corresponde a las fases 0 y 1 del plan (ver `plan-app-autoapply.md`).

## Qué incluye

- Estructura de Next.js 14 (App Router) con TypeScript y Tailwind.
- `supabase/schema.sql`: tablas `subscriptions`, `resumes`, `job_postings`,
  `applications` y `ai_generations`, con Row Level Security activado.
- `app/api/generate/route.ts`: endpoint que recibe un CV base y una oferta
  (pegada a mano o ya guardada en `job_postings`) y devuelve un CV adaptado
  y una carta de presentación usando Claude, sin inventar experiencia que no
  esté en el CV original.
- `app/dashboard/page.tsx`: panel mínimo para probar la generación.

## Qué falta a propósito (fases siguientes del plan)

- Pantallas de registro/login (Supabase Auth ya queda listo para conectarlas).
- Subida de CV desde la interfaz (por ahora se inserta directamente en la
  tabla `resumes` desde el SQL Editor de Supabase para probar).
- El agregador de vacantes (fase 2) y el worker de auto-apply (fases 3 y 4).

## Cómo arrancarlo

1. Crea un proyecto en [supabase.com](https://supabase.com) y, en el SQL Editor,
   ejecuta el contenido de `supabase/schema.sql`.
2. Copia `.env.example` a `.env.local` y completa las llaves de Supabase
   (Project Settings > API) y tu `ANTHROPIC_API_KEY` (console.anthropic.com).
3. Instala dependencias y arranca en desarrollo:

   ```bash
   npm install
   npm run dev
   ```

4. Abre `http://localhost:3000`. Para probar el generador, inserta una fila de
   prueba en `resumes` desde Supabase con tu `user_id` y el texto de tu CV, y
   usa ese `id` en el panel de `/dashboard`.

## Despliegue

El proyecto está listo para desplegarse en Vercel: conecta el repositorio,
agrega las mismas variables de entorno del `.env.local` en la configuración
del proyecto de Vercel, y despliega.
