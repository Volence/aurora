#!/usr/bin/env bash
# RED-FIRST FOR EW-SHAPE-TABS — every gate this parcel added, shown failing on a
# tree where the property does not hold, from a COMMITTED baseline.
#
# Each poison prints:
#   1. the mutation, ON DISK, as a real diff of the working tree
#   2. the runner, NAMED, going red, with the rows it names
#   3. `git checkout --` restoring the baseline, and the count of dirty files
#
# ⚠ A POISON THAT COMES BACK GREEN MEANS SUSPECT THE MATCHER, NOT THE GUARD.
#   Every mutation below is printed as a diff for exactly that reason: a perl
#   substitution that matched nothing produces a clean tree and a green run, and
#   the two are indistinguishable in a summary line.
#
# RUN (from the aurora worktree):
#   AEON_DIR=<fresh writable aeon extract> \
#   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
#   AURORA_BUILT_TREE=$PWD \
#   bash scratchpad/poisons-effects-sub-tabs.sh
#
# Poisons 1-3 need the app built and driven under CDP, so they rebuild with
# VITE_AURORA_DEBUG=1 between mutation and run. Poison 2 also runs the node row
# that covers the same seam, on a FRESH vitest transform cache.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
FACET=src/renderer/workspace/facets/effects-facet.tsx
TABS=src/renderer/providers/effects-sub-tabs.ts
PANEL=src/renderer/components/effects/EffectsScenePanel.tsx
PORT_BASE=${PORT_BASE:-9496}
DISP_BASE=${DISP_BASE:-88}

if [ -n "$(git status --porcelain -- "$FACET" "$TABS" "$PANEL")" ]; then
  echo "REFUSING: a subject file is already dirty — a poison must start from a"
  echo "committed baseline or 'restored' means nothing. Commit or stash first."
  exit 2
fi
echo "baseline commit: $(git rev-parse --short HEAD)"

SCRATCH=${TMPDIR:-/tmp}/effects-sub-tabs-poisons
mkdir -p "$SCRATCH"
vt() { npx vitest run --config vitest.poison.config.ts "$1" 2>&1; }
cachefiles() { find "${POISON_CACHE_DIR:-/nonexistent}" -type f 2>/dev/null | wc -l; }
fresh_cache() {
  POISON_CACHE_DIR=$(mktemp -d "$SCRATCH/vcache.XXXXXX")
  export POISON_CACHE_DIR
  echo "    fresh vitest cache: $POISON_CACHE_DIR   files before: $(cachefiles)"
}
cache_after() { echo "    files in cache after: $(cachefiles)"; }
rebuild() { VITE_AURORA_DEBUG=1 npx electron-vite build >/tmp/subtab-poison-build.log 2>&1 \
  && echo "    rebuilt (rc=0)" || { echo "    BUILD FAILED"; tail -5 /tmp/subtab-poison-build.log; }; }

# ⚠ `HARNESS ABORTED` IS IN THE FILTER. A poison that removes an element can make
# a LATER row throw rather than fail, and the harness then aborts with a line
# saying the rows below never ran. Filtering that out would read as a silent
# truncation instead of the refusal it is.
run_tabs() { PORT=$1 DISPLAY_NUM=$2 node scratchpad/effects-sub-tabs-harness.mjs 2>&1 \
  | grep -E '^(PASS|FAIL)|════|HARNESS ABORTED|rows had run'; }

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 1 — every job shows the SAME panel (the tab bar becomes decoration)"
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/  if \(tab === 'colour'\) \{/  if (false) {/" "$FACET"
perl -0pi -e "s/  if \(tab === 'tileAnim'\) \{/  if (false) {/" "$FACET"
git --no-pager diff -U1 -- "$FACET" | grep -E '^[-+][^-+]'
rebuild
echo "  RUNNER: node scratchpad/effects-sub-tabs-harness.mjs"
run_tabs $((PORT_BASE)) $((DISP_BASE))
git checkout -- "$FACET"
echo "  RESTORED: $(git status --porcelain -- "$FACET" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 2 — the reveal stops crossing the tab boundary (a bare revealPanel)"
echo "  the seam: the verb is on the toolbar, the section is two tabs away"
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/  if \(tab !== null\) useEditorStore\.getState\(\)\.setEffectsSubTab\(tab\);/  \/* poisoned: the tab switch is gone *\//" "$TABS"
git --no-pager diff -U1 -- "$TABS" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts src/renderer/providers/__tests__/effects-sub-tabs.test.ts"
vt src/renderer/providers/__tests__/effects-sub-tabs.test.ts | grep -E '×|Tests +[0-9]|AssertionError' | head -12
cache_after
rebuild
echo "  RUNNER: node scratchpad/effects-sub-tabs-harness.mjs"
run_tabs $((PORT_BASE+1)) $((DISP_BASE+1))
git checkout -- "$TABS"
echo "  RESTORED: $(git status --porcelain -- "$TABS" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 3 — the scene form arrives OPEN again, and the layers list goes"
echo "  straight back onto its floor with the column scrolling under it"
echo "══════════════════════════════════════════════════════════════════════════"
# The one standalone `defaultCollapsed` line in this file (the other hit is
# prose inside the docblock above it, which this pattern cannot match).
perl -0pi -e "s/\n          defaultCollapsed\n/\n/" "$PANEL"
git --no-pager diff -U1 -- "$PANEL" | grep -E '^[-+][^-+]'
rebuild
echo "  RUNNER: node scratchpad/effects-sub-tabs-harness.mjs"
run_tabs $((PORT_BASE+2)) $((DISP_BASE+2))
git checkout -- "$PANEL"
echo "  RESTORED: $(git status --porcelain -- "$PANEL" | wc -l) dirty file(s)"

echo
rebuild
echo "baseline rebuilt; working tree: $(git status --porcelain -- "$FACET" "$TABS" "$PANEL" | wc -l) dirty subject file(s)"
