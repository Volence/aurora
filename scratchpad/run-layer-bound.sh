#!/bin/sh
# THE NAMED RUNNER for the layer-guide bound parcel (2026-08-28).
#
# Gate (b): a check nobody runs is not a gate. This is the one command that
# executes everything the parcel added, in the order that makes a failure
# attributable, and it REBUILDS FIRST — the app serves dist/, not src/, so a run
# against a stale bundle re-verifies whatever was last built rather than what is
# on disk. That has burned this repo before.
#
# Usage:  ./scratchpad/run-layer-bound.sh
#         SKIP_BUILD=1 ./scratchpad/run-layer-bound.sh    (already built)
#         RUNS=3 ./scratchpad/run-layer-bound.sh          (repeat the harness)
#
# ⚠ NEVER read two rows of one run out of two different runs. Each harness run
# writes its OWN log; compare a run against itself, never a row from run 1
# against a row from run 2.
#
# ⚠ NO EMULATOR anywhere in here.
set -e
cd "$(dirname "$0")/.."

RUNS="${RUNS:-1}"

echo "=== 1/3  typecheck ==="
npx tsc --noEmit

echo "=== 2/3  node suite (necessary, NOT sufficient — it cannot see a canvas) ==="
# ⚠ NOT UNDER `set -e`, AND NOT BECAUSE FAILURES ARE TOLERATED. A `set -e` abort
# here would stop the CDP harness from ever running, which is the half that can
# actually see this parcel's subject — so a single unrelated red would silently
# reduce the parcel's evidence to "we didn't look". Instead the suite's verdict
# is captured, printed LOUDLY, and carried to a non-zero exit at the very end.
# Nothing is swallowed: a red suite still fails this script.
SUITE_RC=0
npx vitest run 2>&1 | tee scratchpad/run-layer-bound-vitest.log || true
# `tee` makes $? the tee's, so read the suite's own verdict out of its output.
if grep -qE '^ *Tests +[0-9]+ failed' scratchpad/run-layer-bound-vitest.log; then
  SUITE_RC=1
  echo ""
  echo "!!! NODE SUITE HAS FAILURES — named here, never summarised away:"
  grep -E '^ (FAIL|×)' scratchpad/run-layer-bound-vitest.log || true
  echo "!!! KNOWN PRE-EXISTING AS OF 2026-08-28, and verified so by stashing this"
  echo "!!! branch's src/ and re-running on the clean tree:"
  echo "!!!   test/formats/effects-scene-curve-vsplit.test.ts > ojz_act1_depth.json round-trip"
  echo "!!! It reads a LOCALLY-MODIFIED, UNCOMMITTED aeon fixture"
  echo "!!!   aeon/games/sonic4/data/editor/effects/ojz_act1_depth.json"
  echo "!!! whose vsplit has moved off the layer the test picks, so"
  echo "!!! setLayerFieldCommand returns null and history.ts:99 dereferences it."
  echo "!!! Any failure OTHER than that one is this parcel's problem — check the list."
  echo ""
fi

if [ -z "$SKIP_BUILD" ]; then
  echo "=== 3/3  debug build (the app serves dist/, not src/) ==="
  VITE_AURORA_DEBUG=1 npx electron-vite build
fi

i=1
while [ "$i" -le "$RUNS" ]; do
  log="scratchpad/run-layer-bound-$i.log"
  echo "=== CDP harness, run $i/$RUNS -> $log ==="
  # `set -e` is deliberately not allowed to swallow the harness's exit code:
  # a failing run must be reported with its log, not silently skipped.
  if node scratchpad/layer-bound-harness.mjs > "$log" 2>&1; then
    tail -n 1 "$log"
  else
    echo "HARNESS FAILED (run $i) — full log at $log"
    grep -E '^(FAIL|HARNESS)' "$log" || true
    tail -n 20 "$log"
    exit 1
  fi
  i=$((i + 1))
done

if [ "$SUITE_RC" -ne 0 ]; then
  echo "=== CDP harness green, NODE SUITE RED (see the block above) ==="
  exit 1
fi
echo "=== all green ==="
