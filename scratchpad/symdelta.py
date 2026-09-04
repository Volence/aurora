#!/usr/bin/env python3
"""Which symbols MOVED between two listings, and by how much.

The ctrl->loop ROM diff is dominated by a downstream SHIFT, not by content, so
counting differing bytes answers the wrong question. This answers the right one:
what changed size, and what merely moved.
"""
import re, sys
from collections import Counter


def symbols(path):
    out = {}
    for m in re.finditer(r"^ ([A-Za-z_$][\w$.]*) : ([0-9A-Fa-f]+) ",
                         open(path, errors='replace').read(), re.M):
        out[m.group(1)] = int(m.group(2), 16)
    return out


a, b = symbols(sys.argv[1]), symbols(sys.argv[2])
common = sorted(set(a) & set(b), key=lambda k: a[k])
print(f'{len(a)} vs {len(b)} symbols; {len(common)} common; '
      f'only in A: {len(set(a)-set(b))}, only in B: {len(set(b)-set(a))}')
deltas = Counter(b[k] - a[k] for k in common)
print('shift histogram (delta -> count):', deltas.most_common(10))
prev = None
print('\nwhere the shift CHANGES (each row is a section whose size moved):')
for k in common:
    d = b[k] - a[k]
    if d != prev:
        print(f'  ${a[k]:06X} {k:44s} delta {d:+d}')
        prev = d
