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

# THE TRAP, covering EXIT **and** INT **and** TERM. `trap ... EXIT` alone does
# not fire on SIGINT or SIGTERM, which is the vacuous shape this repo keeps
# meeting. This script starts xvfb-run itself, and xvfb-run's own cleanup sits
# on its success path only (/usr/bin/xvfb-run:184-192), so an interrupted leg
# would leak the display lock, the socket and the wrapper tempdir. The tempdir
# removed here is the one the current leg's own wrapper minted.
CHILD=
CUR_LOG=
_cleanup() {
  _st=$?
  trap - EXIT INT TERM
  if [ -n "$CHILD" ]; then
    kill -TERM "-$CHILD" 2>/dev/null || kill -TERM "$CHILD" 2>/dev/null || true
  fi
  if [ -n "$CUR_LOG" ]; then
    _xa=$(grep -m1 'inherited XAUTHORITY=' "$CUR_LOG" 2>/dev/null | sed 's/.*inherited XAUTHORITY=//')
    if [ -n "$_xa" ]; then
      _d=$(dirname "$_xa")
      case "$_d" in /tmp/xvfb-run.*) rm -rf "$_d" ;; esac
    fi
  fi
  exit "$_st"
}
trap _cleanup EXIT INT TERM

leg() {
  tag="$1"; mode="$2"; loader="$3"
  out="$LOGDIR/prove-$tag.log"
  CUR_LOG="$out"
  if [ "$loader" = yes ]; then
    MODE="$mode" NODE_OPTIONS="--import $ROOT/scratchpad/o78-reap-trace-register.mjs" \
      xvfb-run -a node "$ROOT/scratchpad/o78-reap-trace-control.mjs" > "$out" 2>&1 &
  else
    MODE="$mode" xvfb-run -a node "$ROOT/scratchpad/o78-reap-trace-control.mjs" > "$out" 2>&1 &
  fi
  CHILD=$!
  wait "$CHILD"
  e=$?
  CHILD=
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
