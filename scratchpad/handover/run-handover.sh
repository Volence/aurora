#!/bin/sh
# THE RUNNER for the handover band. Every gate this parcel added or modified is
# executed from here, so "wired into a runner" names a file rather than a habit.
#
#   sh scratchpad/handover/run-handover.sh              # resolved origin/master
#   sh scratchpad/handover/run-handover.sh <AEON_REV>   # a specific pin
#   AUTHOR=1 sh scratchpad/handover/run-handover.sh     # re-author through the UI first
#
# WITHOUT AUTHOR=1 this judges the COMMITTED artifact
# (test/fixtures/bg-override/editor_bg_override.handover-band.json), which is
# what a fresh session wants: no Electron, no xvfb, no debug build.
# WITH AUTHOR=1 it re-authors the band through the real UI under CDP first,
# which needs `VITE_AURORA_DEBUG=1 npm run build`.
#
# NO EMULATOR AND NO BUILD ANYWHERE IN HERE, deliberately: the ROM stage is the
# overseer's, in the foreground.
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
AEON_DIR=${AEON_DIR:-/home/volence/sonic_hacks/aeon}
REV=${1:-$(git -C "$AEON_DIR" ls-remote origin refs/heads/master | cut -f1)}
ART=$ROOT/test/fixtures/bg-override/editor_bg_override.handover-band.json
EMIT=$ROOT/scratchpad/handover/emit
export AEON_DIR

echo "### aeon pin: $REV"
echo "### artifact: $ART"
echo

if [ -n "$AUTHOR" ]; then
  echo "=== 1. AUTHOR THE BAND THROUGH THE REAL UI (CDP) ==============="
  AEON_SHA=$REV node "$ROOT/scratchpad/handover/handover-band-harness.mjs"
  cp "$EMIT/live-promoted-shift.json" "$ART"
  echo
else
  echo "=== 1. AUTHORING SKIPPED (AUTHOR=1 to re-run it under CDP) ====="
  mkdir -p "$EMIT"
  git -C "$AEON_DIR" show "$REV:games/sonic4/data/editor_bg_override.json" > "$EMIT/live-before.json"
  cp "$ART" "$EMIT/live-promoted-shift.json"
  echo "    before/after staged into scratchpad/handover/emit from the pin + the artifact"
  echo
fi

echo "=== 2. AEON'S SECTION-SIZE GATE, CALLED (not re-implemented) ==="
python3 "$ROOT/scratchpad/handover/aeon-section-fit.py" "$ART" --rev "$REV"
echo
echo "--- red-first: the same gate on an over-ceiling band must REFUSE ---"
# The plant size is DERIVED from the pin's own ceiling, so a raised ceiling can
# never quietly turn this proof vacuous (it did move 9394 -> 12288 mid-session).
OVER=$(python3 - "$AEON_DIR" "$REV" <<'PY'
import subprocess, sys, tempfile, pathlib, importlib.util
aeon, rev = sys.argv[1], sys.argv[2]
d = pathlib.Path(tempfile.mkdtemp())
for m in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (d / pathlib.Path(m).name).write_bytes(subprocess.run(
        ["git", "-C", aeon, "show", f"{rev}:{m}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(d))
s = importlib.util.spec_from_file_location("inj", d / "inject_editor_bg.py")
inj = importlib.util.module_from_spec(s); s.loader.exec_module(inj)
print((inj.BGANIM_SECTION_CEILING - inj.BGANIM_COUNT_BYTES - inj.BGANIM_RECORD_BYTES)
      // inj.BGANIM_BYTES_PER_SLOT + 1)
PY
)
python3 "$ROOT/scratchpad/handover/aeon-section-fit.py" "$ART" --rev "$REV" --plant-slots "$OVER"
echo

echo "=== 3. DOES IT MOVE, on the bytes aeon emits ==================="
python3 "$ROOT/scratchpad/handover/aeon-banks-move.py" "$ART" --rev "$REV"
echo
echo "--- red-first: a copy-filled band (the panel's DEFAULT) must be CAUGHT ---"
python3 "$ROOT/scratchpad/handover/aeon-banks-move.py" "$ART" --rev "$REV" --plant-copy
echo

echo "=== 4. COMPOSITION: aeon's own injector judges the document ===="
AEON_REV=$REV python3 "$ROOT/scratchpad/bganim-promoted-vs-aeon-injector.py" \
  "$EMIT" --after live-promoted-shift.json
echo

echo "=== 5. THE RE-POINTED ANTI-VACUOUS GUARD in the model emit ====="
MODEL=$ROOT/scratchpad/handover/model-emit
mkdir -p "$MODEL"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/scratchpad/bganim-promoted-vs-aeon-injector.emit.ts" \
  --bundle --platform=node --format=cjs --outfile="$MODEL/emit.cjs" >/dev/null 2>&1 \
  || /home/volence/sonic_hacks/aurora/node_modules/.bin/esbuild \
       "$ROOT/scratchpad/bganim-promoted-vs-aeon-injector.emit.ts" \
       --bundle --platform=node --format=cjs --outfile="$MODEL/emit.cjs" >/dev/null 2>&1
cp "$EMIT/live-before.json" "$MODEL/live-source.json"
echo "--- green: the model authors the SAME band the UI did ---"
PROMOTE_COLS=8 PROMOTE_ROWS=4 PROMOTE_FROM=2 PROMOTE_FILL=shift PROMOTE_RATE_SHIFT=none \
  node "$MODEL/emit.cjs" "$MODEL/live-source.json" "$MODEL"
if [ "$(sha256sum < "$MODEL/live-promoted.json")" = "$(sha256sum < "$ART")" ]; then
  echo "    MODEL-AUTHORED == UI-AUTHORED, byte for byte  (ROADMAP row 29's question)"
else
  echo "    **THE MODEL AND THE UI DISAGREE — that is the finding, not a nuisance**"
  exit 1
fi
echo
echo "--- red-first: a document where NOTHING draws the promoted range ---"
python3 - "$MODEL" <<'PY'
import json, sys, pathlib
m = pathlib.Path(sys.argv[1])
d = json.loads((m / "live-source.json").read_text())
lay = d["layout"]
for i, w in enumerate(lay):
    if w != 0 and 2 <= (w & 0x7FF) < 34:
        lay[i] = (w & ~0x7FF) | 100        # repoint OUT of the promoted range
(m / "poison-undrawn.json").write_text(json.dumps(d))
PY
if PROMOTE_COLS=8 PROMOTE_ROWS=4 PROMOTE_FROM=2 PROMOTE_FILL=shift PROMOTE_RATE_SHIFT=none \
     node "$MODEL/emit.cjs" "$MODEL/poison-undrawn.json" "$MODEL" 2>&1 \
     | grep -q 'VACUOUS: no layout cell draws tiles 2\.\.34'; then
  echo "    RED AS EXPECTED — the guard fired with its OWN words"
else
  echo "    **THE PLANT PASSED (or failed for another reason): the guard asserts nothing**"
  exit 1
fi
# And the alternative-green this rules out: the SAME poisoned document promotes
# fine at a range it DOES draw, so the refusal above is the range, not the doc.
PROMOTE_COLS=8 PROMOTE_ROWS=4 PROMOTE_FROM=100 PROMOTE_FILL=shift PROMOTE_RATE_SHIFT=none \
  node "$MODEL/emit.cjs" "$MODEL/poison-undrawn.json" "$MODEL" | sed 's/^/    [alt-green] /'
rm -f "$MODEL/poison-undrawn.json"
PROMOTE_COLS=8 PROMOTE_ROWS=4 PROMOTE_FROM=2 PROMOTE_FILL=shift PROMOTE_RATE_SHIFT=none \
  node "$MODEL/emit.cjs" "$MODEL/live-source.json" "$MODEL" >/dev/null   # restore

echo
echo "======================================================================"
echo "ALL STAGES GREEN at $REV. Not proven here: build, ROM, emulator."
