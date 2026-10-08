# Propuesta: ampliar el gate de `pipeline/orchestrator.sh`

**Estado:** propuesta. `pipeline/orchestrator.sh` está en el tier `blocked`: ningún agente lo edita;
lo aplicas tú a mano (o lo apruebas fuera del pipeline).

## Problema
La sección "7. build / test gate" hace:

```bash
if [[ "$HAS_BUILD" == "True" ]]; then
  npm run build ...
elif [[ "$HAS_TEST" == "True" ]]; then
  npm test ...
```

Como el proyecto tiene `build`, **nunca se ejecutan `npm test`, `lint` ni `typecheck`**. Un cambio
que rompa los tests (p. ej. la reserva de créditos) puede pasar el gate y auto-fusionarse en el tier `auto`.

## Cambio sugerido
Sustituir ese bloque por una secuencia que ejecute todas las comprobaciones disponibles y falle en la primera
que no pase (el log de cada paso va al mismo `build.log`):

```bash
if [[ -f package.json ]]; then
  has_script() { python3 -c "import json,sys; d=json.load(open('package.json')); print(sys.argv[1] in d.get('scripts',{}))" "$1"; }
  set +e
  BUILD_EXIT=0
  : > "$RUN_LOG_DIR/build.log"
  for step in lint typecheck test build; do
    if [[ "$(has_script "$step")" == "True" ]]; then
      echo "=== npm run $step ===" >> "$RUN_LOG_DIR/build.log"
      npm run "$step" >> "$RUN_LOG_DIR/build.log" 2>&1
      BUILD_EXIT=$?
      BUILD_STATUS="$step"
      [[ $BUILD_EXIT -ne 0 ]] && break
    fi
  done
  [[ "$BUILD_STATUS" == "skipped" ]] && BUILD_EXIT=0
  set -e
else
  BUILD_EXIT=0
fi
```

El resto (`hold_and_exit` si `BUILD_EXIT != 0`, aviso si `BUILD_STATUS == "skipped"`) queda igual.
`BUILD_STATUS` pasa a indicar el último paso ejecutado (o el que falló).

## Verificación sugerida tras aplicarlo
1. Rompe un test a propósito en una rama de prueba y comprueba que el pipeline retiene el cambio (`hold_and_exit`).
2. Con todo en verde, comprueba que el merge `auto` sigue funcionando.
3. Sin tocar la política: `pipeline/policy/approval-policy.yaml` no cambia.

## Rollback
Restaurar el bloque original con `git revert` del commit que lo cambie.
