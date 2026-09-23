#!/usr/bin/env python3
"""
Clasifica un diff de git contra pipeline/policy/approval-policy.yaml y
decide el tier de aprobación (auto / approval / blocked).

Esto es la primera línea de defensa, determinística y sin LLM de por
medio: corre ANTES del auditor. El auditor (Gemini/Antigravity) recibe
este resultado en su prompt y puede subir el tier (nunca bajarlo) si
encuentra algo riesgoso que el clasificador de rutas no detectó.

Uso:
    classify_diff.py --files-from <archivo-con-paths> [--change-type bugfix]
    classify_diff.py --repo-path . --base main   # calcula los paths con git diff

Salida: JSON por stdout con {tier, matched_rules, changed_files}
"""
import argparse
import json
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        json.dumps(
            {
                "error": "PyYAML no está instalado. Corre: pip install pyyaml --break-system-packages"
            }
        )
    )
    sys.exit(2)

TIER_RANK = {"auto": 0, "approval": 1, "blocked": 2}


def load_policy(policy_path: Path) -> dict:
    with open(policy_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_changed_files(repo_path: str, base: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", repo_path, "diff", "--name-only", f"{base}...HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # fallback: diff contra el working tree (útil si aún no hay commit)
        result = subprocess.run(
            ["git", "-C", repo_path, "diff", "--name-only", base],
            capture_output=True,
            text=True,
        )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


@lru_cache(maxsize=None)
def _compile_glob(pattern: str) -> re.Pattern:
    """
    Traduce un glob estilo gitignore/pathspec a regex, con semántica
    real de "**" (cero o más segmentos de ruta, incluyendo cero — o sea
    que "app/**/page.js" matchea TANTO "app/x/page.js" COMO el archivo
    en la raíz "app/page.js"). fnmatch NO tiene esto: su "*" ya cruza
    "/", así que "**" termina exigiendo un "/" literal de más y falla
    justo en el caso más común (archivo en la raíz de la carpeta).
    """
    i, n = 0, len(pattern)
    out = []
    while i < n:
        c = pattern[i]
        if c == "*":
            if i + 1 < n and pattern[i + 1] == "*":
                if i + 2 < n and pattern[i + 2] == "/":
                    out.append("(?:.*/)?")  # "**/"  -> cero o más segmentos
                    i += 3
                    continue
                out.append(".*")  # "**" al final o sin "/" después
                i += 2
                continue
            out.append("[^/]*")  # "*" normal: no cruza "/"
            i += 1
            continue
        if c == "?":
            out.append("[^/]")
            i += 1
            continue
        out.append(re.escape(c))
        i += 1
    return re.compile("^" + "".join(out) + "$")


def matches_any(path: str, patterns: list[str]) -> bool:
    return any(_compile_glob(pat).match(path) for pat in patterns or [])


def classify(changed_files: list[str], change_type: str, policy: dict) -> dict:
    """
    El tier se calcula POR ARCHIVO, no por el diff completo: si un solo
    archivo del cambio no matchea ninguna regla, ESE archivo cae en
    default_tier, aunque otros archivos del mismo diff sí hayan
    matcheado una regla más permisiva. Así un archivo sin categorizar
    (ej: una ruta de API nueva) no puede "esconderse" detrás de un
    archivo inocuo (ej: un test) que sí matcheó tier auto.
    """
    default_tier = policy.get("default_tier", "approval")
    rules = policy.get("rules", [])

    matched_rules = []
    worst_tier = "auto"
    file_tiers: dict[str, str] = {}

    # una regla de change_type (ej: "bugfix") es el fallback para un
    # archivo que no matcheó ninguna regla de rutas — reemplaza a
    # default_tier, pero SIGUE perdiendo contra una regla de ruta más
    # restrictiva (auth/pagos/DB/secretos) si el archivo matchea esa.
    change_type_tier = None
    change_type_label = None
    for rule in rules:
        match = rule.get("match", {})
        if "change_type" in match and change_type and match["change_type"] == change_type:
            if change_type_tier is None or TIER_RANK[rule["tier"]] > TIER_RANK[change_type_tier]:
                change_type_tier = rule["tier"]
                change_type_label = rule.get("label", "")

    fallback_tier = change_type_tier if change_type_tier is not None else default_tier
    fallback_label = change_type_label if change_type_tier is not None else "Sin regla específica (default_tier)"

    path_rules = [r for r in rules if "paths" in r.get("match", {})]

    for f in changed_files:
        file_tier = None
        file_label = None
        for rule in path_rules:
            match = rule["match"]
            if matches_any(f, match["paths"]) and not matches_any(
                f, match.get("exclude_paths", [])
            ):
                # si un archivo matchea varias reglas, se queda con la más restrictiva
                if file_tier is None or TIER_RANK[rule["tier"]] > TIER_RANK[file_tier]:
                    file_tier = rule["tier"]
                    file_label = rule.get("label", "")

        if file_tier is None:
            file_tier = fallback_tier
            file_label = fallback_label

        file_tiers[f] = file_tier
        matched_rules.append({"tier": file_tier, "label": f"{file_label} ({f})"})
        if TIER_RANK[file_tier] > TIER_RANK[worst_tier]:
            worst_tier = file_tier

    if not changed_files:
        worst_tier = fallback_tier
        matched_rules.append({"tier": worst_tier, "label": f"Sin archivos — {fallback_label}"})

    return {
        "tier": worst_tier,
        "matched_rules": matched_rules,
        "file_tiers": file_tiers,
        "changed_files": changed_files,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", default=None, help="Ruta a approval-policy.yaml")
    parser.add_argument("--files-from", help="Archivo de texto con un path por línea")
    parser.add_argument("--repo-path", default=".", help="Ruta del repo git")
    parser.add_argument("--base", default="main", help="Rama/ref base para el diff")
    parser.add_argument(
        "--change-type",
        default=None,
        help="Tipo de cambio declarado por la tarea (ej: bugfix, feature)",
    )
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    policy_path = Path(args.policy) if args.policy else here.parent / "policy" / "approval-policy.yaml"
    policy = load_policy(policy_path)

    if args.files_from:
        changed_files = [
            line.strip()
            for line in Path(args.files_from).read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    else:
        changed_files = get_changed_files(args.repo_path, args.base)

    result = classify(changed_files, args.change_type, policy)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
