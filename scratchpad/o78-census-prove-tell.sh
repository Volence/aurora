#!/bin/bash
# Two-direction proof of the census instrument. Each leg is one run under a
# real outer `xvfb-run -a`; the grep is for the exact tell the census reads.
set -u
BASE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a79f5ac54eb15d28f
S=/tmp/claude-1000/-home-volence-sonic-hacks-aurora/28bb7778-f0f5-4bfb-906b-9d581bcf48de/scratchpad
cd "$BASE" || exit 9
leg() {
  local tag="$1" mode="$2" loader="$3"
  local out="$S/logs/prove-$tag.log"
  if [ "$loader" = yes ]; then
    MODE="$mode" NODE_OPTIONS="--import $BASE/scratchpad/o78-reap-trace-register.mjs" \
      xvfb-run -a node scratchpad/o78-reap-trace-control.mjs > "$out" 2>&1
  else
    MODE="$mode" xvfb-run -a node scratchpad/o78-reap-trace-control.mjs > "$out" 2>&1
  fi
  local e=$?
  local hit; hit=$(grep -c 'X artifact REFUSED.*INHERITED' "$out")
  echo "LEG $tag  mode=$mode loader=$loader  exit=$e  REFUSED_INHERITED_lines=$hit"
}
leg live-noloader  live no
leg live-loader    live yes
leg dead-loader    dead yes
# v2: the { quiet: true } killTree shape. Red under loader v1 (which patched
# only the exit net's :900 site), green under v2 (which also patches :841).
leg quietkill-noloader quietkill no
leg quietkill-loader   quietkill yes
