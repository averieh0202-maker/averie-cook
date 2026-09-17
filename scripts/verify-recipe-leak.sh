#!/usr/bin/env bash
# Verify anonymous dish detail never includes recipe fields.
set -euo pipefail
BASE="${1:-http://127.0.0.1:8787}"
ID="2026-09-14-chicken-pumpkin-risotto"
BODY="$(curl -fsS "$BASE/api/dishes/$ID")"
echo "$BODY"
python3 - "$BODY" <<'PY'
import json, sys
raw = sys.argv[1]
data = json.loads(raw)
blob = json.dumps(data)
forbidden = [
    "recipe", "notes", "calories", "ingredients", "ingredients_v1",
    "ingredients_v2_next", "steps", "tasting", "improvements", "summary",
    "coverPath", "cover_path",
]
hits = [k for k in forbidden if f'"{k}":' in blob]
if hits:
    raise SystemExit(f"LEAK: {hits}")
if "recipe" in (data.get("dish") or {}):
    raise SystemExit("LEAK: recipe key present")
print("OK: anonymous dish detail has no recipe fields")
PY
