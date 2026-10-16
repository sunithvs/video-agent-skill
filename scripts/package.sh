#!/usr/bin/env bash
# Builds dist/<skill>.skill files (zip, skill folder at the root) for uploading to claude.ai > Settings > Skills.
#   bash scripts/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import fnmatch, os, zipfile
src = "plugins/video-editor/skills"
skip_dirs, skip_files = {"__pycache__", "node_modules", "evals"}, {".DS_Store"}
for name in sorted(os.listdir(src)):
    base = os.path.join(src, name)
    if not os.path.isfile(os.path.join(base, "SKILL.md")):
        continue
    out = f"dist/{name}.skill"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for d, dirs, files in os.walk(base):
            dirs[:] = sorted(x for x in dirs if x not in skip_dirs)
            for f in sorted(files):
                if f in skip_files or fnmatch.fnmatch(f, "*.pyc"):
                    continue
                p = os.path.join(d, f)
                z.write(p, os.path.relpath(p, src))
    print(f"{out}  {os.path.getsize(out) // 1024} KB")
PY
