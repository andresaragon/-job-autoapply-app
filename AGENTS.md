# AGENTS.md — job-autoapply-app

Contrato común para Claude Code, Codex, Gemini y Antigravity. Mantenlo corto: se carga en cada sesión.

## Proyecto
Plataforma Next.js + Supabase para auto-postulación a empleos: agregador de vacantes (Remotive, Arbeitnow),
generación de CV y carta con IA híbrida (Ollama local, Claude, Gemini), autollenado asistido de formularios ATS
(Greenhouse, Lever, Ashby; la persona revisa y envía), extensión de Chrome (MV3) y puente de webhooks con n8n/Telegram.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS 3 · Supabase (Auth + Postgres con RLS) ·
Anthropic SDK · Google GenAI · Vitest · Playwright (worker) · n8n (VPS).

## Comandos (usa solo estos)
- Desarrollo: `npm run dev`
- Build: `npm run build`
- Tipos: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm test` (Vitest, sin red ni keys reales; `npm run test:watch` para desarrollo)

## Estructura
- `app/` rutas y API (`app/api/**`), `components/`, `lib/` (`ats/`, `jobs/`, `supabase/`, `worker/`, más `anthropic.ts`, `gemini.ts`, `ollama.ts`)
- `tests/` (Vitest; `tests/helpers/` con el Supabase falso)
- `supabase/schema.sql` y `supabase/migrations/`
- `extension/` extensión Chrome · `worker/` Playwright · `n8n/` workflow exportable
- `pipeline/` AI Dev Factory (orquestador + política + auditoría). Ver `pipeline/README.md`
- `SPEC.md`, `tasks/plan.md`, `CONSTRAINTS.md`, `docs/agent-workflow.md`, `docs/DEPLOY.md`

## Límites — NO tocar sin confirmación humana
- `pipeline/policy/**` y `pipeline/orchestrator.sh` (tier blocked: solo los cambia el humano)
- `.env*` (excepto `.env.example`) y cualquier secreto
- `supabase/migrations/**`, `supabase/schema.sql` (tier approval)
- Autenticación: `middleware.ts`, rutas `**/auth/**` (tier approval)
- Pagos/créditos: la reserva atómica de créditos en `app/api/generate/route.ts` y las funciones SQL `reserve_credit` / `refund_credit`
- `next.config.*`, `.github/workflows/**` y configuración de despliegue

## Reglas de trabajo
1. Spec antes de código. Sin `SPEC.md` aprobado para la tarea, pídelo o escríbelo.
2. Una tarea del plan por vez; commits atómicos de ~100 líneas.
3. Lógica nueva o bug = test primero. Código existente sin tests: test de caracterización antes de cambiar.
4. Evidencia: al cerrar una tarea, pega la salida de `typecheck`, `lint`, `npm test` y `build`.
5. Quien construye no revisa: la revisión la hace otro agente/modelo.
6. El estado vive en archivos (`tasks/plan.md`) y commits, no en el chat.
7. Nunca silenciar un check, saltar un test o bajar un umbral para dar "verde".
8. Carga skills por fase (ver `docs/agent-workflow.md`), nunca todas a la vez.

## Cierre de tarea
- [ ] Criterios de aceptación cumplidos
- [ ] `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` sin errores (salida pegada)
- [ ] `CONSTRAINTS.md` respetado
- [ ] `tasks/plan.md` actualizado
- [ ] Commit atómico

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
