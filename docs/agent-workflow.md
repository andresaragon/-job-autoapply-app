# Flujo multi-agente y política de modelos

Principio: **el humano es el orquestador**. Los agentes no se llaman entre sí; el contexto
pasa por archivos (`SPEC.md`, `tasks/plan.md`) y commits, no por resúmenes.

## 1. Flujo

| Fase | Agente | Skills a cargar (solo estas) | Entrada | Salida |
|---|---|---|---|---|
| Spec | Claude Code | `interview-me`, `spec-driven-development` | idea | `SPEC.md` |
| Plan | Claude Code | `planning-and-task-breakdown` | `SPEC.md` | `tasks/plan.md` |
| Build | Codex (worktree) o Claude Code | `incremental-implementation`, `test-driven-development`, `git-workflow-and-versioning` | 1 tarea del plan | commits atómicos |
| Test | El mismo que construye | `test-driven-development`, `debugging-and-error-recovery` si algo falla | tarea | `npm test` en verde + salida pegada |
| Review | **Otro modelo** (Gemini/Antigravity; o Claude si construyó Codex) | `code-review-and-quality`, `doubt-driven-development` | diff | hallazgos por severidad |
| Ship | Claude Code | `shipping-and-launch`, `security-and-hardening` (si aplica) | rama revisada | go/no-go + rollback |

> Los nombres de skills vienen del kit original y no se han verificado contra el marketplace
> instalado; confírmalos con `/plugin` antes de depender de ellos.

Puertas humanas (tú apruebas): después de Spec, después de Plan, antes de Ship.

## 2. Handoff entre agentes (plantilla)

Al terminar una sesión, el agente deja esto al final de la tarea en `tasks/plan.md`:

```
- [x] T3 — <título>
  - Estado: hecho | bloqueado | parcial
  - Commits: <hash corto>
  - Evidencia: <typecheck + lint + npm test + build, con resultado>
  - Riesgos / pendientes: <1–3 líneas>
```

El siguiente agente empieza leyendo `AGENTS.md`, `SPEC.md` y la tarea en `tasks/plan.md`. Nada más.

## 3. Política de modelos (por rol, no por marca)

Regla: el modelo más barato que haga bien la tarea.

| Rol | Nivel de modelo | Ejemplo en Claude Code |
|---|---|---|
| Búsqueda/lectura masiva de código | Económico | subagente `Explore` (Haiku) |
| Build de tareas ya especificadas | Medio | Sonnet |
| Review de código | Medio | Sonnet |
| Spec, Plan, decisiones de arquitectura | Fuerte | el modelo más capaz que tengas |
| Auditoría de seguridad, cambios irreversibles | Fuerte | el modelo más capaz que tengas |

En Codex y Gemini aplica la misma escalera con los modelos que tu plan permita.
Si el repo agent-skills define `model` por persona en el frontmatter, ajústalo ahí.

## 4. Política de carga de contexto (ahorro de tokens)

1. `AGENTS.md` corto (< ~60 líneas útiles). Lo que no sea de todas las sesiones, afuera.
2. Carga skills **por fase** (tabla de arriba). Nunca las 25.
3. Investigación pesada → subagente de investigación que devuelve un resumen.
4. Una tarea por sesión; sesión nueva al cambiar de tarea (el estado vive en archivos).
5. No pegues archivos completos al chat si el agente puede leerlos por ruta.
6. Revisión: pasa solo el diff y los criterios de aceptación, no el historial de la conversación.

## 5. Cuándo usar cada patrón

- Una perspectiva sobre un artefacto → invocación directa (lo más barato).
- Mismo trabajo repetido → slash command.
- Veredicto sobre un diff (pre-ship) → revisiones en paralelo y mezcla en el contexto principal.
- Bug raro con varias hipótesis → Agent Teams (experimental, más caro). Solo si hace falta.
- Ciclo completo → tú ejecutas las fases en orden. No automatices con un agente "coordinador".

## 6. Medir el gasto

Ninguna herramienta lo registra por fase por sí sola. Anota en cada tarea de `tasks/plan.md`
el consumo que reporte tu herramienta (si lo muestra) y revisa cada semana qué fase gasta más.

## 7. Pendiente humano: gate del orquestador

`pipeline/orchestrator.sh` (tier `blocked`) solo ejecuta `npm run build` cuando existe, y nunca
`npm test`, `lint` ni `typecheck`: un cambio que rompa los tests puede auto-fusionarse en el tier
`auto`. La propuesta de cambio, para que la apliques tú a mano, está en
[`docs/proposals/orchestrator-gate.md`](proposals/orchestrator-gate.md).
