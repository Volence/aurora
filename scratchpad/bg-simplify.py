#!/usr/bin/env python3
"""Simplify a BG source PNG until aeon's generator counts <= BG_STATIC_TILE_BUDGET
unique flip-canonical tiles. ROADMAP item 24, deliverable 2. TEST SCOPE (d-7).

WHY THIS EXISTS. aeon's `tools/png_to_bg_override.py` now gates on
BG_STATIC_TILE_BUDGET = BG_TILE_CAPACITY - BG_BAND_RESERVE (tools/vram_map.py),
and both `bg_src/*.png` count 448 unique tiles under it, so it refuses both.
Aurora needs a ROOMY document -- one the generator itself wrote, with free
tile slots -- to prove a brand-new band can be INSERTED (the gesture that grows
the blob). This script makes the PNG that gets one written.

METHOD -- greedy nearest-tile merge, in the GENERATOR'S OWN TILE SPACE.
  1. Quantise every 8x8 cell exactly as the generator does: its `quantise_tile`
     against its `load_lock_palettes` (CRAM lines 2,3 from the pinned
     ojz_palette.bin) -> (palette-index tile, CRAM line). The functions are
     IMPORTED from the generator module, not re-implemented, so "unique" here
     means what it means there.
  2. Count unique tiles under the generator's `canonical()` (min over the four
     H/V flips of the index bytes).
  3. Distance between two canonical tiles = the minimum, over the four flips,
     of the summed squared distance between their pixels' snapped-RGB colours
     (each index rendered through its own line's LUT, so a line-2 tile and a
     line-3 tile compare by colour, not by index).
  4. Repeatedly merge the CLOSEST pair: the rarer tile (fewer cells) becomes the
     commoner one, in the flip orientation that minimised the distance -- so a
     cell that drew the rare tile H-flipped now draws the survivor with the
     matching flip composed in. Merging the closest pair first is "replace the
     least-distinct tiles with their nearest existing tile"; it changes the
     picture by the least amount per tile freed.
  5. Stop at `--target` (default: BG_STATIC_TILE_BUDGET read from vram_map.py),
     render every cell back to RGB through its line's LUT (index -> CRAM word
     -> the 8-bit value whose snap9 round-trips), and write the PNG.
  6. RE-COUNT the written PNG through the generator's own quantise+canonical
     path and print it. That re-count is a self-check only: the generator's own
     printed `unique tiles: N/...` line on a real run is the judge.

DETERMINISM. Ties in the merge order break on (distance, rarer count, lower
canonical key), all of which are functions of the input bytes; numpy argmin is
deterministic for equal values (first index). Same PNG in -> same PNG out.

WHAT IT DOES NOT DO. It never touches aeon's tree, never writes a JSON, never
calls the generator's `main()`. Run the generator afterwards:
  python3 <aeon>/tools/png_to_bg_override.py simplified.png --out roomy.json

Usage:
  python3 scratchpad/bg-simplify.py <src.png> <out.png> --aeon-tools <aeon>/tools
                                    [--target N] [--lines 2,3]
"""
import argparse
import hashlib
import importlib.util
import os
import sys

import numpy as np
from PIL import Image


def load_generator(tools_dir):
    sys.path.insert(0, tools_dir)                # vram_map, bg_override_io
    spec = importlib.util.spec_from_file_location(
        'png_to_bg_override', os.path.join(tools_dir, 'png_to_bg_override.py'))
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    return gen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--aeon-tools', required=True,
                    help='<aeon checkout>/tools at a PINNED revision (never the live tree)')
    ap.add_argument('--target', type=int, default=None,
                    help='unique-tile ceiling; default BG_STATIC_TILE_BUDGET from vram_map.py')
    ap.add_argument('--lines', default='2,3', help="the generator's lock-mode candidate lines")
    args = ap.parse_args()

    gen = load_generator(args.aeon_tools)
    import vram_map
    target = args.target if args.target is not None else vram_map.BG_STATIC_TILE_BUDGET
    print(f'[bg-simplify] target <= {target} unique tiles '
          f'(vram_map: capacity {vram_map.BG_TILE_CAPACITY} - reserve {vram_map.BG_BAND_RESERVE} '
          f'= budget {vram_map.BG_STATIC_TILE_BUDGET})')

    src_bytes = open(args.src, 'rb').read()
    print(f'[bg-simplify] source {args.src} sha256 {hashlib.sha256(src_bytes).hexdigest()}')
    img = np.array(Image.open(args.src).convert('RGB'))
    h, w, _ = img.shape
    if w % 8 or h % 8:
        sys.exit(f'ERROR: {w}x{h} is not tile-aligned')
    tw, th = w // 8, h // 8

    lines = [int(x) for x in args.lines.split(',')]
    palettes = gen.load_lock_palettes(lines)       # {line: 16x3 snapped-RGB LUT (0..7)}

    # 1. quantise every cell the generator's way
    cells = [[gen.quantise_tile(img[r*8:r*8+8, c*8:c*8+8], palettes) for c in range(tw)]
             for r in range(th)]

    # 2. canonical dedup -- key -> (representative index tile, line, count)
    reps, count, key_of_cell = {}, {}, {}
    for r in range(th):
        for c in range(tw):
            idx, line = cells[r][c]
            key = gen.canonical(idx)
            if key not in reps:
                reps[key] = (np.frombuffer(key, np.uint8).reshape(8, 8), line)
            count[key] = count.get(key, 0) + 1
            key_of_cell[(r, c)] = key
    keys = sorted(reps)                            # deterministic order
    n0 = len(keys)
    print(f'[bg-simplify] {n0} unique flip-canonical tiles in the source '
          f'(generator quantise + canonical)')
    if n0 <= target:
        print('[bg-simplify] already within budget; writing an unchanged re-render')

    # 3. colour-space rendering of every canonical tile, in all four flips
    def rgb_of(idx, line):
        return palettes[line][idx]                 # 8x8x3, snapped 0..7
    flips = ['', 'H', 'V', 'HV']
    def flipped(t, f):
        return gen.flip_variants(t)[f]
    # rendered[k][f] = 8x8x3 float of canonical tile k under flip f
    rendered = np.zeros((n0, 4, 64, 3))
    for i, k in enumerate(keys):
        t, line = reps[k]
        for j, f in enumerate(flips):
            rendered[i, j] = rgb_of(flipped(t, f), line).reshape(64, 3)

    # 4. pairwise min-over-flip distances (n0^2 x 4 x 64 x 3 -- trivial at 448)
    base = rendered[:, 0]                          # unflipped
    dist = np.full((n0, n0), np.inf)
    best_flip = np.zeros((n0, n0), np.int8)
    for j in range(4):
        d = ((base[:, None, :, :] - rendered[None, :, j, :, :]) ** 2).sum(axis=(2, 3))
        better = d < dist
        dist[better] = d[better]
        best_flip[better] = j
    np.fill_diagonal(dist, np.inf)

    alive = np.ones(n0, bool)
    cnt = np.array([count[k] for k in keys], float)
    # merged_into[i] = (survivor index, flip applied to survivor to stand in for i)
    merged_into = {}
    merges = 0
    while alive.sum() > target:
        # closest live pair; ties -> lowest flat index (deterministic)
        live = np.where(alive)[0]
        sub = dist[np.ix_(live, live)]
        flat = int(np.argmin(sub))
        a, b = live[flat // len(live)], live[flat % len(live)]
        # the rarer tile dies; on equal counts the higher key dies (keys sorted)
        if cnt[a] < cnt[b] or (cnt[a] == cnt[b] and a > b):
            dead, keep = a, b
        else:
            dead, keep = b, a
        # `dist[dead, keep]` was computed as base[dead] vs rendered[keep, flip]:
        # the survivor under `flip` stands in for the dead tile unflipped.
        merged_into[dead] = (keep, int(best_flip[dead, keep]))
        cnt[keep] += cnt[dead]
        alive[dead] = False
        dist[dead, :] = np.inf
        dist[:, dead] = np.inf
        merges += 1
    print(f'[bg-simplify] merged {merges} tiles -> {int(alive.sum())} unique')

    def resolve(i):
        f_acc = ''
        while i in merged_into:
            i, f = merged_into[i]
            f_acc = compose(f_acc, flips[f])
        return i, f_acc

    def compose(f1, f2):
        # flips are an abelian group on {H, V}; each letter toggles
        s = set()
        for f in (f1, f2):
            for ch in f:
                s ^= {ch}
        return ('H' if 'H' in s else '') + ('V' if 'V' in s else '')

    # 5. render back. A cell drew canonical tile k under some flip F (found the
    # generator's way: which flip of the canonical equals the cell's index
    # tile). If k merged into k' under flip G, the cell now draws k' under G o F.
    out = np.zeros((h, w, 3), np.uint8)
    key_index = {k: i for i, k in enumerate(keys)}
    def to8(v):                                    # snap9 inverse: round(v/7*255)
        return np.round(v / 7 * 255).astype(np.uint8)
    for r in range(th):
        for c in range(tw):
            idx, line = cells[r][c]
            k = key_of_cell[(r, c)]
            canon, _ = reps[k]
            cell_flip = next(f for f, var in gen.flip_variants(canon).items()
                             if var.tobytes() == idx.tobytes())
            i, gflip = resolve(key_index[k])
            t2, line2 = reps[keys[i]]
            final = flipped(t2, compose(gflip, cell_flip))
            out[r*8:r*8+8, c*8:c*8+8] = to8(rgb_of(final, line2))
    Image.fromarray(out).save(args.out)

    # 6. self-check: re-count the WRITTEN png through the generator's own path
    img2 = np.array(Image.open(args.out).convert('RGB'))
    seen = set()
    for r in range(th):
        for c in range(tw):
            idx, _ = gen.quantise_tile(img2[r*8:r*8+8, c*8:c*8+8], palettes)
            seen.add(gen.canonical(idx))
    print(f'[bg-simplify] wrote {args.out} sha256 '
          f'{hashlib.sha256(open(args.out, "rb").read()).hexdigest()}')
    print(f'[bg-simplify] re-count of the written PNG via generator quantise+canonical: '
          f'{len(seen)} unique (target {target}) -- the generator\'s own run is the judge')
    if len(seen) > target:
        sys.exit(f'ERROR: re-count {len(seen)} > target {target}; re-quantisation drifted')


if __name__ == '__main__':
    main()
