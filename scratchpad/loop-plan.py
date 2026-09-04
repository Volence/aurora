#!/usr/bin/env python3
"""Derive the test loop's per-cell authoring plan for OJZ act 1 section 0.

Emits JSON the Aurora harness replays through the REAL collision palette:
one entry = one armed brush + one stroke.

EVERY NUMBER HERE IS DERIVED, and the derivation is stated beside it:

  * the floor it sits on          — measured off the committed
    section_0.collattr.bin: rows 53-54 are solid on BOTH planes from cell 0 to
    cell 79. Nothing here writes those rows.
  * the player's spawn            — games/sonic4/data/levels/ojz/act1/
    act_descriptor.emp start_local_x/$0100, start_local_y/$0100.
  * the loop's INNER RADIUS       — bounded by the engine's own physics, not by
    taste. Ground speed loses 2*PHYS_SLOPE_WALK*dy of v^2 climbing (the slope
    factor integrates to an energy relation), and Player_SlopeRepel detaches
    below PHYS_SLIP_SPEED. With PHYS_TOP_SPEED $600 = 6.0 px/f,
    PHYS_SLOPE_WALK $20 = 0.125 px/f^2 and PLAYER_Y_RADIUS 19, the player's
    CENTRE rises 2*(r_in - 19) px, so
        v_top^2 = 6.0^2 - 2*0.125*2*(r_in-19)
    and r_in = 48 gives v_top = 4.7 px/f against a 2.5 px/f floor. r_in = 64
    would give 3.3, r_in = 88 would fall off the top.
  * the per-cell SHAPES           — fitted against the base bank
    (games/sonic4/data/collision/base/{heightmaps,angles}.bin), the same bytes
    apply_editor_collision_overlay hands bake_plane_cell, scored on the
    per-pixel mask cp.covers() produces. Nothing is invented; a cell that the
    bank cannot express would show up as a large residual and does not.
  * the PLANE SPLIT               — read off a REAL shipped loop, not off the
    anchor's prose: s2disasm EHZ chunks $19/$1A/$29/$2A hold a working Sonic 2
    loop, and its two legs are on DIFFERENT collision paths (left leg path B
    only, right leg path A only) with the loop's TOP solid on both and a
    both-planes patch on the ground at the bottom centre. See
    scratchpad/s2loop.py. The anchor's §3.3 worked example ("plane L = ground +
    LEFT half") does not survive that: a player approaching rightward ON L
    would hit the left leg before reaching the bottom-centre mark.
  * the MARK PLACEMENT            — forced by Player_LoopCrossover's edge
    trigger. XOVER_CELL_MASK is $FFF8FFF0 (player_common.emp, pinned by its own
    ensure), so the trigger quantises X at 8 px while Aurora authors 16 px
    cells: every authored mark is an EVEN number of trigger cells wide, and a
    TWO-WAY pair {TO_B on A, TO_A on B} at one cell therefore flips a
    horizontally-moving player an even number of times and nets to nothing.
    The plan uses two SPATIALLY SEPARATED ONE-WAY marks instead — plane A's
    TO_B on the far side of the apex from the leg it hands you to, plane B's
    TO_A on the other — which is idempotent and so parity-free.
"""
import json, os, sys

AEON = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scratchpad/loop-plan.json'
sys.path.insert(0, os.path.join(AEON, 'tools'))
import collision_pipeline as cp  # noqa: E402

BASE = os.path.join(AEON, 'games/sonic4/data/collision/base')
PROF = open(f'{BASE}/heightmaps.bin', 'rb').read()
ANG = open(f'{BASE}/angles.bin', 'rb').read()

SEC = 0
GROUND_TOP = 848        # world Y of section 0's floor surface (row 53 top)
CX = 768                # loop centre X — a 16px cell boundary, so no cell
CY = GROUND_TOP - 48    # straddles the circle's horizontal extremes and no
R_IN, R_OUT = 48, 80    # column ever needs two solid runs (rotate_profile)
assert CX % 16 == 0 and CY % 16 == 0
CC_MID = CX // 16       # 48 — first cell right of centre

ROW_TOP_BAND = (45, 46, 47)     # ring top: BOTH planes (the apex is crossed
                                # on either plane, so it must be continuous)
ROW_LEGS = (48, 49, 50, 51)     # left leg -> plane B only, right leg -> A only
ROW_FOOT = 52                   # the arc meeting the ground
FOOT_BOTH = (47, 48)            # the bottom-centre patch, both planes
MARK_ROWS = (47, 48, 49)        # rows the player's CENTRE occupies at the apex
MARK_A_CC = 46                  # plane A -> TO_B, LEFT of the apex
MARK_B_CC = 49                  # plane B -> TO_A, RIGHT of the apex


def profile_mask(h):
    return tuple(tuple(cp.covers(h[c], r) for c in range(16)) for r in range(16))


VARIANTS = []
for s in range(1, len(ANG)):
    h0 = PROF[s * 16:(s + 1) * 16]
    if all(v == 0 for v in h0):
        continue
    for xf in (0, 1):
        for yf in (0, 1):
            h = h0
            if xf:
                h = cp.flip_profile_x(h)
            if yf:
                h = cp.flip_profile_y(h)
            try:
                cp.rotate_profile(h)
            except ValueError:
                continue
            VARIANTS.append((s, xf, yf, profile_mask(h)))


def ideal(cc, cr):
    m = []
    for row in range(16):
        py = cr * 16 + row + 0.5
        m.append(tuple(R_IN <= ((cc * 16 + col + 0.5 - CX) ** 2
                                + (py - CY) ** 2) ** 0.5 <= R_OUT
                       for col in range(16)))
    return tuple(m)


def fit(mask):
    best = None
    for s, xf, yf, vm in VARIANTS:
        k = sum(1 for r in range(16) for c in range(16) if mask[r][c] != vm[r][c])
        if best is None or k < best[0]:
            best = (k, s, xf, yf)
            if k == 0:
                break
    return best


def plane_of(cc, cr):
    if cr in ROW_TOP_BAND:
        return 'both'
    if cr in ROW_LEGS:
        return 'a' if cc >= CC_MID else 'b'
    if cr == ROW_FOOT:
        if cc in FOOT_BOTH:
            return 'both'
        return 'a' if cc > max(FOOT_BOTH) else 'b'
    raise AssertionError((cc, cr))


geom, worst = [], 0
for cr in list(ROW_TOP_BAND) + list(ROW_LEGS) + [ROW_FOOT]:
    for cc in range(CX // 16 - 6, CX // 16 + 6):
        m = ideal(cc, cr)
        if not any(any(r) for r in m):
            continue
        k, s, xf, yf = fit(m)
        worst = max(worst, k)
        geom.append({'cc': cc, 'cr': cr, 'plane': plane_of(cc, cr), 'shape': s,
                     'xFlip': bool(xf), 'yFlip': bool(yf), 'solidity': 'all',
                     'crossover': 'keep', 'residual': k})

# Second pass: the two one-way marks. A mark cell that already carries geometry
# is REPAINTED with the same shape/flip on the marked plane, so the mark is
# added rather than the geometry replaced; an interior (air) cell is painted
# with solidity 'none', which bake_plane_cell interns as marked air.
marks = []
by_cell = {(g['cc'], g['cr']): g for g in geom}
for cc, plane in ((MARK_A_CC, 'a'), (MARK_B_CC, 'b')):
    for cr in MARK_ROWS:
        g = by_cell.get((cc, cr))
        if g and g['plane'] in (plane, 'both'):
            marks.append({'cc': cc, 'cr': cr, 'plane': plane, 'shape': g['shape'],
                          'xFlip': g['xFlip'], 'yFlip': g['yFlip'],
                          'solidity': 'all', 'crossover': 'hand-off',
                          'note': 'mark over existing geometry'})
        else:
            marks.append({'cc': cc, 'cr': cr, 'plane': plane, 'shape': 1,
                          'xFlip': False, 'yFlip': False, 'solidity': 'none',
                          'crossover': 'hand-off', 'note': 'mark on air'})

plan = {
    'section': SEC, 'centre': [CX, CY], 'r_in': R_IN, 'r_out': R_OUT,
    'ground_top': GROUND_TOP, 'worst_fit_residual_px': worst,
    'entry_x_leftward_run': CX, 'geometry': geom, 'marks': marks,
}
open(OUT, 'w').write(json.dumps(plan, indent=1))
print(f'{len(geom)} geometry strokes + {len(marks)} mark strokes -> {OUT}')
print(f'worst per-cell fit residual: {worst} px of 256')
for tag, rows in (('A', 'a'), ('B', 'b')):
    print(f'\nplane {tag}:')
    for cr in range(44, 55):
        line = ''
        for cc in range(CX // 16 - 7, CX // 16 + 7):
            g = by_cell.get((cc, cr))
            m = [x for x in marks if x['cc'] == cc and x['cr'] == cr and x['plane'] == rows]
            on = g and g['plane'] in (rows, 'both')
            line += ('M' if (m and on) else 'm' if m else '#' if on else '.')
        print(f'  row {cr:3d} {line}')
print('  (# geometry, M geometry+mark, m mark on air, . nothing)')
print('  ground rows 53/54 are NOT written: already solid on both planes')
