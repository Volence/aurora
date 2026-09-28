#!/usr/bin/env python3
"""Which golden entries row 239 (a) moved, and the lineWidth in force at each.

Usage: golden-moved-entries.py OLD.json NEW.json

Walks both call logs case by case, in step, and finds the DEVICE width each stroke call
is drawn at (lineWidth times the matrix's x scale, in force at `strokeRect`, or at the
`stroke()` that draws a moveTo/lineTo path). Prints every call that differs, with that
device width, and at the end a verdict: every moved call must be a stroke-geometry
call (moveTo / lineTo / strokeRect) issued while an EVEN device width was in force, and
the call count and every op must be unchanged. The script reads the two files only.
"""
import json
import sys

GEOMETRY = {'moveTo', 'lineTo', 'strokeRect'}


def load(p):
    g = json.load(open(p))
    cases = g['cases']
    # The region golden carries {calls, report}; the chrome golden a bare call list.
    return g['generatedFrom'], {k: (v['calls'] if isinstance(v, dict) else v) for k, v in cases.items()}, \
        {k: (v.get('report') if isinstance(v, dict) else None) for k, v in cases.items()}


def main(old_p, new_p):
    of, old, orep = load(old_p)
    nf, new, nrep = load(new_p)
    print(f'old: {of}\nnew: {nf}')
    assert sorted(old) == sorted(new), 'case names differ'
    bad = []
    total_moved = 0
    for name in old:
        a, b = old[name], new[name]
        if len(a) != len(b):
            bad.append(f'{name}: call count {len(a)} -> {len(b)}')
            continue
        # The width a call is DRAWN at: for strokeRect the one in force at the call; for a
        # path's moveTo/lineTo the one in force at the path's `stroke()`, which the chrome
        # sets after building the path (effects-guides.ts sets lineWidth after lineTo).
        drawn_at = [None] * len(a)
        width = None
        pending = []
        for i, x in enumerate(a):
            if x['op'] == 'set:lineWidth':
                width = x['args'][0] * x['m'][0]
            elif x['op'] in ('moveTo', 'lineTo'):
                pending.append(i)
            elif x['op'] == 'beginPath':
                pending = []
            elif x['op'] == 'stroke':
                for k in pending:
                    drawn_at[k] = width
                pending = []
            elif x['op'] == 'strokeRect':
                drawn_at[i] = width
        moved = []
        for i, (x, y) in enumerate(zip(a, b)):
            if x['op'] != y['op']:
                bad.append(f'{name}#{i}: op {x["op"]} -> {y["op"]}')
            if x != y:
                moved.append((i, x, y, drawn_at[i]))
        if orep[name] != nrep[name]:
            bad.append(f'{name}: report differs')
        print(f'\n== {name}: {len(a)} calls, {len(moved)} moved')
        for i, x, y, w in moved:
            wd = None if w is None else round(w, 6)
            even = wd is not None and abs(wd - round(wd)) < 1e-6 and round(wd) % 2 == 0
            print(f'  #{i} {x["op"]} {x["args"]} -> {y["args"]}  (device lineWidth {wd}, {"EVEN" if even else "ODD/none"})')
            if x['op'] not in GEOMETRY or not even or x['m'] != y['m']:
                bad.append(f'{name}#{i}: {x["op"]} moved with device width {wd}')
        total_moved += len(moved)
    print(f'\nTOTAL moved calls: {total_moved}')
    if bad:
        print('VERDICT: NOT ONLY EVEN-WIDTH STROKE GEOMETRY MOVED')
        for m in bad:
            print(f'  {m}')
        return 1
    print('VERDICT: every moved call is stroke geometry (moveTo/lineTo/strokeRect) under an EVEN device '
          'lineWidth; op sequence, call counts, matrices and reports unchanged')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
