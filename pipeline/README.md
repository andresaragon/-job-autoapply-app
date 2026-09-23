# AI Dev Factory — pipeline de construcción + auditoría

Piloto del sistema descrito en la conversación: un agente construye
(Claude Code), un modelo chico y local (Kev) hace un triage rápido y
barato, otro agente audita el diff a fondo (Gemini/Antigravity) antes
de mergear, y un clasificador determinístico por rutas decide qué
puede pasar solo y qué necesita tu aprobación. Basado en el patrón de
[tuweb.dev](https://github.com/midudev/tuweb.dev) pero adaptado a tu
stack (Claude Code + Gemini + Kev + n8n + VPS en Oracle Cloud).

## Cómo correrlo

Requisitos en tu WSL: `claude` (Claude Code CLI) y `gemini` (Gemini CLI)
instalados y autenticados, `python3` con `pyyaml` (`pip install pyyaml
--break-system-packages`), y el repo en un estado limpio sobre `main`.
Opcionalmente, un servidor Kev corriendo (`pipeline/config/kev.yaml`)
para la capa de triage rápido — si no está prendido, el pipeline
funciona igual, solo sin esa capa extra.

```bash
./pipeline/orchestrator.sh "Agregar endpoint GET /api/health que devuelva status y timestamp"
```

Opcional:
```bash
./pipeline/orchestrator.sh "Corregir bug X" --change-type bugfix
./pipeline/orchestrator.sh "..." --dry-run   # valida el setup sin llamar a nadie
```

## Qué hace, paso a paso

1. Crea una rama `ai/<slug>-<timestamp>`.
2. Llama a `claude -p` con el prompt de `prompts/coder_system_prompt.md` +
   tu tarea. El coder solo tiene herramientas de archivo (Edit/Write/Read/
   Glob/Grep) — no tiene Bash, así que físicamente no puede hacer commit,
   push, ni tocar nada fuera del working tree.
3. Calcula el diff (`git diff`, incluyendo archivos nuevos vía
   `git add -A -N`) y lo clasifica con `lib/classify_diff.py` contra
   `policy/approval-policy.yaml` → tier `auto` / `approval` / `blocked`.
4. Si el tier ya es `blocked` (toca secretos o el propio pipeline), se
   descarta el cambio ahí mismo — nadie más se llama.
5. **Triage rápido con Kev ("System 1", opcional).** Si `pipeline/config/kev.yaml`
   tiene `enabled: true` y hay un servidor Kev corriendo
   ([github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev) — modelo
   de decisión chico, 0.5B-9B, corre local, contrato `/v1/systemone`), se le
   pasan la tarea y el diff con 3 preguntas tipadas: ¿está en alcance?,
   ¿toca algo sensible?, y su propio tier sugerido. Es puramente aditivo:
   - Si Kev no responde, se ignora y el pipeline sigue exactamente igual
     que si no existiera (nunca es un requisito para poder mergear).
   - Kev solo puede EMPUJAR el tier hacia arriba, nunca bajarlo, y nunca
     puede producir `blocked` por sí solo (techo en `approval` — esa
     decisión sigue reservada a las reglas de rutas y al auditor LLM).
   - Con `skip_deep_audit_when_confident: true` (apagado por defecto),
     si Kev está muy seguro de que un cambio tier `auto` no se salió de
     alcance ni toca nada sensible, se salta la llamada a Gemini/Antigravity
     y se mergea solo con la lectura de Kev + el build gate — un atajo de
     costo/latencia que vale la pena activar solo una vez confíes en la
     calibración de Kev para tus proyectos (por ahora es out-of-domain en
     español, sin benchmark oficial).
6. Si no se saltó (o no aplicaba el atajo), se arma el prompt de auditoría
   (`prompts/audit_prompt.md`) con la tarea, el diff completo y el tier
   calculado hasta ahora (clasificador + Kev), y se le pasa a `gemini`
   (o `antigravity` si está en el PATH). El auditor puede subir el tier
   si ve algo sensible que las capas anteriores no detectaron, pero nunca
   bajarlo.
7. Según el veredicto del auditor (`APPROVE` / `NEEDS_CHANGES` / `BLOCK`)
   y el tier final:
   - **BLOCK o tier `blocked`** → rollback total, rama descartada. El
     diff rechazado queda guardado en `pipeline/logs/<run>/diff.patch`
     por si quieres revisarlo o aplicarlo a mano.
   - **NEEDS_CHANGES** → se commitea en la rama (no se pierde el trabajo)
     y se detiene ahí. Rama viva para que sigas tú o le des otra vuelta.
   - **APPROVE + tier `approval`** (DB, auth, pagos, producción) → se
     commitea en la rama pero NO se mergea. Queda esperando tu aprobación
     explícita.
   - **APPROVE + tier `auto`** → corre el build/test gate (`npm run
     build` o `npm test` si existen en `package.json`). Si pasa, se
     commitea y se mergea a `main` con `--no-ff`, y se borra la rama.
     Si el build falla, se detiene igual que `NEEDS_CHANGES`.
8. Todo queda logueado en `pipeline/logs/<run-id>/`: prompt del coder,
   salida del coder, diff, resultado del clasificador, lectura de Kev
   (`kev.json`), prompt de auditoría, respuesta cruda y parseada del
   auditor, log del build.

## La regla de oro

Ningún agente puede subirse su propio nivel de permisos: cambios a
`pipeline/policy/**` o a `pipeline/orchestrator.sh` están en tier
`blocked` por definición en `approval-policy.yaml`. Si algún día un
agente "mejora" el pipeline, ese cambio específico siempre te espera a
ti fuera del pipeline.

## Reusar esto en otros proyectos

Este `pipeline/` es portable: para MRGames, Auditor de Silicio, o
cualquier otro repo, copia la carpeta completa y ajusta
`policy/approval-policy.yaml` a las rutas de ese proyecto (por ejemplo,
en MRGames el checkout/carrito entraría en el tier `approval` igual que
pagos aquí). El script no asume nada específico de job-autoapply-app
más allá de "hay un `package.json` con `build`/`test`".

## Qué encontró el piloto (sesión del 2026-09-23)

Corrí este pipeline contra este mismo repo antes de entregarlo, con
Claude Code real como coder y un stub de `gemini` (respuesta fija
`APPROVE`) para poder probar el camino de auto-merge sin tener el CLI
de Gemini instalado en este contenedor. Encontró 3 bugs reales en la
primera versión de `classify_diff.py`/`approval-policy.yaml`, ya
corregidos en el historial de commits — vale la pena leerlos si vas a
tocar la política:

1. El tier se calculaba por diff completo, no por archivo: si un solo
   archivo matcheaba `auto` (ej. un test), un archivo sin categorizar
   en el mismo commit se colaba con ese mismo tier.
2. La regla de "Cambios de UI" solo reconocía `.tsx`, pero el proyecto
   usa `.js`/`.jsx` puro — nunca se iba a activar.
3. El matcher de globs (`fnmatch`) no soporta `**` recursivo de verdad:
   patrones como `app/**/page.js` o `**/auth/**` nunca matcheaban el
   caso más común (el archivo en la raíz de esa carpeta: `app/page.js`,
   `.env`). Se reemplazó por un traductor glob→regex propio.

La tarea real que sí corrió con Claude Code (sin stub) fue "agregar
`GET /api/health`" — quedó en tier `approval` (correcto: una ruta de
API nueva no cae en ninguna regla `auto` explícita) y, al no haber
`gemini` instalado en este contenedor, el pipeline se detuvo en
`HOLD` sin mergear nada — el comportamiento seguro esperado. Esa rama
sigue viva en el repo (`ai/agregar-endpoint-...`) para que la
retomes desde tu WSL una vez tengas `gemini` CLI corriendo ahí.

**Kev** se probó por separado (con un servidor Kev simulado — no había
forma de bajar los pesos reales en este contenedor) contra 3 escenarios
reales del orquestador: (1) cambio en alcance y no sensible → confirma
`auto`, se mergea; (2) mismo cambio pero con `looks_sensitive` alto →
escala a `approval` y el pipeline se detiene, AUNQUE el auditor stub
haya dicho `APPROVE` — la escalada de Kev gana; (3) con
`skip_deep_audit_when_confident: true` y Gemini deliberadamente fuera
del PATH → el pipeline igual mergeó usando solo la lectura de Kev + el
build gate, confirmando que el atajo de costo funciona cuando lo
activas.

## De WSL local a la VPS (Torre de Control)

Por ahora esto corre manual en tu WSL. Cuando migres a la VPS de Oracle
con n8n, el mismo `orchestrator.sh` se puede colgar de un nodo "Execute
Command" de n8n: el disparador (webhook, Telegram, cron) le pasa la
tarea como argumento, y las salidas de `pipeline/logs/<run>/` son lo que
el bot de Telegram te resume para pedirte el OK en los tiers `approval`.
No hay que reescribir nada del pipeline para ese salto — solo quién lo
invoca.
