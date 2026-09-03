#!/usr/bin/env bash
# RED-FIRST FOR EW-TIMELINE-CLOCK (ROADMAP row 95).
#
# Every poison here: the mutation is APPLIED, then QUOTED BACK FROM DISK (a
# `git diff --stat` naming the file plus the mutated line read with `sed`)
# BEFORE the run — because an unapplied mutation and a correctly restored
# baseline print the same `ok`, and this repo has paid for exactly that. Then a
# run against a NAMED runner, then a restore with `git checkout --` from a
# COMMITTED baseline on a tree `git status --porcelain` says is clean, checked
# before and after.
#
# ⚠ THE HARNESS POISONS REBUILD `dist/` BETWEEN MUTATION AND RUN. The harness
# runs against the BUILD, so an unrebuilt mutation and a correct baseline are
# again the same artifact.
#
# ⚠ NO EMULATOR. Nothing here has seen a ROM.
#
# RUN:  bash scratchpad/poisons-anchor-authoring.sh [node|harness|all]
#
# Requires, for the harness half:
#   ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
#   AEON_DIR=<a writable COPY of an aeon project>

set -uo pipefail
cd "$(dirname "$0")/.."
WHICH="${1:-all}"

PROV=src/renderer/providers/effects-preset.ts
PREV=src/renderer/components/effects/AnchorSweepPreview.tsx
NODE_TEST=src/renderer/providers/__tests__/effects-preset-anchors.test.ts

BASELINE="$(git rev-parse HEAD)"
echo "════ baseline: $BASELINE (committed) ════"
DIRTY="$(git status --porcelain | wc -l)"
if [ "$DIRTY" != "0" ]; then
  echo "REFUSING: the tree is dirty ($DIRTY file(s)). A poison restored onto a dirty tree"
  echo "restores the wrong thing. Commit or stash first."
  git status --porcelain
  exit 2
fi

restore() {
  git checkout -- "$@"
  local d; d="$(git status --porcelain | wc -l)"
  echo "    restored — $d dirty file(s)"
  [ "$d" = "0" ] || { echo "    ⚠ RESTORE DID NOT CLEAN THE TREE"; exit 2; }
}

show() {   # show <file> <line-regex>
  echo "    --- the mutation, ON DISK ---"
  git diff --stat -- "$1" | sed 's/^/    /'
  grep -n -- "$2" "$1" | head -3 | sed 's/^/    ON DISK: /'
}

node_run() {  # node_run <label>
  echo "    runner: npx vitest run $NODE_TEST"
  npx vitest run "$NODE_TEST" --reporter=dot 2>&1 | grep -E "Tests |Test Files |FAIL " | sed 's/^/    /'
}

harness_run() {
  echo "    rebuilding dist/ (the harness runs against the BUILD)"
  VITE_AURORA_DEBUG=1 npx electron-vite build >/dev/null 2>&1 || { echo "    BUILD FAILED"; return; }
  echo "    runner: npm run harness:anchor-authoring"
  npm run harness:anchor-authoring 2>&1 | grep -E "^(FAIL|════)" | sed 's/^/    /'
}

# ═══════════════════════════════════════════════════════════════════════════
# NODE POISONS
# ═══════════════════════════════════════════════════════════════════════════

if [ "$WHICH" = "node" ] || [ "$WHICH" = "all" ]; then

echo
echo "════ P1 — the shift command SNAPS an off-ladder value instead of refusing it ════"
echo "     (the mistake the ladder design exists to prevent: one rung of rounding"
echo "      is a doubling or a halving that nothing downstream reports)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""  if (!onLadder) return null;
  return editPresetCommand(library, id, `Preset ${id} channel ${index} ${field}`, (p) => {""",
"""  if (!onLadder) shift = field === 'amp_shift'
    ? ANCHOR_AMP_RUNGS.reduce((b, r) => (Math.abs(r.amp_shift - shift) < Math.abs(b.amp_shift - shift) ? r : b)).amp_shift
    : ANCHOR_PERIOD_RUNGS.reduce((b, r) => (Math.abs(r.period_shift - shift) < Math.abs(b.period_shift - shift) ? r : b)).period_shift;
  return editPresetCommand(library, id, `Preset ${id} channel ${index} ${field}`, (p) => {""")
open(p,'w').write(s)
PY
show "$PROV" "if (!onLadder) shift"
node_run
restore "$PROV"

echo
echo "════ P2 — a new channel is born on 0 ════"
echo "     (0 is a REAL world Y, above the screen top, and the most invasive state"
echo "      a channel can have — a control that seeds it authors that by default)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""export function newAnchorWorldY(): number {
  return Math.round((EFFECTS_FIRE_LINE_MIN + EFFECTS_FIRE_LINE_MAX) / 2);
}""","""export function newAnchorWorldY(): number {
  return 0;
}""")
open(p,'w').write(s)
PY
show "$PROV" "return 0;"
node_run
restore "$PROV"

echo
echo "════ P3 — the state command PADS the array to MAX_PATCH ════"
echo "     (padding turns 'the section keeps its hand-authored channel' into"
echo "      'the editor authored something here', which is a different document)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""    else if (typeof a[index] !== 'number') a[index] = newAnchorWorldY();
    pruneEmptyAnchorKey(p, 'patch_world_ys');""",
"""    else if (typeof a[index] !== 'number') a[index] = newAnchorWorldY();
    while (a.length > 0 && a.length < EFFECTS_PRESET_MAX_PATCH) a.push(null);
    pruneEmptyAnchorKey(p, 'patch_world_ys');""")
open(p,'w').write(s)
PY
show "$PROV" "while (a.length > 0"
node_run
restore "$PROV"

echo
echo "════ P4 — the seed goes out through the drift.rate habit (x256) ════"
echo "     (224 x 256 = 57344 validates CLEAN against the u16 range, so no schema"
echo "      can catch this: the band simply never appears)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""    if (typeof a[index] !== 'number') return;
    a[index] = worldY;""",
"""    if (typeof a[index] !== 'number') return;
    a[index] = worldY * 256;""")
open(p,'w').write(s)
PY
show "$PROV" "worldY \* 256"
node_run
restore "$PROV"

echo
echo "════ P5 — the no-seed advisory reads 0 as 'no seed' ════"
echo "     (the same 0-is-real defect one layer up: the advisory would fire on a"
echo "      channel that is correctly authored at world Y 0)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""  if (anchorMotionState(preset, index) !== 'sweep') return null;
  if (anchorSeedState(preset, index) === 'authored') return null;""",
"""  if (anchorMotionState(preset, index) !== 'sweep') return null;
  if (anchorSeedValue(preset, index)) return null;""")
open(p,'w').write(s)
PY
show "$PROV" "if (anchorSeedValue(preset, index)) return null;"
node_run
restore "$PROV"

echo
echo "════ P6 — the extend refusal FILLS the gap instead of refusing it ════"
echo "     (the only value it could invent is null, which is not 'unspelled' —"
echo "      it is 'no motion', a different document the author did not author)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""  const len = Array.isArray(arr) ? arr.length : 0;
  if (index <= len) return null;""",
"""  const len = Array.isArray(arr) ? arr.length : 0;
  if (index <= len || true) return null;""")
s=s.replace("""    if (index < 0 || index > a.length || index >= EFFECTS_PRESET_MAX_PATCH) return;
    p.patch_world_ys = a;""",
"""    if (index < 0 || index >= EFFECTS_PRESET_MAX_PATCH) return;
    while (a.length < index) a.push(null);
    p.patch_world_ys = a;""")
open(p,'w').write(s)
PY
show "$PROV" "index <= len || true"
node_run
restore "$PROV"

echo
echo "════ P7 — the section is removed from the sub-tab table ════"
echo "     (a section a panel renders and no tab declares is a control nobody can"
echo "      reach; the gate that catches it is a DIFFERENT file's)"
python3 - <<'PY'
p='src/renderer/providers/effects-sub-tabs.ts'
s=open(p).read()
s=s.replace("""      'aeon.effects.preset.channels', 'aeon.effects.preset.anchors'],""",
"""      'aeon.effects.preset.channels'],""")
open(p,'w').write(s)
PY
show src/renderer/providers/effects-sub-tabs.ts "aeon.effects.preset.channels'\]"
echo "    runner: npx vitest run src/renderer/providers/__tests__/effects-sub-tabs.test.ts"
npx vitest run src/renderer/providers/__tests__/effects-sub-tabs.test.ts --reporter=dot 2>&1 \
  | grep -E "Tests |Test Files |FAIL " | sed 's/^/    /'
restore src/renderer/providers/effects-sub-tabs.ts

fi

# ═══════════════════════════════════════════════════════════════════════════
# HARNESS POISONS — the four claims no node row can see
# ═══════════════════════════════════════════════════════════════════════════

if [ "$WHICH" = "harness" ] || [ "$WHICH" = "all" ]; then

echo
echo "════ H1 — the seed goes out x256, MEASURED ON SCREEN ════"
echo "     (the same mutation as P4; this is the row that types a number into the"
echo "      real field and reads the DOCUMENT back)"
python3 - <<'PY'
p='src/renderer/providers/effects-preset.ts'
s=open(p).read()
s=s.replace("""    if (typeof a[index] !== 'number') return;
    a[index] = worldY;""",
"""    if (typeof a[index] !== 'number') return;
    a[index] = worldY * 256;""")
open(p,'w').write(s)
PY
show "$PROV" "worldY \* 256"
harness_run
restore "$PROV"

echo
echo "════ H2 — THE CLOCK SPENDS THE MAP'S IDLE PROPERTY ════"
echo "     (the mistake row 95 names by name: a clock that repaints the map on a"
echo "      timer. The loop is pointed at #map-canvas — one line, still compiles,"
echo "      and the preview still animates, which is what makes it dangerous)"
python3 - <<'PY'
p='src/renderer/components/effects/AnchorSweepPreview.tsx'
s=open(p).read()
s=s.replace("""      cv.__anchorFrames = (cv.__anchorFrames ?? 0) + 1;
      if (!stopped) raf = requestAnimationFrame(draw);""",
"""      cv.__anchorFrames = (cv.__anchorFrames ?? 0) + 1;
      const mapcv = document.getElementById('map-canvas') as HTMLCanvasElement | null;
      if (mapcv) mapcv.width = mapcv.width;
      if (!stopped) raf = requestAnimationFrame(draw);""")
open(p,'w').write(s)
PY
show "$PREV" "map-canvas"
harness_run
restore "$PREV"

echo
echo "════ H3 — the clock never starts (the loop is torn down on the first frame) ════"
echo "     (proves [6c]'s zero is not green on a build where nothing ticks — the"
echo "      leg of that row most at risk of being vacuous)"
python3 - <<'PY'
p='src/renderer/components/effects/AnchorSweepPreview.tsx'
s=open(p).read()
s=s.replace("""      cv.__anchorFrames = (cv.__anchorFrames ?? 0) + 1;
      if (!stopped) raf = requestAnimationFrame(draw);""",
"""      cv.__anchorFrames = (cv.__anchorFrames ?? 0) + 1;
      stopped = true;
      if (!stopped) raf = requestAnimationFrame(draw);""")
open(p,'w').write(s)
PY
show "$PREV" "      stopped = true;"
harness_run
restore "$PREV"

fi

echo
echo "════ done. tree: $(git status --porcelain | wc -l) dirty file(s); HEAD $(git rev-parse HEAD) ════"
[ "$(git rev-parse HEAD)" = "$BASELINE" ] || { echo "⚠ HEAD MOVED DURING THE RUN"; exit 2; }
