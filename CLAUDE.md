@AGENTS.md

## Particularidades de Claude Code
- Rol por defecto: Spec, Plan y Ship. También Build de tareas pequeñas.
- Para leer mucho código usa el subagente `Explore` (devuelve solo un resumen).
- Revisiones en paralelo: varias llamadas a subagentes en un mismo turno.
- Los subagentes no crean otros subagentes; el orquestador es el humano.
- Flujo: `/spec` → `/plan` → pipeline (`pipeline/orchestrator.sh`) para el Build de cada tarea → `/review` con otro modelo → `/ship`.
- Detalle de roles y política de modelos: `docs/agent-workflow.md`.
