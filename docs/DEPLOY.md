# Guía de despliegue: Vercel + Supabase

Esta guía lleva el proyecto de un repositorio limpio a producción. **No pegues ninguna key en el
repositorio ni en issues**: todas las claves se configuran solo en los paneles de Supabase y Vercel
(o en `.env.local`, que está en `.gitignore`).

## 0. Requisitos

- Cuenta en [Supabase](https://supabase.com) y en [Vercel](https://vercel.com).
- El repositorio en GitHub (Vercel lo importa desde ahí).
- Al menos **un** proveedor de IA en la nube: una API key de Anthropic o de Google Gemini.
- Node 22 si vas a probar el build en local (`npm ci && npm run build`).

## 1. Base de datos en Supabase

1. Crea un proyecto nuevo (elige región cercana a tus usuarios y guarda la contraseña de la base en tu gestor de secretos).
2. Abre **SQL Editor** y aplica el esquema. Hay dos caminos, elige **uno**:

   **A. Proyecto nuevo (recomendado)** — ejecuta una sola vez `supabase/schema.sql`. Ya incluye
   tablas, RLS, el trigger que crea suscripción/perfil al registrarse y las funciones de créditos.
   No es re-ejecutable (las políticas RLS se crean sin `if not exists`).

   **B. Base que ya tenía una fase anterior** — aplica las migraciones delta **en este orden**
   (el orden lo da el nombre del archivo):

   | # | Archivo | Qué hace |
   |---|---------|----------|
   | 1 | `supabase/migrations/20260929_audit_remediation.sql` | Créditos no negativos, columna `proveedor`, índices y políticas de `resumes` |
   | 2 | `supabase/migrations/20260929_job_aggregator.sql` | Índices del agregador y política de borrado de postulaciones |
   | 3 | `supabase/migrations/20260929_user_profiles.sql` | Tabla `profiles`, RLS y trigger `handle_new_user` |
   | 4 | `supabase/migrations/20261002_credit_functions.sql` | RPC atómicas `reserve_credit` / `refund_credit` (**obligatoria**: `/api/generate` falla sin ellas) |

3. Verifica en **Table Editor** que existen `subscriptions`, `profiles`, `resumes`, `job_postings`,
   `applications`, `ai_generations`, todas con RLS activado, y en **Database → Functions** que existen
   `reserve_credit` y `refund_credit`.

> Las RPC de créditos solo son ejecutables por `service_role`. Si algún día un usuario autenticado
> pudiera llamarlas desde el navegador, podría regalarse saldo: no cambies sus `grant`.

## 2. Autenticación en Supabase

En **Authentication → URL Configuration**:

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://TU-DOMINIO` (el dominio de producción de Vercel o tu dominio propio) |
| **Redirect URLs** | `https://TU-DOMINIO/auth/callback` |
| | `https://*-TU-EQUIPO.vercel.app/auth/callback` (opcional: previews de Vercel) |
| | `http://localhost:3000/auth/callback` (desarrollo local) |

La app registra usuarios con `emailRedirectTo = <origin>/auth/callback`, y esa ruta
(`app/auth/callback/route.ts`) intercambia el `code` por la sesión y redirige a `/dashboard`.
Si la URL no está en la lista de *Redirect URLs*, el correo de confirmación llevará al Site URL
y el usuario no quedará con sesión iniciada.

En **Authentication → Providers → Email** decide si exiges confirmación de correo (recomendado en producción).

## 3. Variables de entorno

Los nombres salen de `.env.example`. En Vercel: **Project → Settings → Environment Variables**
(marca *Production* y, si quieres previews, *Preview*).

| Variable | Obligatoria | Dónde se obtiene / para qué |
|----------|:-----------:|------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Supabase → Project Settings → API → *Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Supabase → Project Settings → API → clave *anon / publishable* (pública, protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Supabase → Project Settings → API → *service_role*. **Secreta**: salta RLS; solo servidor, nunca `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | Una de las dos | console.anthropic.com → API Keys |
| `GEMINI_API_KEY` | Una de las dos | aistudio.google.com → API Keys |
| `ANTHROPIC_MODEL` | No | Por defecto `claude-sonnet-5-5` |
| `GEMINI_MODEL` | No | Por defecto `gemini-2.5-flash` |
| `DEFAULT_AI_PROVIDER` | Recomendada | En Vercel usa `anthropic` o `gemini` (ver nota) |
| `N8N_WEBHOOK_SECRET` | Si usas n8n | Cadena larga aleatoria (`openssl rand -hex 32`). Sin ella, `/api/webhooks/n8n` responde 401 en producción |
| `WORKER_SECRET` | Si usas el worker | Secreto para `/api/worker/autofill` desde Playwright/n8n; si no se define se reutiliza `N8N_WEBHOOK_SECRET` |
| `NEXT_PUBLIC_APP_URL` | Recomendada | URL pública (`https://TU-DOMINIO`); la usan los deep links del digest de Telegram |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | No | Solo desarrollo local con GPU |

**Notas importantes**

- **Ollama no funciona en Vercel**: apunta a `127.0.0.1`, que en una función serverless no es tu GPU.
  Fija `DEFAULT_AI_PROVIDER=anthropic` (o `gemini`) en producción para no perder tiempo probando Ollama.
- Las variables `NEXT_PUBLIC_*` se incrustan en el build: si las cambias, **redespliega**.
- En producción, sin sesión, `/api/generate`, `/api/jobs` (POST) y `/api/jobs/sync` responden 401, y los
  endpoints de worker/webhook exigen su secreto. El "modo desarrollo" sin autenticación solo existe
  cuando `NODE_ENV !== "production"` (Vercel lo fija a `production` automáticamente).
- Genera los secretos con un gestor/`openssl`; no reutilices los de desarrollo.

## 4. Despliegue en Vercel

1. **Add New → Project** e importa el repositorio. Framework: *Next.js* (se detecta solo).
2. Build command `npm run build`, install `npm ci` (valores por defecto válidos).
3. Carga las variables de la sección anterior y pulsa **Deploy**.
4. Cuando termine, copia el dominio asignado y vuelve a la sección 2 para fijar *Site URL* y *Redirect URLs*.
5. Redespliega si cambiaste `NEXT_PUBLIC_APP_URL`.

La integración continua (`.github/workflows/ci.yml`) ejecuta `npm ci`, lint, typecheck y tests en
cada push y PR; en Vercel puedes activar *Ignored Build Step* o proteger la rama `main` exigiendo
ese check antes de fusionar.

## 5. Verificación posterior al despliegue

- [ ] `https://TU-DOMINIO/login` carga y `/dashboard` sin sesión redirige a `/login`.
- [ ] Registro nuevo: llega el correo, el enlace vuelve a `/auth/callback` y entra al dashboard.
- [ ] En Supabase, el usuario nuevo tiene filas en `subscriptions` (5 créditos) y `profiles`.
- [ ] `/dashboard/jobs` → **Sincronizar** trae vacantes de Remotive/Arbeitnow.
- [ ] Sube un CV, genera una postulación y comprueba que el saldo baja **1** crédito; fuerza un fallo
      (p. ej. quita temporalmente las keys) y comprueba que el crédito se reembolsa.
- [ ] `curl -i https://TU-DOMINIO/api/webhooks/n8n` (sin header) devuelve `401`.
- [ ] `git grep -n "service_role"` no muestra claves reales y la `service_role` no está en variables `NEXT_PUBLIC_`.

## 6. n8n, worker y extensión (opcional)

- **n8n**: importa `n8n/job_autoapply_pipeline.json` y define `JOB_AUTOAPPLY_URL` (tu dominio) y
  `JOB_AUTOAPPLY_SECRET` (el mismo valor de `N8N_WEBHOOK_SECRET`). Ver [`n8n/README.md`](../n8n/README.md).
- **Worker Playwright**: usa `WORKER_SECRET` y `APP_URL` (tu dominio) como variables de entorno del proceso.
- **Extensión de Chrome**: indica tu dominio de producción al sincronizar el perfil. Ver [`extension/README.md`](../extension/README.md).

## 7. Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `/api/generate` responde 500 "No se pudo reservar el crédito" | Falta aplicar `20261002_credit_functions.sql` |
| El correo de confirmación abre `localhost` o no inicia sesión | *Site URL* / *Redirect URLs* mal configuradas |
| `/api/generate` responde 502 con `details` | Ningún proveedor respondió: revisa keys y `DEFAULT_AI_PROVIDER`; el crédito ya se reembolsó |
| Las vacantes no se sincronizan | Falta `SUPABASE_SERVICE_ROLE_KEY` (el upsert en `job_postings` requiere permisos de servidor) |
| Webhook n8n responde 401 | `N8N_WEBHOOK_SECRET` no definida o distinta a la que envía n8n |
