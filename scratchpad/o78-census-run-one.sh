#!/bin/bash
# O78-RESIDUAL-72 — measure ONE harness under the reproducing shape.
#
#   xvfb-run -a npm run harness:<name>
#
#   sh scratchpad/o78-census-run-one.sh <name> <logdir> <workdir> [timeout-secs]
#
# and record, for that one run:
#   MARK_OUTER_XAUTH  the OUTER wrapper's XAUTHORITY, read INSIDE the wrapper
#                     BEFORE the command runs
#   MARK_NPM_EXIT     the harness's own exit code
#   MARK_SURVIVES     whether the wrapper's own /tmp/xvfb-run.XXXXXX still
#                     exists AFTER the command returns and BEFORE the wrapper's
#                     own epilogue removes it legitimately.  ⚠ This MUST be
#                     stat'd from inside the wrapper: from outside it is always
#                     gone, because a healthy xvfb-run deletes its own tempdir.
#   MARK_OUTER_EXIT   what a sweep reads — the wrapper's exit after its
#                     epilogue.  The inner shell exits with npm's status, so
#                     this equals MARK_NPM_EXIT unless the epilogue broke.
#   MARK_REFUSED      whether `cleanup: X artifact REFUSED` named the inherited
#                     tempdir — the affirmative tell that the teardown reached
#                     the X reaper with the process tree still ALIVE.
#   MARK_LOADER       whether the census instrument was live; without it the
#                     tell is blind and the row is UNMEASURABLE, not a negative.
#
# NO EMULATOR is started from here. Harnesses that use one start their own
# headless oracle-aether on a private ORACLE_SOCKET; that is theirs, not ours.
set -u
NAME="${1:?harness name (without the harness: prefix)}"
LOGDIR="${2:?log directory}"
WORK="${3:?work directory for the per-run copies}"
TMO="${4:-300}"

cd "$(dirname "$0")/.." || exit 9
ROOT=$(pwd)
# The suite's 4-step precedence, in the lines a shell can carry: the explicit
# checkout variable, then EMPYREAN_SUITE_ROOT/<name>, then a derivation from
# this checkout's own git COMMON dir (never --show-toplevel, which answers with
# the worktree), then DIE naming what was looked for. No home literal anywhere.
# (empyrean contract/SUITE_PATHS.md)
_common=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
SUITE_ROOT=${EMPYREAN_SUITE_ROOT:-$([ -n "$_common" ] && dirname "$(dirname "$_common")")}
# The MAIN aurora checkout — the one that has node_modules. An agent worktree
# does not, which is the whole reason ELECTRON_BIN exists.
AURORA_MAIN=${AURORA_DIR:-$([ -n "$_common" ] && dirname "$_common")}
ELECTRON_BIN=${ELECTRON_BIN:-$AURORA_MAIN/node_modules/.bin/electron}
if [ ! -x "$ELECTRON_BIN" ]; then
  echo "o78-census: no electron binary at '$ELECTRON_BIN'. An agent worktree has no" >&2
  echo "  node_modules; set ELECTRON_BIN to the main checkout's binary, or AURORA_DIR" >&2
  echo "  to that checkout. A run that cannot launch is UNMEASURABLE, never a pass." >&2
  exit 2
fi

# THE SEED COPIES. ⚠ THEY MUST LIVE ON THE SAME FILESYSTEM AS THIS REPO.
# Measured 2026-09-04: with the copies on tmpfs several harnesses died in 3 s
# with `cp: cannot create hard link … Invalid cross-device link` — they
# materialise their OWN fixture into $AEON_DIR with `cp -al` out of
# scratchpad/fixtures/, and a cross-device target makes that impossible. That
# is a defect in the rig, not in the harness, and reading those rows as
# UNMEASURABLE would have hidden a third of the census behind my own mistake.
# The seeds also keep .git, because at least one harness runs `git status`
# inside the copy. Build them with, from the suite root:
#   rsync -a --exclude=.claude aeon/     $O78_SEEDS/aeon-seed/
#   rsync -a --exclude=.claude s1disasm/ $O78_SEEDS/s1-seed/
SEEDS=${O78_SEEDS:-${SUITE_ROOT:+$SUITE_ROOT/.o78-census}}
if [ -z "$SEEDS" ] || [ ! -d "$SEEDS/aeon-seed" ] || [ ! -d "$SEEDS/s1-seed" ]; then
  echo "o78-census: no seed copies under '${SEEDS:-<unresolved>}'. Set O78_SEEDS, or" >&2
  echo "  EMPYREAN_SUITE_ROOT so <root>/.o78-census resolves, and materialise" >&2
  echo "  aeon-seed/ and s1-seed/ there (see the comment above). A variable set to" >&2
  echo "  something absent is a hard error, not a skip." >&2
  exit 2
fi

OUT="$LOGDIR/$NAME.log"
mkdir -p "$LOGDIR" "$WORK"

# A fresh writable copy per run, never a peer's live tree. Several harnesses
# rewrite project files and REFUSE a reused copy by design
# (section-raster-select aborts on leftovers), so this is re-materialised every
# time rather than shared.
AC="$WORK/aeon-$NAME"; SC="$WORK/s1-$NAME"
rm -rf "$AC" "$SC"
cp -a "$SEEDS/aeon-seed" "$AC"
cp -a "$SEEDS/s1-seed" "$SC"

START=$(date +%s)
{
  echo "MARK_HARNESS=$NAME"
  echo "MARK_UPTIME=$(uptime)"
} > "$OUT"

# NODE_OPTIONS carries the census instrument: the exit net reaps with
# { quiet: true }, so without it the affirmative tell can NEVER print for a
# self-killing harness and every one of those rows would read as clean. Proven
# in five legs by o78-census-prove-tell.sh. Printing only — no deletion,
# attribution or signalling decision is altered.
AEON_DIR="$AC" S1DISASM_DIR="$SC" \
NODE_OPTIONS="--import $ROOT/scratchpad/o78-reap-trace-register.mjs" \
ELECTRON_BIN="$ELECTRON_BIN" \
timeout -k 20 "$TMO" xvfb-run -a bash -c '
  echo "MARK_OUTER_XAUTH=$XAUTHORITY"
  D=$(dirname "$XAUTHORITY")
  npm run "harness:'"$NAME"'"
  E=$?
  echo "MARK_NPM_EXIT=$E"
  if [ -d "$D" ]; then echo "MARK_SURVIVES=YES"; else echo "MARK_SURVIVES=NO"; fi
  exit $E
' >> "$OUT" 2>&1
OE=$?
echo "MARK_OUTER_EXIT=$OE" >> "$OUT"
echo "MARK_SECONDS=$(( $(date +%s) - START ))" >> "$OUT"

XA=$(grep -m1 '^MARK_OUTER_XAUTH=' "$OUT" | sed 's/^MARK_OUTER_XAUTH=//')
if [ -n "$XA" ]; then
  D=$(dirname "$XA")
  echo "MARK_OUTER_TMPDIR=$D" >> "$OUT"
  if grep -q "X artifact REFUSED.*$(basename "$D")" "$OUT"; then
    echo "MARK_REFUSED=YES" >> "$OUT"
  elif grep -q "X artifact REFUSED" "$OUT"; then
    echo "MARK_REFUSED=OTHER" >> "$OUT"
  else
    echo "MARK_REFUSED=NO" >> "$OUT"
  fi
else
  echo "MARK_OUTER_TMPDIR=" >> "$OUT"
  echo "MARK_REFUSED=UNKNOWN" >> "$OUT"
fi
grep -q '^MARK_SURVIVES=' "$OUT" || echo "MARK_SURVIVES=UNKNOWN" >> "$OUT"
# LOUD ON UNMEASURABLE: without the loader line the tell is blind for the
# self-kill class, so a row measured that way is NOT a negative.
if grep -q 'O78-TRACE-LOADER: exit-net reap un-quieted' "$OUT"; then
  echo "MARK_LOADER=ACTIVE" >> "$OUT"
elif grep -q 'O78-TRACE-LOADER' "$OUT"; then
  echo "MARK_LOADER=FAILED" >> "$OUT"
else
  echo "MARK_LOADER=ABSENT" >> "$OUT"
fi
echo "MARK_DONE=$NAME" >> "$OUT"
rm -rf "$AC" "$SC"
