#!/usr/bin/env python3
"""Rellena un template de prompt (audit_prompt.md) con variables {{VAR}}.

Usa reemplazo literal de strings (no regex/format) para no romperse si
el diff contiene llaves, backslashes o cualquier caracter especial.

Uso:
    render_prompt.py <template.md> KEY1=valor_o_@archivo KEY2=valor ...

Si un valor empieza con "@", se lee el contenido de ese archivo en vez
de usarlo literal (útil para pasar el diff completo sin líos de shell-quoting).
"""
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("uso: render_prompt.py <template.md> KEY=valor ...", file=sys.stderr)
        sys.exit(2)

    template_path = Path(sys.argv[1])
    text = template_path.read_text(encoding="utf-8")

    for pair in sys.argv[2:]:
        key, _, value = pair.partition("=")
        if value.startswith("@"):
            value = Path(value[1:]).read_text(encoding="utf-8")
        text = text.replace("{{" + key + "}}", value)

    sys.stdout.write(text)


if __name__ == "__main__":
    main()
