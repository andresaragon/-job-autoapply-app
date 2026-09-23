#!/usr/bin/env python3
"""
Capa "System 1" del pipeline: le pasa la tarea + el diff a Kev
(modelo de decisión chico, local, ~cientos de ms) para una lectura
rápida y barata ANTES de gastar una llamada al auditor LLM pesado
(Gemini/Antigravity = "System 2").

Diseño de seguridad (igual que el resto del pipeline — ver
policy/approval-policy.yaml y orchestrator.sh):
  - Kev es 100% opcional. Si no está prendido o no responde, este
    script no falla: devuelve {"available": false} y el orquestador
    sigue derecho al auditor LLM como si Kev no existiera.
  - Kev solo puede EMPUJAR el tier hacia arriba (más conservador),
    nunca hacia abajo. Y su techo es "approval" — nunca puede producir
    "blocked" por sí solo; eso queda reservado para las reglas
    determinísticas de rutas y para el veredicto explícito del auditor
    LLM. Un modelo de 0.5-9B no debería tener la última palabra para
    tirar abajo un cambio solo.

Uso:
    kev_triage.py --config pipeline/config/kev.yaml \
        --task "descripción de la tarea" \
        --diff-file pipeline/logs/<run>/diff.patch \
        --changed-files-file pipeline/logs/<run>/changed_files.txt

Salida: JSON por stdout, siempre con exit code 0 (el llamador decide
qué hacer con "available": false).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kev_client import KevUnavailable, call_systemone  # noqa: E402

try:
    import yaml
except ImportError:
    print(json.dumps({"available": False, "reason": "PyYAML no instalado"}))
    sys.exit(0)

TIER_RANK = {"auto": 0, "approval": 1, "blocked": 2}
KEV_MAX_TIER = "approval"  # techo: Kev nunca puede sugerir "blocked" por su cuenta


def build_questions() -> dict:
    return {
        "in_scope": {
            "type": "noul",
            "instructions": (
                "¿El diff implementa ÚNICAMENTE lo que pide la tarea descrita, "
                "sin modificar archivos, lógica o configuración que no tienen "
                "relación con esa tarea? Responde con la probabilidad de que "
                "SÍ esté en alcance (1.0 = totalmente en alcance)."
            ),
        },
        "looks_sensitive": {
            "type": "noul",
            "instructions": (
                "¿El diff toca (aunque sea de forma indirecta) autenticación, "
                "autorización, pagos/facturación, acceso o manejo de datos "
                "sensibles, secretos/credenciales, o configuración de "
                "producción — incluso si los nombres de archivo no lo "
                "sugieren obviamente? Responde con la probabilidad de que SÍ "
                "toque algo sensible."
            ),
        },
        "suggested_tier": {
            "type": "choice",
            "instructions": (
                "Clasifica el riesgo de aplicar este cambio automáticamente, "
                "sin revisión humana."
            ),
            "criteria": {
                "auto": "Bajo riesgo — seguro de aplicar sin que un humano lo revise.",
                "approval": "Debería esperar la revisión y aprobación explícita de un humano antes de aplicarse.",
            },
        },
    }


def triage(config: dict, task: str, diff_text: str, changed_files: list[str]) -> dict:
    if not config.get("enabled", True):
        return {"available": False, "reason": "Kev deshabilitado en config (enabled: false)"}

    state = {"task": task, "changed_files": changed_files, "diff": diff_text}

    try:
        raw = call_systemone(
            base_url=config["base_url"],
            state=state,
            questions=build_questions(),
            model=config.get("model", "kev-latest"),
            timeout=config.get("timeout_seconds", 10),
        )
    except KevUnavailable as e:
        return {"available": False, "reason": str(e)}

    try:
        in_scope_p = float(raw["in_scope"]["noul"])
        sensitive_p = float(raw["looks_sensitive"]["noul"])
        tier_choice = raw["suggested_tier"]["choice"]
        tier_confidence = float(raw["suggested_tier"]["confidence"])
    except (KeyError, TypeError, ValueError) as e:
        return {"available": False, "reason": f"respuesta de Kev con forma inesperada: {e}", "raw": raw}

    tier = tier_choice if tier_choice in TIER_RANK else "approval"

    escalation_reasons = []
    if sensitive_p >= 0.5:
        escalation_reasons.append(f"looks_sensitive={sensitive_p:.2f}")
        if TIER_RANK[tier] < TIER_RANK["approval"]:
            tier = "approval"
    if in_scope_p < 0.5:
        escalation_reasons.append(f"in_scope={in_scope_p:.2f} (posible scope creep)")
        if TIER_RANK[tier] < TIER_RANK["approval"]:
            tier = "approval"

    # techo de seguridad: Kev nunca decide "blocked" por su cuenta
    if TIER_RANK[tier] > TIER_RANK[KEV_MAX_TIER]:
        tier = KEV_MAX_TIER

    return {
        "available": True,
        "suggested_tier": tier,
        "tier_confidence": round(tier_confidence, 4),
        "in_scope_probability": round(in_scope_p, 4),
        "looks_sensitive_probability": round(sensitive_p, 4),
        "escalation_reasons": escalation_reasons,
        "raw": raw,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--diff-file", required=True)
    parser.add_argument("--changed-files-file", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    diff_text = Path(args.diff_file).read_text(encoding="utf-8")
    changed_files = [
        line.strip()
        for line in Path(args.changed_files_file).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    result = triage(config, args.task, diff_text, changed_files)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
