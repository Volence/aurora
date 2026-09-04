#!/bin/bash
# O78-RESIDUAL-72 — measure ONE harness under the reproducing shape.
#
#   xvfb-run -a npm run harness:<name>
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
#
# Usage: run-one.sh <script-name-without-harness-prefix> <logdir> <workdir> <timeout-secs>
set -u
NAME="$1"; LOGDIR="$2"; WORK="$3"; TMO="${4:-300}"
BASE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a79f5ac54eb15d28f
SCRATCH=/tmp/claude-1000/-home-volence-sonic-hacks-aurora/28bb7778-f0f5-4bfb-906b-9d581bcf48de/scratchpad
OUT="$LOGDIR/$NAME.log"
mkdir -p "$LOGDIR" "$WORK"

# A fresh writable copy per run. Several harnesses rewrite project files and
# REFUSE a reused copy by design (section-raster-select aborts on leftovers),
# so this is re-materialised every time and never points at a peer's live tree.
AC="$WORK/aeon-$NAME"; SC="$WORK/s1-$NAME"
rm -rf "$AC" "$SC"
cp -a "$SCRATCH/aeon-seed" "$AC"
cp -a "$SCRATCH/s1-seed" "$SC"

cd "$BASE" || exit 99
START=$(date +%s)
{
  echo "MARK_HARNESS=$NAME"
  echo "MARK_UPTIME=$(uptime)"
} > "$OUT"

# NODE_OPTIONS carries the census instrument: the exit net reaps with
# { quiet: true }, so without it the affirmative tell can NEVER print for a
# self-killing harness and every one of the 79 would read as clean. Proven in
# three legs by o78-census-prove-tell.sh. Printing only — no deletion,
# attribution or signalling decision is altered.
AEON_DIR="$AC" S1DISASM_DIR="$SC" \
NODE_OPTIONS="--import $BASE/scratchpad/o78-reap-trace-register.mjs" \
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
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
