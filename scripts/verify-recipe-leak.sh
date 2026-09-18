#!/usr/bin/env bash
# Verify anonymous dish JSON (API and Pages snapshot) never includes recipe fields.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 - "$ROOT" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
forbidden = [
    "recipe", "notes", "calories", "ingredients", "ingredients_v1",
    "ingredients_v2_next", "steps", "tasting", "improvements", "summary",
    "coverPath", "cover_path",
]
for rel in [
    "web/public/data/catalog.json",
    "web/public/data/dishes-cooked.json",
    "web/public/data/dishes-want-cook.json",
]:
    data = json.loads((root / rel).read_text())
    blob = json.dumps(data, ensure_ascii=False)
    hits = [k for k in forbidden if f'"{k}":' in blob]
    if hits:
        raise SystemExit(f"LEAK {rel}: {hits}")
    for dish in data.get("dishes") or []:
        if "recipe" in dish:
            raise SystemExit(f"LEAK {rel}: recipe key present")
        cover = dish.get("coverUrl") or ""
        if "workers.dev" in cover or "/api/media/" in cover:
            raise SystemExit(f"LEAK {rel}: Worker media cover {cover}")
print("OK: Pages snapshot has no recipe fields or Worker media URLs")
PY

if [[ "${1-}" == "--snapshot-only" ]]; then
  exit 0
fi

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
