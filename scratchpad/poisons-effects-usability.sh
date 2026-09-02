#!/usr/bin/env bash
# RED-FIRST PROOFS FOR EFFECTS-W1 — every gate this parcel added, one script.
#
# ═══ WHAT A PROOF HERE HAS TO SHOW ═══
#
#   1. GREEN on the COMMITTED baseline, with a FRESH vite transform cache whose
#      file count is printed before and after — so a stale transform cannot be
#      what decided the verdict.
#   2. The mutation APPLIED ON DISK, shown as a diff and as a grep.
#   3. The gate RED, naming the thing.
#   4. The baseline RESTORED FROM THE COMMIT (`git checkout --`), not from
#      memory, and green again.
#
# ⚠ EACH POISON IS RUN AGAINST BOTH KINDS OF INSTRUMENT WHERE BOTH EXIST, and
# the difference is reported rather than assumed. A vitest row reads SOURCE; a
# CDP harness drives the built app. Poison 1's whole subject — a guard that
# looks present in source and stops nothing in a browser — is why.
#
# RUN:  bash scratchpad/poisons-effects-usability.sh
#       POISON=1|2|3 to run one.  Needs a built tree (VITE_AURORA_DEBUG=1) and
#       aeon reachable for the harness halves.
set -u
cd "$(dirname "$0")/.."
ROOT=$PWD
SCRATCH=${TMPDIR:-/tmp}/effects-w1-poisons
mkdir -p "$SCRATCH"
ONLY=${POISON:-}

banner() { printf '\n════════════════════════════════════════\n%s\n════════════════════════════════════════\n' "$1"; }

# A fresh vite transform cache per poison, via the tiny config beside this file's
# sibling at the repo root. Vitest 4 removed `--cache.dir`; `cacheDir` on the
# vite config is where that setting lives now.
vt() { npx vitest run --config vitest.poison.config.ts "$1" 2>&1; }
cachefiles() { find "${POISON_CACHE_DIR:-/nonexistent}" -type f 2>/dev/null | wc -l; }

freshcache() {
  POISON_CACHE_DIR=$(mktemp -d "$SCRATCH/vcache.XXXXXX")
  export POISON_CACHE_DIR
}

freshaeon() {
  AEONCOPY=$SCRATCH/aeon-poison
  rm -rf "$AEONCOPY"; mkdir -p "$AEONCOPY"
  if [[ -n "${AEON_TAR:-}" ]]; then
    tar -xf "$AEON_TAR" -C "$AEONCOPY"
  else
    git -C "${AEON_SRC:-../../../../aeon}" archive origin/master | tar -x -C "$AEONCOPY"
  fi
}

echo "BASELINE: commit $(git rev-parse --short HEAD) on branch $(git branch --show-current)"
echo "TREE:     $(git status --porcelain | wc -l) modified path(s) overall"

# ---------------------------------------------------------------------------
# POISON 1 — the two names collapse back into one word (defect 2)
# ---------------------------------------------------------------------------
if [[ -z "$ONLY" || "$ONLY" == 1 ]]; then
banner "POISON 1 — 'Add blank tile animation' -> 'Add blank band'"
TARGET=src/renderer/providers/band-verbs.ts
ROW=src/renderer/components/effects/__tests__/band-vocabulary.test.ts
freshcache
echo "  cache files before: $(cachefiles)"
vt "$ROW" | grep -E "Tests  "
echo "  cache files after:  $(cachefiles)"
sed -i "s/label: 'Add blank tile animation',/label: 'Add blank band',/" $TARGET
git --no-pager diff -- $TARGET | sed -n '5,16p'
echo "  grep on disk -> $(grep -n 'Add blank band' $TARGET)"
vt "$ROW" | grep -E "×|tile-animation string|Tests  "
git checkout -- $TARGET
echo "  restored; $(git status --porcelain -- $TARGET | wc -l) modified"
vt "$ROW" | grep -E "Tests  "
rm -rf "$POISON_CACHE_DIR"
fi

# ---------------------------------------------------------------------------
# POISON 2 — the `refuse` prop comes off the Top box (defect 5)
# ---------------------------------------------------------------------------
if [[ -z "$ONLY" || "$ONLY" == 2 ]]; then
banner "POISON 2 — the Top box forwards whatever is typed, as master did"
TARGET=src/renderer/components/effects/BandPresetPanel.tsx
ROW=src/renderer/components/effects/__tests__/authoring-refusals.test.ts
freshcache
freshaeon
echo "  cache files before: $(cachefiles)"
vt "$ROW" | grep -E "Tests  "
echo "  cache files after:  $(cachefiles)"
python3 - <<'PY'
p = "src/renderer/components/effects/BandPresetPanel.tsx"
s = open(p).read()
old = """          refuse={(n) => bandEdgeRefusal(band, presetId, index, 'top', n)}
          onRefusal={(r) => setEdgeRefusal({ ...edgeRefusal, top: r })}
"""
assert old in s, "the Top box no longer looks like the baseline"
open(p, "w").write(s.replace(old, "", 1))
PY
git --no-pager diff -- $TARGET | sed -n '5,18p'
vt "$ROW" | grep -E "×|does not call bandEdgeRefusal|Tests  "
VITE_AURORA_DEBUG=1 npx electron-vite build >/dev/null 2>&1
AEON_DIR="$AEONCOPY" PORT=9461 DISPLAY_NUM=91 node scratchpad/effects-refusal-harness.mjs 2>&1 \
  | grep -E "FAIL|════"
git checkout -- $TARGET
VITE_AURORA_DEBUG=1 npx electron-vite build >/dev/null 2>&1
echo "  restored; $(git status --porcelain -- $TARGET | wc -l) modified"
vt "$ROW" | grep -E "Tests  "
rm -rf "$POISON_CACHE_DIR" "$AEONCOPY"
fi

# ---------------------------------------------------------------------------
# POISON 3 — aeon's own windowing bug, reintroduced (defect 4)
# ---------------------------------------------------------------------------
if [[ -z "$ONLY" || "$ONLY" == 3 ]]; then
banner "POISON 3 — the descriptor parse windows to 800 chars (aeon's own mistake)"
TARGET=src/core/formats/effects/section-wiring.ts
ROW=src/core/formats/effects/__tests__/section-wiring.test.ts
freshcache
freshaeon
echo "  cache files before: $(cachefiles)"
vt "$ROW" | grep -E "Tests  "
echo "  cache files after:  $(cachefiles)"
python3 - <<'PY'
p = "src/core/formats/effects/section-wiring.ts"
s = open(p).read()
old = "    const m = /effects\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(chunks[i + 1] ?? '');"
new = "    const m = /effects\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)/.exec((chunks[i + 1] ?? '').slice(0, 800));"
assert old in s, "the parse no longer looks like the baseline"
open(p, "w").write(s.replace(old, new, 1))
PY
git --no-pager diff -- $TARGET | sed -n '5,16p'
vt "$ROW" | grep -E "×|Tests  "
VITE_AURORA_DEBUG=1 npx electron-vite build >/dev/null 2>&1
AEON_DIR="$AEONCOPY" PORT=9462 DISPLAY_NUM=90 node scratchpad/effects-section-picker-harness.mjs 2>&1 \
  | grep -E "FAIL|own preset|════"
git checkout -- $TARGET
VITE_AURORA_DEBUG=1 npx electron-vite build >/dev/null 2>&1
echo "  restored; $(git status --porcelain -- $TARGET | wc -l) modified"
vt "$ROW" | grep -E "Tests  "
rm -rf "$POISON_CACHE_DIR" "$AEONCOPY"
fi
