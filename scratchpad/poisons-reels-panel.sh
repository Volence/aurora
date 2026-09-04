#!/usr/bin/env bash
# RED-FIRST FOR EW-REELS-PANEL — every gate, with its mutation, its run, and its
# restore.
#
# ═══ WHAT THIS FILE IS FOR ═══
#
# `effects-reels-panel.test.ts` is 36 green rows. Green rows are worth exactly
# what their failure state is worth, and this repo has shipped rows whose
# failure state and success state emitted the same artifact. So each poison
# below names ONE property, breaks it on disk at a COMMITTED tip, QUOTES THE
# MUTATED LINE BACK (an unapplied mutation and a correct baseline both print
# `ok`), runs, and restores with `git checkout HEAD -- <path>` — never
# `git checkout --` over a dirty tree.
#
# ⚠ IT REFUSES TO RUN ON A DIRTY TREE, because the restore is a checkout: a
# poison run over uncommitted work would delete it.
#
# ⚠ IT RUNS ONE TEST FILE, DELIBERATELY. Several of these mutations take other
# suites with them (poison I edits the vendored schema, which
# `effects-schema-drift` hashes). That is correct behaviour of those gates and
# not what is being measured here; the counts below are this file's rows.
#
# RUN:  bash scratchpad/poisons-reels-panel.sh
#       POISON=F bash scratchpad/poisons-reels-panel.sh   # just one

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

TEST=test/formats/effects-reels-panel.test.ts
UI=src/core/formats/effects/scene-ui.ts
PROV=src/renderer/providers/effects-aeon.ts
PANEL=src/renderer/components/effects/EffectsScenePanel.tsx
SCHEMA=src/core/formats/effects/aurora-effects-scene.schema.json

if [ -n "$(git status --porcelain)" ]; then
  echo "REFUSING: the tree is dirty. The restore is 'git checkout HEAD -- <path>',"
  echo "which would destroy uncommitted work. Commit first."
  git status --short
  exit 2
fi

echo "=== poisons-reels-panel ==="
echo "    branch : $(git branch --show-current)"
echo "    tip    : $(git rev-parse --short HEAD)"
echo "    uptime : $(uptime -p) / $(date -u +%FT%TZ)"
echo

# Apply one exact-string substitution and PROVE it landed, or abort.
apply() {  # apply <file> <old> <new>
  python3 - "$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
if s.count(old) != 1:
    print(f"MUTATION NOT APPLIED: {path} holds {s.count(old)} copies of the anchor", file=sys.stderr)
    sys.exit(3)
open(path, 'w').write(s.replace(old, new))
PY
}

run_poison() {  # run_poison <id> <property> <file> <marker>
  local id="$1" prop="$2" file="$3" marker="$4"
  echo "──────────────────────────────────────────────────────────────────"
  echo "POISON $id — $prop"
  echo "  file: $file"
  echo "  diff: $(git diff --stat -- "$file" | tail -1)"
  echo "  mutated line(s) on disk:"
  grep -n -- "$marker" "$file" | sed 's/^/    /' | head -4
  if [ -z "$(git diff --name-only -- "$file")" ]; then
    echo "  ⚠ NOTHING CHANGED ON DISK — this run would be a correct baseline, not a poison."
    return
  fi
  local out
  out=$(npx vitest run "$TEST" 2>&1)
  echo "$out" | grep -E "^ (✓|❯|×)|Tests +[0-9]|Test Files +[0-9]" | sed 's/^/    /' | tail -6
  echo "  RED ROWS:"
  echo "$out" | grep -E "^ FAIL |^ *× " | sed 's/^/    /' | head -12
  echo "$out" | grep -E "Failed to collect|failed to load" | sed 's/^/    /' | head -3
  git checkout HEAD -- "$file"
}

only="${POISON:-}"
want() { [ -z "$only" ] || [ "$only" = "$1" ]; }

# ── A. the write path applies drift's ×256 ────────────────────────────────
# PROPERTY: the reels write is the identity. This is hazard 1 authored on
# purpose — the exact line a panel copied from the drift row would contain.
if want A; then
  apply "$PROV" '    scene.reels.rates[index] = rate;' \
                '    scene.reels.rates[index] = rate * 256; // POISON A' \
    && run_poison A "the write path is the identity" "$PROV" "POISON A"
fi

# ── B. the seed is one value repeated ─────────────────────────────────────
# PROPERTY: REEL_RATE_SEED's own interlock is live. Expected LOUD — the module
# throws at load and the file fails to COLLECT, which is the designed failure
# for a derivation that cannot be satisfied.
if want B; then
  apply "$PROV" '(_, i) => i + 1);' \
                '() => 1); // POISON B' \
    && run_poison B "the seed is pairwise distinct" "$PROV" "POISON B"
fi

# ── C. the model sorts the rates ──────────────────────────────────────────
# PROPERTY: screen order is array order. THE hazard-3 poison.
if want C; then
  apply "$PROV" '  return scene.reels === undefined ? REEL_RATE_SEED : scene.reels.rates;' \
                '  return scene.reels === undefined ? REEL_RATE_SEED : [...scene.reels.rates].sort((a, b) => a - b); // POISON C' \
    && run_poison C "nothing on the reels path sorts" "$PROV" "POISON C"
fi

# ── D. the label is an index, not the screen span ─────────────────────────
# PROPERTY: the label column carries the pixels, so a reordered array is out of
# order ON SCREEN rather than only in the JSON.
if want D; then
  apply "$PANEL" '<Field label={reelStripLabel(i)}>' \
                 '<Field label={`Strip ${i}`}>{/* POISON D */}' \
    && run_poison D "the row label is the screen span" "$PANEL" "POISON D"
fi

# ── E. the DEBUG sentence is typed into the component ─────────────────────
# PROPERTY: the required disclosure is DERIVED and cannot drift from the fact.
if want E; then
  apply "$PANEL" '⚠ {REELS_ROW.debug.short}' \
                 '⚠ a scene saved with reels shows NOTHING in a release build{/* POISON E */}' \
    && run_poison E "the DEBUG note is extracted, not typed" "$PANEL" "POISON E"
fi

# ── F. the box's refusal asks about the VALUE, not the array ──────────────
# ⚠ THE LOAD-BEARING ONE. `uniqueItems` is a property of the array, so a control
# that handed `reelRateRefusal` to NumberField's `refuse` looks right, reads
# right, and authors a document the codec refuses at load.
if want F; then
  apply "$PROV" '  next[index] = rate;
  return reelRatesRefusal(next);' \
                '  next[index] = rate;
  return reelRateRefusal(rate); // POISON F' \
    && run_poison F "the refusal sees the whole array (uniqueItems)" "$PROV" "POISON F"
fi

# ── G. off writes "none" instead of deleting the key ──────────────────────
# PROPERTY: absent is absent. `reels` has no `"none"` arm, unlike its four
# neighbours — which is exactly why this is the mistake available.
if want G; then
  apply "$PROV" '    delete scene.reels;' \
                '    (scene as unknown as Record<string, unknown>).reels = "none"; // POISON G' \
    && run_poison G "off deletes the key and never writes \"none\"" "$PROV" "POISON G"
fi

# ── H. the spinner is bounded by the GUIDANCE ─────────────────────────────
# PROPERTY: "that is UI guidance, never a refusal". A control bounded by the
# guidance refuses a legal 100 for ever.
if want H; then
  apply "$PANEL" '                            min={EFFECTS_REEL_RATE_BOUNDS.min}
                            max={EFFECTS_REEL_RATE_BOUNDS.max}' \
                 '                            min={EFFECTS_REEL_RATE_GUIDANCE.min}
                            max={EFFECTS_REEL_RATE_GUIDANCE.max}{/* POISON H */}' \
    && run_poison H "the spinner range is the SCHEMA's, not the guidance" "$PANEL" "POISON H"
fi

# ── I. the schema drops uniqueItems ───────────────────────────────────────
# PROPERTY: the census's CONCLUSION is measured against the committed schema and
# not argued in a comment. Without `uniqueItems` the all-zero document really is
# legal — which is the codec packet's sentence coming true.
if want I; then
  apply "$SCHEMA" '          "uniqueItems": true,' \
                  '          "uniqueItems": false,' \
    && run_poison I "uniqueItems is what closes the all-zero case" "$SCHEMA" '"uniqueItems": false'
fi

# ── J. the schema widens the rate bound ───────────────────────────────────
# PROPERTY: EFFECTS_REEL_X256_FULLY_CAUGHT tracks the CONTRACT. A wider bound
# lets every ×256 through, and the census must say so rather than keeping a
# comment that claims a defence the schema no longer provides.
if want J; then
  apply "$SCHEMA" '            "minimum": -128,
            "maximum": 127' \
                  '            "minimum": -128,
            "maximum": 32767' \
    && run_poison J "the census is a function of the bound" "$SCHEMA" '"maximum": 32767'
fi

echo "──────────────────────────────────────────────────────────────────"
echo "tree after restore:"
git status --short || true
echo "=== POISONS_END $(date -u +%FT%TZ) ==="
