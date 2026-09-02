#!/usr/bin/env bash
# RED-FIRST FOR EW-SHAPE-STRIP — every gate this parcel added, shown failing on a
# tree where the property does not hold, from a COMMITTED baseline.
#
# Each poison prints:
#   1. the mutation, ON DISK, as a real diff of the working tree
#   2. a FRESH vitest transform cache, file count before (0) and after (n) — the
#      cache is keyed on mtime+size and a warm one can serve the old module
#   3. the runner, NAMED, going red, with the rows it names
#   4. `git checkout --` restoring the baseline, and the runner going green again
#
# ⚠ A POISON THAT COMES BACK GREEN MEANS SUSPECT THE MATCHER, NOT THE GUARD.
#
# RUN (from the aurora worktree):
#   AEON_DIR=<fresh writable aeon extract> \
#   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
#   AURORA_BUILT_TREE=$PWD \
#   bash scratchpad/poisons-effects-section-strip.sh
#
# Poisons 1 and 2 need the app built and driven under CDP, so they rebuild with
# VITE_AURORA_DEBUG=1 between mutation and run. Poison 3 is vitest only.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT=$PWD
PICKER=src/renderer/components/effects/SectionPicker.tsx
WIRING=src/core/formats/effects/section-wiring.ts
PORT_BASE=${PORT_BASE:-9490}
DISP_BASE=${DISP_BASE:-90}

if [ -n "$(git status --porcelain -- "$PICKER" "$WIRING")" ]; then
  echo "REFUSING: $PICKER / $WIRING are already dirty — a poison must start from a"
  echo "committed baseline or 'restored' means nothing. Commit or stash first."
  exit 2
fi
echo "baseline commit: $(git rev-parse --short HEAD)  ($(git status --porcelain -- "$PICKER" "$WIRING" | wc -l) dirty file(s) in the subjects)"

# A FRESH VITE TRANSFORM CACHE PER POISON. Vitest 4 removed `--cache.dir`;
# `cacheDir` on the vite config is where the setting lives now, and
# `vitest.poison.config.ts` at the repo root is the repo's own config with that
# one field pointed at `$POISON_CACHE_DIR`. Reused from EFFECTS-W1's poisons
# rather than re-invented, so the two runs are comparable.
SCRATCH=${TMPDIR:-/tmp}/effects-strip-poisons
mkdir -p "$SCRATCH"
vt() { npx vitest run --config vitest.poison.config.ts "$1" 2>&1; }
cachefiles() { find "${POISON_CACHE_DIR:-/nonexistent}" -type f 2>/dev/null | wc -l; }
fresh_cache() {
  POISON_CACHE_DIR=$(mktemp -d "$SCRATCH/vcache.XXXXXX")
  export POISON_CACHE_DIR
  echo "    fresh vitest cache: $POISON_CACHE_DIR   files before: $(cachefiles)"
}
cache_after() { echo "    files in cache after: $(cachefiles)"; }

rebuild() { VITE_AURORA_DEBUG=1 npx electron-vite build >/tmp/poison-build.log 2>&1 && echo "    rebuilt (rc=0)" || { echo "    BUILD FAILED"; tail -5 /tmp/poison-build.log; }; }

# ⚠ `HARNESS ABORTED` IS IN THE FILTER. A poison that removes an element can make
# a LATER row throw rather than fail, and the harness then aborts with a line
# saying the rows below never ran. Filtering that out would read as a silent
# truncation instead of the refusal it is.
run_strip() { PORT=$1 DISPLAY_NUM=$2 node scratchpad/effects-section-strip-harness.mjs 2>&1 \
  | grep -E '^(PASS|FAIL)|════|HARNESS ABORTED|rows had run'; }

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 1 — the strip stops being sticky (the whole parcel's property)"
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/position: 'sticky', top: 0, zIndex: 3,/zIndex: 3,/" "$PICKER"
git --no-pager diff --stat -- "$PICKER"
git --no-pager diff -U1 -- "$PICKER" | grep -E '^[-+][^-+]'
rebuild
echo "  RUNNER: node scratchpad/effects-section-strip-harness.mjs"
run_strip $((PORT_BASE)) $((DISP_BASE))
git checkout -- "$PICKER"
echo "  RESTORED: $(git status --porcelain -- "$PICKER" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 2 — the two conditions collapse back into one row"
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e 's{<ConditionRow n=\{2\}.*?/>}{}s' "$PICKER"
git --no-pager diff --stat -- "$PICKER"
git --no-pager diff -U1 -- "$PICKER" | grep -E '^[-+][^-+]'
rebuild
echo "  RUNNER: node scratchpad/effects-section-strip-harness.mjs"
run_strip $((PORT_BASE+1)) $((DISP_BASE+1))
git checkout -- "$PICKER"
echo "  RESTORED: $(git status --porcelain -- "$PICKER" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 3 — the act-wide own-preset set goes back through sectionRasterState"
echo "  (the self-contradiction: '✓ own preset X' beside 'own preset none')"
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/if \(sectionWiringConditions\(w, i, chooserFn\)\.ownPreset\.verdict === 'yes'\) out\.push\(i\);/if (sectionRasterState(w, i) === 'wired' || sectionRasterState(w, i) === 'unthreaded') out.push(i);/" "$WIRING"
git --no-pager diff -U1 -- "$WIRING" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts src/core/formats/effects/__tests__/section-wiring.test.ts"
vt src/core/formats/effects/__tests__/section-wiring.test.ts | grep -E '×|Tests +[0-9]|AssertionError' | head -12
cache_after
git checkout -- "$WIRING"
echo "  RESTORED: $(git status --porcelain -- "$WIRING" | wc -l) dirty file(s)"
fresh_cache
vt src/core/formats/effects/__tests__/section-wiring.test.ts | grep -E 'Tests +[0-9]'
cache_after

echo
rebuild
echo "baseline rebuilt; working tree: $(git status --porcelain -- "$PICKER" "$WIRING" | wc -l) dirty subject file(s)"
