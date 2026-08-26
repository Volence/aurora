#!/usr/bin/env python3
"""Overseer's INDEPENDENT control for the 'shift' phase fill (ROADMAP 27/29-ROM).

Written in the foreground, deliberately NOT importing Aurora's model or the
CDP harness's checker: the harness asks the app's own emit whether it shifted,
and this asks the SAVED BYTES the same question with a separately-written roll.

It carries its own teeth, because a green roll-check that could never fail is
the vacuous-gate class (OVERSEER.md bar 2e). Three verdicts per run:
  REAL      the saved file's bank k must equal bank 0 rolled k px
  FORGE     banks 1..7 replaced by copies of bank 0 (today's 'copy' fill, the
            thing that would NOT move on screen) must FAIL
  OPPOSITE  the mirrored direction must FAIL, so a symmetric pattern cannot
            pass by accident

Direction/geometry are DERIVED, not assumed, and were verified firsthand at
aeon a840d68f: engine/level/bg_anim.emp's header ("8 art banks pre-shifted 1px
each", "step & 7", column-major slots, step_mask = pattern width - 1) and
tools/forest_bg_gen.py's pat_pixel(v, y, ph) sampling (v + ph) % PAT_W — i.e.
bank k at x shows the art that phase 0 held at (x + k) mod pattern_px.

Tile encoding note, recorded because getting it wrong is silent: a phase tile
in editor_bg_override.json is 64 PIXEL nibbles, row-major — not 32 packed
bytes. Reading it as packed bytes makes every bank fail and reads exactly like
a defect in the writer.

Usage: python3 scratchpad/bganim-phase-roll-control.py <saved editor_bg_override.json> [band index]
"""
import json, sys

def grid(bank, cols, rows):
    w, h = cols * 8, rows * 8
    out = [[None] * w for _ in range(h)]
    for t, tile in enumerate(bank):
        if len(tile) != 64:
            sys.exit(f"FAIL: phase tile {t} has {len(tile)} entries, expected 64 pixels")
        c, r = t // rows, t % rows          # column-major slots
        for y in range(8):
            for x in range(8):
                out[r * 8 + y][c * 8 + x] = tile[y * 8 + x]
    return out

def rolls(banks, w, sign):
    return [all(banks[k][y][x] == banks[0][y][(x + sign * k) % w]
                for y in range(len(banks[0])) for x in range(w))
            for k in range(len(banks))]

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    doc = json.load(open(sys.argv[1]))
    idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    anims = doc.get("anims") or []
    if not anims:
        sys.exit("FAIL: the document carries no bands — nothing to judge (anti-vacuous)")
    b = anims[idx]
    cols, rows = b["cols"], b["rows"]
    w = cols * 8
    if b.get("pattern_px") not in (None, w):
        sys.exit(f"FAIL: pattern_px {b['pattern_px']} != cols*8 {w}")
    banks = [grid(ph, cols, rows) for ph in b["phases"]]
    print(f"band {idx}: {cols}x{rows}, {len(banks)} banks, pattern {w}px")

    real = rolls(banks, w, +1)
    forge = rolls([banks[0]] * len(banks), w, +1)
    opp = rolls(banks, w, -1)
    print(f"REAL     bank k == bank0 rolled k px : {real} -> {'PASS' if all(real) else 'FAIL'}")
    print(f"FORGE    copy-filled banks           : {forge} -> "
          f"{'PASS (rejected)' if not all(forge) else 'FAIL (accepted a still band!)'}")
    print(f"OPPOSITE mirrored direction          : {opp} -> "
          f"{'PASS (rejected)' if not all(opp) else 'FAIL (symmetric — direction unproven)'}")
    ok = all(real) and not all(forge) and not all(opp)
    print("VERDICT:", "the saved band is a true 1px-per-bank shift, and this check could have failed"
          if ok else "NOT PROVEN")
    sys.exit(0 if ok else 1)

main()
