#!/bin/bash
# O78-RESIDUAL-72 — the census instrument's proof, in five legs.
#
#   sh scratchpad/o78-census-prove-tell.sh [logdir]
#
# Each leg is ONE run under a real outer `xvfb-run -a`, and the grep is for the
# exact tell the census reads. Expected:
#
#   live       no loader  ->  0   the BLINDNESS the instrument exists to fix
#   live       loader     ->  1   the tell fires on a live tree
#   dead       loader     ->  0   a REAL negative (empty artifact set), not a blind one
#   quietkill  no loader  ->  0
#   quietkill  loader     ->  1   red under loader v1, which patched only the exit net
#
# NO EMULATOR is started from here.
set -u
cd "$(dirname "$0")/.." || exit 9
ROOT=$(pwd)
LOGDIR=${1:-$ROOT/scratchpad/o78-prove-logs}
mkdir -p "$LOGDIR"

leg() {
  tag="$1"; mode="$2"; loader="$3"
  out="$LOGDIR/prove-$tag.log"
  if [ "$loader" = yes ]; then
    MODE="$mode" NODE_OPTIONS="--import $ROOT/scratchpad/o78-reap-trace-register.mjs" \
      xvfb-run -a node "$ROOT/scratchpad/o78-reap-trace-control.mjs" > "$out" 2>&1
  else
    MODE="$mode" xvfb-run -a node "$ROOT/scratchpad/o78-reap-trace-control.mjs" > "$out" 2>&1
  fi
  e=$?
  hit=$(grep -c 'X artifact REFUSED.*INHERITED' "$out")
  echo "LEG $tag  mode=$mode loader=$loader  exit=$e  REFUSED_INHERITED_lines=$hit"
}

leg live-noloader      live      no
leg live-loader        live      yes
leg dead-loader        dead      yes
# The { quiet: true } killTree shape: red under loader v1 (which patched only
# the exit net's site), green under v2 (which also patches killTree's own).
leg quietkill-noloader quietkill no
leg quietkill-loader   quietkill yes
