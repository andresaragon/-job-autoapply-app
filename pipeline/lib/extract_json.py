#!/usr/bin/env python3
"""
Extrae el primer bloque JSON válido de la salida de texto de un LLM.

Los CLIs de chat (gemini, claude, etc.) a veces envuelven el JSON en
```json ... ``` o le agregan texto antes/después aunque el prompt pida
"solo JSON". Este script es tolerante a eso: busca el primer '{' y va
probando hasta el último '}' que produzca un JSON válido.

Uso:
    extract_json.py <archivo_de_texto>   # imprime el JSON limpio por stdout
"""
import json
import sys


def extract_json(text: str) -> dict:
    start = text.find("{")
    if start == -1:
        raise ValueError("no se encontró '{' en la respuesta del auditor")

    end = text.rfind("}")
    while end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            end = text.rfind("}", start, end)
    raise ValueError("no se pudo parsear ningún JSON válido en la respuesta")


def main():
    if len(sys.argv) != 2:
        print("uso: extract_json.py <archivo>", file=sys.stderr)
        sys.exit(2)

    text = open(sys.argv[1], encoding="utf-8").read()
    data = extract_json(text)
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
