# CONSTRAINTS.md — job-autoapply-app

Decídelo una vez, aplícalo siempre. Relajar algo de aquí es decisión humana, no del agente.
La política de rutas por tiers vive en `pipeline/policy/approval-policy.yaml`; no la repitas aquí.

## Cambios
- ~100 líneas por commit; sobre ~300 se divide. Un commit atómico por tarea.
- Excepción: archivos de pruebas generados o migraciones pueden superar el límite si el commit lo justifica.

## Verificación (puerta mínima de todo cambio)
- `npm run typecheck` sin errores
- `npm run lint` sin errores
- `npm test` sin errores (Vitest; sin red ni keys reales)
- `npm run build` sin errores
- La CI (`.github/workflows/ci.yml`) ejecuta lint, typecheck y tests en cada push y PR; debe estar en verde antes de fusionar.

## Tests
- Lógica nueva o bug corregido lleva test, escrito primero. Los tests viven en `tests/` y simulan Supabase, `fetch` y los proveedores de IA (ver `tests/helpers/`).
- Código existente sin tests: test de caracterización antes de cambiar.
- Prohibido: borrar o deshabilitar tests, `skip`, bajar umbrales para pasar.

## Seguridad
- Sin secretos en el repo; solo variables de entorno. Solo `.env.example` se versiona.
- Toda entrada externa se valida en el borde (API routes y webhooks).
- El webhook de n8n exige `x-webhook-secret`; sin secreto configurado en producción responde 401 siempre. No relajar.
- Redirecciones (`next`, `redirect`) solo a rutas internas.
- No usar `SUPABASE_SERVICE_ROLE_KEY` con valor de reserva: si falta, el código debe fallar con error claro.
  - **Deuda conocida:** `lib/supabase/server.ts` y `lib/supabase/client.ts` aún usan valores `placeholder-*` para no romper el prerender. Pendiente: fallar en runtime y solo en producción, sin romper `next build` ni los tests. Va en su propio PR.
- RLS activo en todas las tablas; toda migración nueva mantiene RLS.
- Dependencias nuevas: justificar en el commit.

## Base de datos
- Cambios de esquema solo con migración versionada en `supabase/migrations/` y plan de rollback. Los cambios de migración se reflejan también en `supabase/schema.sql`.
- Nunca DDL/DML destructivo sin confirmación humana explícita.

## Créditos y generación con IA
- La reserva de créditos es atómica (RPC `reserve_credit`) con reembolso relativo (`refund_credit`) en cualquier fallo. Nunca leer el saldo para luego escribirlo.
- Cualquier cambio en `app/api/generate/route.ts` o en esas funciones SQL pasa por revisión humana.

## Revisión
- Todo cambio lo revisa un agente/modelo distinto al que lo escribió.
- Bloquean el merge: Critical y Required. Nit, Optional y FYI no bloquean.

## Ship
- Plan de rollback escrito antes de desplegar y verificación posterior (ver `docs/DEPLOY.md`, sección 5).
