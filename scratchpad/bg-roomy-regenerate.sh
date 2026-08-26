#!/bin/sh
# ROADMAP item 24 — rebuild the ROOMY bg-override fixture from aeon at a PINNED
# revision, end to end, without touching aeon's working tree.
#
#   1. git-archive aeon @ AEON_SHA (tools/ + games/sonic4/data/...) into a tempdir
#   2. provenance: run the generator on BOTH bg_src PNGs (budget gate bypassed
#      inside the probe only) and say which reproduces the live blob's tile bytes
#   3. bg-simplify.py  -> scratchpad/fixtures/ojz_forest_flowers.roomy.png
#   4. aeon's generator (gate INTACT) -> test/fixtures/bg-override/editor_bg_override.roomy.json
#   5. print the hashes that belong in editor_bg_override.roomy.provenance.json
#
# Usage: sh scratchpad/bg-roomy-regenerate.sh [AEON_SHA]
# Env:   AEON=/path/to/aeon (default: ../aeon relative to this repo)
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
AEON=${AEON:-$HERE/../aeon}
SHA=${1:-a840d68f69f27849b5b61c131a8387e4a6b0c024}
PIN=$(mktemp -d -t aeon-pin-XXXXXX)
git -C "$AEON" fetch -q origin
echo "origin/master is $(git -C "$AEON" rev-parse origin/master); reading at $SHA"
git -C "$AEON" archive "$SHA" tools games/sonic4/vram.toml \
  games/sonic4/data/editor_bg_override.json games/sonic4/data/editor \
  games/sonic4/data/generated/ojz/act1/ojz_palette.bin | tar -x -C "$PIN"

echo "== provenance (item 1)"
python3 "$HERE/scratchpad/bg-provenance-probe.py" "$PIN"

echo "== simplify (item 2)"
mkdir -p "$HERE/scratchpad/fixtures" "$HERE/test/fixtures/bg-override"
python3 "$HERE/scratchpad/bg-simplify.py" \
  "$PIN/games/sonic4/data/editor/bg_src/ojz_forest_flowers.png" \
  "$HERE/scratchpad/fixtures/ojz_forest_flowers.roomy.png" --aeon-tools "$PIN/tools"

echo "== aeon's generator, gate intact (the judge)"
OUT="$HERE/test/fixtures/bg-override/editor_bg_override.roomy.json"
rm -f "$OUT"
python3 "$PIN/tools/png_to_bg_override.py" \
  "$HERE/scratchpad/fixtures/ojz_forest_flowers.roomy.png" --out "$OUT"

echo "== hashes for the provenance sidecar"
sha256sum "$PIN/games/sonic4/data/editor/bg_src/ojz_forest_flowers.png" \
  "$PIN/games/sonic4/data/editor_bg_override.json" \
  "$HERE/scratchpad/fixtures/ojz_forest_flowers.roomy.png" "$OUT"
rm -rf "$PIN"
