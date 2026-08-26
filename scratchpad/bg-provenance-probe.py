#!/usr/bin/env python3
"""ROADMAP item 24, deliverable 1 — WHICH bg_src PNG is the live blob made from?

aeon ships two candidates in games/sonic4/data/editor/bg_src/ and a live
editor_bg_override.json at 448/448 tiles. Run the generator on each and compare
TILE BYTES (ordered `tiles` list and `layout`), not counts.

THE GATE HAS TO BE BYPASSED TO SEE THE BYTES, AND ONLY HERE. At the pinned
revision the generator refuses both PNGs (448 unique > BG_STATIC_TILE_BUDGET),
so this probe imports the module and replaces `check_tile_budget` with a print;
lock-mode quantisation, flip-canonical dedup and the layout loop are the shipped
code, untouched. Nothing this probe writes leaves the scratch dir.

MEASURED 2026-08-25 at aeon origin/master a840d68f69f27849b5b61c131a8387e4a6b0c024
(read via git archive, never the sibling working tree):
  ojz_cave_lilypad.png   -> 448 unique tiles; tiles==live False, layout==live False,
                            tile-set overlap with live 0/448
  ojz_forest_flowers.png -> 448 unique tiles; tiles==live TRUE (ordered),
                            layout==live TRUE, overlap 448/448
So the live document IS the generator's output for ojz_forest_flowers.png, byte
for byte -- which matches dd93a840's commit message -- and BOTH candidates land
on exactly 448, the old ceiling (band_reserve was 0 when they were imported).

Usage: python3 scratchpad/bg-provenance-probe.py <pinned aeon checkout dir>
"""
import importlib.util
import json
import pathlib
import sys
import tempfile

pin = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(pin / 'tools'))
spec = importlib.util.spec_from_file_location('gen', pin / 'tools/png_to_bg_override.py')
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
gen.check_tile_budget = lambda n: print(
    f'  [probe] budget gate BYPASSED for provenance only; generator counted {n} unique tiles')

live = json.load(open(pin / 'games/sonic4/data/editor_bg_override.json'))
live_set = set(map(tuple, live['tiles']))
scratch = pathlib.Path(tempfile.mkdtemp(prefix='bg-provenance-'))
verdict = {}
for png in sorted((pin / 'games/sonic4/data/editor/bg_src').glob('*.png')):
    out = scratch / (png.stem + '.json')
    sys.argv = ['png_to_bg_override.py', str(png), '--out', str(out)]
    print(f'== {png.name}')
    gen.main()
    d = json.load(open(out))
    ts = set(map(tuple, d['tiles']))
    same = d['tiles'] == live['tiles'] and d['layout'] == live['layout']
    verdict[png.name] = same
    print(f'  unique={len(d["tiles"])}  tiles==live(ordered): {d["tiles"] == live["tiles"]}  '
          f'layout==live: {d["layout"] == live["layout"]}  '
          f'tile-set overlap with live: {len(ts & live_set)}/{len(live_set)}')
hits = [k for k, v in verdict.items() if v]
print('VERDICT:', f'{hits[0]} reproduces the live document byte for byte' if len(hits) == 1
      else ('NEITHER PNG reproduces the live document' if not hits else f'AMBIGUOUS: {hits}'))
