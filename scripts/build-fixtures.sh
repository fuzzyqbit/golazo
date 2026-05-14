#!/usr/bin/env bash
# Regenerate the committed integration-test clips under
# tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/. Uses ffmpeg's
# lavfi testsrc filter so the script has no external asset dependencies.
#
# Determinism note: libx264 threading and ffmpeg version differences can
# produce different bytes for the same lavfi input. The COMMITTED bytes
# are the canonical reference — if you regenerate, recompute any pinned
# sha256 expectations in tests that may have been added in later plans
# (Plan 04 only pins regex/shape, not exact bytes).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$REPO_ROOT/tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1"
mkdir -p "$DIR"

for i in 01 02 03; do
  ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x180:rate=15" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
    -movflags +faststart -an "$DIR/${i}-clip.mp4"
done

echo
echo "Generated:"
ls -la "$DIR"/*.mp4
