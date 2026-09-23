#!/usr/bin/env python3
"""
Cliente mínimo para el contrato `/v1/systemone` de Kev
(github.com/jaredpalmer/kev), sin dependencias externas (solo stdlib —
el servidor de Kev corre local y no necesita nada más para hablarle).

Schema real (confirmado contra kev/api.py del repo, 2026-09-23):

Request:
    {
      "state": <JSON cualquiera — lo que se evalúa>,
      "model": "kev-latest",
      "questions": {
        "<id>": {"type": "noul", "instructions": "...", "criteria": {...}?},
        "<id>": {"type": "choice", "instructions": "...", "criteria": {"opcion_a": "...", ...}},
        "<id>": {"type": "score", "instructions": "...", "criteria": ["nivel0", "nivel1", ...]}
      }
    }

Response (dict por question_id):
    noul:   {"type": "noul", "noul": <float 0-1>}
    choice: {"type": "choice", "choice": "<opción elegida>", "confidence": <float>, "probabilities": {...}}
    score:  {"type": "score", "score": <float>, "legend": {...}, "probabilities": {...}, "confidence": <float>}

No hay autenticación — el servidor de Kev está pensado solo para uso
local (correr con `kev.serve` en tu propia máquina/VPS).
"""
import json
import urllib.error
import urllib.request


class KevUnavailable(Exception):
    """El servidor de Kev no respondió — quien llame debe degradar con gracia (fail_open)."""


def call_systemone(base_url: str, state, questions: dict, model: str = "kev-latest", timeout: int = 10) -> dict:
    url = base_url.rstrip("/") + "/v1/systemone"
    payload = json.dumps({"state": state, "model": model, "questions": questions}).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise KevUnavailable(f"no se pudo contactar Kev en {url}: {e}") from e
    except json.JSONDecodeError as e:
        raise KevUnavailable(f"Kev respondió algo que no es JSON válido: {e}") from e
