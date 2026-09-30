#!/usr/bin/env bash
#
# AI Dev Factory — orquestador de una tarea completa:
#   humano da una tarea -> Claude Code implementa -> se audita el diff
#   con Gemini/Antigravity -> se corre build/tests -> se decide:
#   merge automático, espera de aprobación humana, o rollback.
#
# Uso:
#   pipeline/orchestrator.sh "Agregar endpoint GET /api/health" [opciones]
#
# Opciones:
#   --change-type <tipo>   ej: bugfix, feature (ayuda al clasificador)
#   --repo <path>          default: raíz del repo (auto-detectada)
#   --base <rama>          default: main
#   --dry-run              no llama a claude ni a gemini, solo valida el setup
#
# Ninguna tarea se mergea a la rama base sin pasar por: clasificador de
# riesgo -> auditor LLM -> build/tests. Un tier "blocked" (secretos, o
# cambios al propio pipeline) NUNCA se aplica, pase lo que pase con el
# auditor.

set -euo pipefail

# ---------- setup ----------

TASK="${1:?Uso: orchestrator.sh \"descripción de la tarea\" [--change-type tipo] [--base main]}"
shift || true

CHANGE_TYPE=""
BASE_BRANCH="main"
REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --change-type) CHANGE_TYPE="$2"; shift 2 ;;
    --repo) REPO_PATH="$2"; shift 2 ;;
    --base) BASE_BRANCH="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

PIPELINE_DIR="$REPO_PATH/pipeline"
LIB_DIR="$PIPELINE_DIR/lib"
POLICY_FILE="$PIPELINE_DIR/policy/approval-policy.yaml"
PROMPTS_DIR="$PIPELINE_DIR/prompts"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_LOG_DIR="$PIPELINE_DIR/logs/$RUN_ID"
mkdir -p "$RUN_LOG_DIR"

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$RUN_LOG_DIR/run.log" ; }

log "=== AI Dev Factory — nueva tarea ==="
log "Tarea: $TASK"
log "Repo: $REPO_PATH"
log "Base: $BASE_BRANCH"
log "Run:  $RUN_ID  (logs en pipeline/logs/$RUN_ID/)"

cd "$REPO_PATH"

# ---------- checks previos ----------

if ! command -v claude >/dev/null 2>&1 && ! command -v antigravity >/dev/null 2>&1 && ! command -v gemini >/dev/null 2>&1; then
  log "ERROR: no se encontró ningún CLI de construcción ('claude', 'antigravity' ni 'gemini') en el PATH."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  log "ERROR: el working tree no está limpio. Guarda o descarta tus cambios antes de correr el pipeline."
  git status --porcelain | tee -a "$RUN_LOG_DIR/run.log"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]]; then
  log "ERROR: estás en la rama '$CURRENT_BRANCH', no en la base '$BASE_BRANCH'. Cambia de rama primero."
  exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  log "--dry-run: setup OK, no se llama a claude ni a gemini. Saliendo."
  exit 0
fi

# ---------- 1. rama de trabajo ----------

SLUG="$(echo "$TASK" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/(^-|-$)//g' | cut -c1-40)"
BRANCH="ai/${SLUG}-${RUN_ID}"

log "Creando rama: $BRANCH"
git switch -c "$BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1

rollback_and_exit() {
  local reason="$1"
  log "ROLLBACK: $reason"
  git checkout -- . >>"$RUN_LOG_DIR/run.log" 2>&1 || true
  git clean -fd >>"$RUN_LOG_DIR/run.log" 2>&1 || true
  git switch "$BASE_BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
  git branch -D "$BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
  log "Rama '$BRANCH' descartada. El diff rechazado queda guardado en $RUN_LOG_DIR/diff.patch para que lo revises si crees que el bloqueo fue un error."
  exit 3
}

hold_and_exit() {
  local reason="$1"
  log "HOLD (no se mergea, no se descarta): $reason"
  git add -A -N >>"$RUN_LOG_DIR/run.log" 2>&1 || true
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A >>"$RUN_LOG_DIR/run.log" 2>&1
    git commit -q -m "[pipeline:hold] $TASK

Motivo: $reason
Run: $RUN_ID" >>"$RUN_LOG_DIR/run.log" 2>&1 || true
  fi
  git switch "$BASE_BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
  log "Rama '$BRANCH' queda viva para tu revisión manual: git switch $BRANCH"
  exit 4
}

# ---------- 2. el coder implementa ----------

CODER_PROMPT="$(cat "$PROMPTS_DIR/coder_system_prompt.md")

## Tarea a implementar

$TASK"

CODER_EXIT=1
if command -v claude >/dev/null 2>&1; then
  log "Llamando a Claude Code (coder primario)..."
  set +e
  claude -p "$CODER_PROMPT" \
    --permission-mode acceptEdits \
    --output-format json \
    --allowedTools "Edit,Write,Read,Glob,Grep" \
    > "$RUN_LOG_DIR/coder_output.json" 2>"$RUN_LOG_DIR/coder_stderr.log"
  CODER_EXIT=$?
  set -e
fi

if [[ $CODER_EXIT -ne 0 ]]; then
  log "AVISO: Coder primario falló o no está disponible (código $CODER_EXIT). Evaluando respaldo..."
  if command -v antigravity >/dev/null 2>&1; then
    log "Invocando Antigravity CLI (coder de respaldo)..."
    set +e
    antigravity -p "$CODER_PROMPT" > "$RUN_LOG_DIR/coder_output.json" 2>"$RUN_LOG_DIR/coder_stderr.log"
    CODER_EXIT=$?
    set -e
  elif command -v gemini >/dev/null 2>&1; then
    log "Invocando Gemini CLI (coder de respaldo)..."
    set +e
    gemini -p "$CODER_PROMPT" > "$RUN_LOG_DIR/coder_output.json" 2>"$RUN_LOG_DIR/coder_stderr.log"
    CODER_EXIT=$?
    set -e
  fi
fi

if [[ $CODER_EXIT -ne 0 ]]; then
  log "ERROR: tanto el coder primario como el respaldo fallaron al ejecutarse."
  rollback_and_exit "el coder falló al ejecutarse"
fi

CODER_SUMMARY="$(python3 -c "
import json
try:
    content = open('$RUN_LOG_DIR/coder_output.json', encoding='utf-8').read().strip()
    try:
        d = json.loads(content)
        print(d.get('result', d.get('summary', str(d))))
    except Exception:
        lines = [l.strip() for l in content.splitlines() if l.strip()]
        print(' '.join(lines[-3:]) if lines else '(sin resumen)')
except Exception as e:
    print(f'(no se pudo leer el resumen: {e})')
")"
log "Resumen del coder: $CODER_SUMMARY"

# ---------- 3. diff ----------

git add -A -N >>"$RUN_LOG_DIR/run.log" 2>&1
CHANGED_FILES="$(git diff --name-only)"

if [[ -z "$CHANGED_FILES" ]]; then
  log "El coder no modificó ningún archivo."
  git switch "$BASE_BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
  git branch -D "$BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
  exit 5
fi

echo "$CHANGED_FILES" > "$RUN_LOG_DIR/changed_files.txt"
git diff > "$RUN_LOG_DIR/diff.patch"
log "Archivos modificados:"
echo "$CHANGED_FILES" | sed 's/^/    /' | tee -a "$RUN_LOG_DIR/run.log"

# ---------- 4. clasificador de riesgo (determinístico) ----------

log "Clasificando riesgo del diff..."
python3 "$LIB_DIR/classify_diff.py" \
  --policy "$POLICY_FILE" \
  --files-from "$RUN_LOG_DIR/changed_files.txt" \
  ${CHANGE_TYPE:+--change-type "$CHANGE_TYPE"} \
  > "$RUN_LOG_DIR/classifier.json"

CLASSIFIER_TIER="$(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/classifier.json'))['tier'])")"
MATCHED_RULES="$(python3 -c "
import json
d = json.load(open('$RUN_LOG_DIR/classifier.json'))
for r in d['matched_rules']:
    print(f\"  - [{r['tier']}] {r['label']}\")
")"
log "Tier del clasificador: $CLASSIFIER_TIER"

if [[ "$CLASSIFIER_TIER" == "blocked" ]]; then
  rollback_and_exit "el clasificador de rutas marcó el cambio como BLOCKED (toca secretos o el propio pipeline) — esto nunca se aplica automáticamente, ni siquiera si el auditor lo aprobara"
fi

# ---------- 5. triage rápido (Kev — "System 1", opcional) ----------
#
# Kev es un modelo de decisión chico y local: si está prendido, da una
# lectura probabilística en ~cientos de ms sobre si el diff se salió
# de alcance o toca algo sensible, ANTES de gastar una llamada al
# auditor LLM pesado. Es puramente aditivo: si no responde, se ignora
# y el pipeline sigue igual que siempre. Solo puede subir el tier
# (nunca bajarlo) y nunca puede producir "blocked" por sí solo.

KEV_CONFIG="$PIPELINE_DIR/config/kev.yaml"
KEV_TIER="$CLASSIFIER_TIER"
KEV_AVAILABLE="false"
KEV_SKIP_DEEP_AUDIT="false"

if [[ -f "$KEV_CONFIG" ]]; then
  python3 "$LIB_DIR/kev_triage.py" \
    --config "$KEV_CONFIG" \
    --task "$TASK" \
    --diff-file "$RUN_LOG_DIR/diff.patch" \
    --changed-files-file "$RUN_LOG_DIR/changed_files.txt" \
    > "$RUN_LOG_DIR/kev.json" 2>>"$RUN_LOG_DIR/run.log" || true

  KEV_AVAILABLE="$(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/kev.json')).get('available', False))" 2>/dev/null || echo false)"

  if [[ "$KEV_AVAILABLE" == "True" ]]; then
    KEV_SUGGESTED="$(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/kev.json'))['suggested_tier'])")"
    log "Kev (System 1): tier sugerido=$KEV_SUGGESTED $(python3 -c "
import json
d = json.load(open('$RUN_LOG_DIR/kev.json'))
print(f\"(in_scope={d['in_scope_probability']}, sensible={d['looks_sensitive_probability']})\")
")"
    KEV_TIER="$(python3 -c "
rank = {'auto': 0, 'approval': 1, 'blocked': 2}
a, b = '$CLASSIFIER_TIER', '$KEV_SUGGESTED'
print(a if rank.get(a, 1) >= rank.get(b, 1) else b)
")"
    KEV_SKIP_DEEP_AUDIT="$(python3 -c "
import json, yaml
cfg = yaml.safe_load(open('$KEV_CONFIG'))
d = json.load(open('$RUN_LOG_DIR/kev.json'))
th = cfg.get('confidence_thresholds', {})
skip = (
    cfg.get('skip_deep_audit_when_confident', False)
    and '$KEV_TIER' == 'auto'
    and d['in_scope_probability'] >= th.get('in_scope_min', 0.9)
    and d['looks_sensitive_probability'] <= th.get('looks_sensitive_max', 0.1)
)
print('true' if skip else 'false')
")"
  else
    log "Kev no disponible ($(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/kev.json')).get('reason','?'))" 2>/dev/null || echo '?')) — se ignora esta capa, se sigue directo al auditor."
  fi
fi

if [[ "$KEV_TIER" == "blocked" ]]; then
  # no debería pasar nunca (kev_triage.py topa en "approval"), pero
  # fail-safe por si algún día cambia esa lógica
  rollback_and_exit "Kev escaló el tier a blocked — esto no debería ocurrir (Kev tiene techo en approval), revisar kev_triage.py"
fi

# ---------- 6. auditor (Gemini / Antigravity) ----------

AUDITOR_BIN=""
if command -v gemini >/dev/null 2>&1; then
  AUDITOR_BIN="gemini"
elif command -v antigravity >/dev/null 2>&1; then
  AUDITOR_BIN="antigravity"
fi

python3 "$LIB_DIR/render_prompt.py" "$PROMPTS_DIR/audit_prompt.md" \
  "TASK_DESCRIPTION=$TASK" \
  "CLASSIFIER_TIER=$KEV_TIER" \
  "MATCHED_RULES=$MATCHED_RULES" \
  "CHANGED_FILES=$CHANGED_FILES" \
  "DIFF=@$RUN_LOG_DIR/diff.patch" \
  > "$RUN_LOG_DIR/audit_prompt_filled.md"

if [[ "$KEV_SKIP_DEEP_AUDIT" == "true" ]]; then
  log "AVISO: skip_deep_audit_when_confident está activo y Kev está muy seguro (in_scope alto, nada sensible) — se salta Gemini/Antigravity para este cambio tier 'auto'."
  cat > "$RUN_LOG_DIR/audit.json" << EOF
{
  "verdict": "APPROVE",
  "tier_confirmed": "auto",
  "tier_override_reason": null,
  "summary": "Auditado solo por Kev (System 1) — auditor LLM omitido por config (skip_deep_audit_when_confident).",
  "issues": [],
  "scope_creep": null
}
EOF
  AUDITOR_BIN="kev-only"
elif [[ -z "$AUDITOR_BIN" ]]; then
  hold_and_exit "no se encontró el CLI 'gemini' ni 'antigravity' — sin auditor disponible, el pipeline NUNCA mergea solo. El prompt de auditoría ya está listo en $RUN_LOG_DIR/audit_prompt_filled.md por si lo quieres correr manualmente."
else
  log "Llamando al auditor ($AUDITOR_BIN)..."
  set +e
  "$AUDITOR_BIN" -p "$(cat "$RUN_LOG_DIR/audit_prompt_filled.md")" \
    > "$RUN_LOG_DIR/audit_raw.txt" 2>"$RUN_LOG_DIR/audit_stderr.log"
  AUDIT_EXIT=$?
  set -e

  if [[ $AUDIT_EXIT -ne 0 ]]; then
    hold_and_exit "el auditor ($AUDITOR_BIN) falló al ejecutarse (código $AUDIT_EXIT) — ver $RUN_LOG_DIR/audit_stderr.log. Sin auditoría válida no se mergea nada."
  fi

  python3 "$LIB_DIR/extract_json.py" "$RUN_LOG_DIR/audit_raw.txt" > "$RUN_LOG_DIR/audit.json" \
    || hold_and_exit "no se pudo parsear la respuesta del auditor como JSON — revisa $RUN_LOG_DIR/audit_raw.txt a mano"
fi

AUDIT_VERDICT="$(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/audit.json')).get('verdict','UNKNOWN'))")"
AUDIT_TIER="$(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/audit.json')).get('tier_confirmed','approval'))")"
log "Veredicto del auditor: $AUDIT_VERDICT (tier confirmado: $AUDIT_TIER)"

# el tier final es el más restrictivo entre clasificador, Kev y auditor
CLASSIFIER_TIER="$KEV_TIER"
FINAL_TIER="$(python3 -c "
rank = {'auto': 0, 'approval': 1, 'blocked': 2}
a, b = '$CLASSIFIER_TIER', '$AUDIT_TIER'
print(a if rank.get(a, 1) >= rank.get(b, 1) else b)
")"
log "Tier final: $FINAL_TIER"

if [[ "$AUDIT_VERDICT" == "BLOCK" || "$FINAL_TIER" == "blocked" ]]; then
  rollback_and_exit "el auditor bloqueó el cambio o subió el tier a blocked"
fi

if [[ "$AUDIT_VERDICT" == "NEEDS_CHANGES" ]]; then
  hold_and_exit "el auditor pidió cambios antes de mergear — revisa $RUN_LOG_DIR/audit.json"
fi

if [[ "$AUDIT_VERDICT" != "APPROVE" ]]; then
  hold_and_exit "veredicto de auditor desconocido/inesperado ('$AUDIT_VERDICT') — fail-safe, no se mergea nada solo"
fi

# ---------- 6. si el cambio necesita aprobación humana, paramos aquí ----------

if [[ "$FINAL_TIER" == "approval" ]]; then
  hold_and_exit "el auditor aprobó el cambio, pero el tier es 'approval' (toca DB/auth/pagos/producción) — necesita tu OK explícito. Corre: git switch $BRANCH && git merge --no-ff -m 'merge: $TASK' $BASE_BRANCH  (o al revés) cuando lo hayas revisado."
fi

# ---------- 7. build / test gate ----------

log "Corriendo build/test gate..."
BUILD_STATUS="skipped"
if [[ -f package.json ]]; then
  HAS_BUILD="$(python3 -c "import json; d=json.load(open('package.json')); print('build' in d.get('scripts',{}))")"
  HAS_TEST="$(python3 -c "import json; d=json.load(open('package.json')); print('test' in d.get('scripts',{}))")"
  set +e
  if [[ "$HAS_BUILD" == "True" ]]; then
    npm run build > "$RUN_LOG_DIR/build.log" 2>&1
    BUILD_EXIT=$?
    BUILD_STATUS="build"
  elif [[ "$HAS_TEST" == "True" ]]; then
    npm test > "$RUN_LOG_DIR/build.log" 2>&1
    BUILD_EXIT=$?
    BUILD_STATUS="test"
  else
    BUILD_EXIT=0
  fi
  set -e
else
  BUILD_EXIT=0
fi

if [[ $BUILD_EXIT -ne 0 ]]; then
  hold_and_exit "el build/test ($BUILD_STATUS) falló — ver $RUN_LOG_DIR/build.log. El cambio queda en la rama sin mergear."
fi

if [[ "$BUILD_STATUS" == "skipped" ]]; then
  log "AVISO: no se encontró script de build ni test en package.json — el merge automático se hace sin verificación de build. Agrega uno para que este gate sirva de algo."
fi

# ---------- 8. merge automático (tier auto + audit APPROVE + build OK) ----------

git add -A >>"$RUN_LOG_DIR/run.log" 2>&1
git commit -q -m "$TASK

Tier: auto | Auditor: APPROVE ($AUDITOR_BIN)
Resumen del auditor: $(python3 -c "import json; print(json.load(open('$RUN_LOG_DIR/audit.json')).get('summary',''))")
Run: $RUN_ID" >>"$RUN_LOG_DIR/run.log" 2>&1

git switch "$BASE_BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
git merge --no-ff -m "merge: $TASK (auto, run $RUN_ID)" "$BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1
git branch -d "$BRANCH" >>"$RUN_LOG_DIR/run.log" 2>&1

log "✅ MERGED automáticamente a $BASE_BRANCH (tier auto, auditor APPROVE, build OK)."
log "Reporte completo en: pipeline/logs/$RUN_ID/"
