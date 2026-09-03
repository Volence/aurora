#!/usr/bin/env bash
# RED-FIRST FOR EW-SHAPE-PREVIEW — every claim this parcel makes, shown failing
# on a tree where the property does not hold, from a COMMITTED baseline.
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
# THE FOUR CLAIMS, ONE POISON EACH — they are separable, and a single poison
# that reddened everything would not have shown that:
#
#   1  the SCOPE   — the preview belongs to the Effects facet and nowhere else
#   2  the DEFAULT — it is on, on the Parallax sub-tab, for a first-time author
#   3  the CHOICE  — an explicit answer beats the default, for ever
#   4  the MEMORY  — and survives the session, which is what makes 3 true
#                    tomorrow as well as this afternoon
#
# RUN (from the aurora worktree):
#   AEON_DIR=<fresh writable aeon extract> \
#   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
#   AURORA_BUILT_TREE=$PWD \
#   bash scratchpad/poisons-effects-preview-default.sh

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
RULE=src/renderer/providers/parallax-preview.ts
PREF=src/renderer/shell/preview-pref.ts
PORT_BASE=${PORT_BASE:-9486}
DISP_BASE=${DISP_BASE:-84}

if [ -n "$(git status --porcelain -- "$RULE" "$PREF")" ]; then
  echo "REFUSING: a subject file is already dirty — a poison must start from a"
  echo "committed baseline or 'restored' means nothing. Commit or stash first."
  exit 2
fi
echo "baseline commit: $(git rev-parse --short HEAD)"

SCRATCH=${TMPDIR:-/tmp}/effects-preview-default-poisons
mkdir -p "$SCRATCH"
NODEROW=src/renderer/providers/__tests__/parallax-preview.test.ts
vt() { npx vitest run --config vitest.poison.config.ts "$1" 2>&1; }
cachefiles() { find "${POISON_CACHE_DIR:-/nonexistent}" -type f 2>/dev/null | wc -l; }
fresh_cache() {
  POISON_CACHE_DIR=$(mktemp -d "$SCRATCH/vcache.XXXXXX")
  export POISON_CACHE_DIR
  echo "    fresh vitest cache: $POISON_CACHE_DIR   files before: $(cachefiles)"
}
cache_after() { echo "    files in cache after: $(cachefiles)"; }
rebuild() { VITE_AURORA_DEBUG=1 npx electron-vite build >/tmp/preview-poison-build.log 2>&1 \
  && echo "    rebuilt (rc=0)" || { echo "    BUILD FAILED"; tail -5 /tmp/preview-poison-build.log; }; }

# ⚠ `HARNESS ABORTED` IS IN THE FILTER. Poison 2 stops the composite drawing at
# all, and [2b] is an abort gate — the run stops there and says so. Filtering
# that line out would read as a silent truncation instead of the refusal it is.
run_h() { PORT=$1 DISPLAY_NUM=$2 node scratchpad/effects-preview-default-harness.mjs 2>&1 \
  | grep -E '^(PASS|FAIL)|════|HARNESS ABORTED|rows had run'; }

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 1 — THE SCOPE. The facet gate is deleted, so the preview's flag is"
echo "  global again: it reads ON in Layout, Objects, Collision, Rings, Palette"
echo "  and Art. This is the defect the brief named as WORSE than the one being"
echo "  fixed, and it is the reason the previous parcel stopped."
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/  if \(facet !== EFFECTS_FACET\) return false;\n//" "$RULE"
git --no-pager diff -U1 -- "$RULE" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts $NODEROW"
vt "$NODEROW" | grep -E '×|Tests +[0-9]' | head -12
cache_after
rebuild
echo "  RUNNER: node scratchpad/effects-preview-default-harness.mjs"
run_h $((PORT_BASE)) $((DISP_BASE))
git checkout -- "$RULE"
echo "  RESTORED: $(git status --porcelain -- "$RULE" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 2 — THE DEFAULT. It goes back to off-until-asked-for: an author who"
echo "  has never operated the switch gets nothing, which is the world the cold"
echo "  reader met (he found the preview ten minutes after he needed it)."
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/  return subTab === PREVIEW_DEFAULT_TAB;\n\}/  return false;\n}/" "$RULE"
git --no-pager diff -U1 -- "$RULE" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts $NODEROW"
vt "$NODEROW" | grep -E '×|Tests +[0-9]' | head -12
cache_after
rebuild
echo "  RUNNER: node scratchpad/effects-preview-default-harness.mjs"
run_h $((PORT_BASE+1)) $((DISP_BASE+1))
git checkout -- "$RULE"
echo "  RESTORED: $(git status --porcelain -- "$RULE" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 3 — THE CHOICE. The recorded answer is ignored and the default"
echo "  speaks every time. THIS IS THE DEFECT THE BRIEF WARNED ABOUT: the author"
echo "  turns the preview off, leaves the tab, comes back, and it is on again."
echo "  It is the one users describe as \"it keeps doing that\"."
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/  if \(choice !== null\) return choice;\n//" "$RULE"
git --no-pager diff -U1 -- "$RULE" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts $NODEROW"
vt "$NODEROW" | grep -E '×|Tests +[0-9]' | head -12
cache_after
rebuild
echo "  RUNNER: node scratchpad/effects-preview-default-harness.mjs"
run_h $((PORT_BASE+2)) $((DISP_BASE+2))
git checkout -- "$RULE"
echo "  RESTORED: $(git status --porcelain -- "$RULE" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "POISON 4 — THE MEMORY. The choice is never written down, so it lives only"
echo "  for the session. Everything about this afternoon still passes; the row"
echo "  that survives a restart does not. This is the poison that discriminates"
echo "  the PERSISTENCE decision from the tri-state, and it is why [4d] exists"
echo "  as a separate row from [4c]."
echo "══════════════════════════════════════════════════════════════════════════"
perl -0pi -e "s/    if \(v === null\) localStorage\.removeItem\(KEY\);\n    else localStorage\.setItem\(KEY, v \? 'true' : 'false'\);\n/    \/* poisoned: the choice is never written down *\/\n/" "$PREF"
git --no-pager diff -U1 -- "$PREF" | grep -E '^[-+][^-+]'
fresh_cache
echo "  RUNNER: npx vitest run --config vitest.poison.config.ts $NODEROW"
vt "$NODEROW" | grep -E '×|Tests +[0-9]' | head -12
cache_after
rebuild
echo "  RUNNER: node scratchpad/effects-preview-default-harness.mjs"
run_h $((PORT_BASE+3)) $((DISP_BASE+3))
git checkout -- "$PREF"
echo "  RESTORED: $(git status --porcelain -- "$PREF" | wc -l) dirty file(s)"

echo
echo "══════════════════════════════════════════════════════════════════════════"
echo "PLANT — the composite is read through a report key nothing publishes."
echo "  [2b] must catch it and the run must ABORT rather than pass the rows"
echo "  below it."
echo "══════════════════════════════════════════════════════════════════════════"
rebuild
PORT=$((PORT_BASE+4)) DISPLAY_NUM=$((DISP_BASE+4)) PLANT=rot-report \
  node scratchpad/effects-preview-default-harness.mjs 2>&1 \
  | grep -E '^(PASS|FAIL)|════|HARNESS ABORTED|rows had run'

echo
echo "baseline rebuilt; working tree: $(git status --porcelain -- "$RULE" "$PREF" | wc -l) dirty subject file(s)"
