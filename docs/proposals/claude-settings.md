# Propuesta: `.claude/settings.json`

**Estado:** propuesta. Es configuración de permisos del propio agente, así que no la crea un agente:
la pegas tú en `.claude/settings.json` (ruta relativa al repo) y la revisas.

Cambios respecto al kit original: se permite `npm test`, se amplían los `.env*` denegados y se añaden
reglas `Bash` para que `cat .env*` tampoco los lea (`Read(...)` por sí solo no bloquea la lectura desde Bash).
La sintaxis exacta de las reglas depende de tu versión de Claude Code: compruébala con `/permissions`.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run typecheck)",
      "Bash(npm run lint)",
      "Bash(npm test)",
      "Bash(npm run build)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.local)",
      "Read(./.env.development)",
      "Read(./.env.production)",
      "Read(./.env.*.local)",
      "Bash(cat .env*)",
      "Bash(cat ./.env*)",
      "Edit(./pipeline/policy/**)",
      "Edit(./pipeline/orchestrator.sh)"
    ]
  }
}
```

Verificación tras aplicarlo (como en el kit): pídele a Claude que lea `.env.local` (debe negarse) y que edite
`pipeline/orchestrator.sh` (debe negarse). Las reglas `deny` sobre el pipeline también te bloquean a ti
dentro de Claude Code; quítalas temporalmente si quieres aplicar la propuesta del gate con su ayuda.
