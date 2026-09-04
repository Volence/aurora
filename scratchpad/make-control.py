#!/usr/bin/env python3
"""Materialise the loop tree and the CONTROL tree, and CHECK the control's
derivation rather than asserting it.

The control is O47's control (docs/reviews/2026-09-03-o47-crossover-rom-arrow.md
§4): the painted files with bits 15:14 MASKED OFF, not a plain archive. That
matters here for the same reason it did there and more so — this parcel authors
a whole loop's GEOMETRY, and a plain-archive control would fold that geometry
into the diff. Masking makes the two trees differ in the crossover field and
NOTHING ELSE.
"""
import os, struct, sys

S = os.path.dirname(os.path.abspath(__file__))
REL_A = 'games/sonic4/data/editor/ojz/act1/section_0.collattr.bin'
REL_B = 'games/sonic4/data/editor/ojz/act1/section_0.collattrb.bin'
XOVER_BITS = 0xC000            # CROSSOVER_VALUE_MASK << CROSSOVER_SHIFT


def words(p):
    b = open(p, 'rb').read()
    return list(struct.unpack('>%dH' % (len(b) // 2), b))


def write(p, w):
    open(p, 'wb').write(struct.pack('>%dH' % len(w), *w))


base = f'{S}/suite/aeon'
loop = f'{S}/suite-loop-aeon'
ctrl = f'{S}/suite-ctrl-aeon'

painted = {'A': words(f'{S}/painted/A.bin'), 'B': words(f'{S}/painted/B.bin')}
shipped = {'A': words(f'{base}/{REL_A}'), 'B': words(f'{base}/{REL_B}')}
masked = {k: [w & ~XOVER_BITS for w in v] for k, v in painted.items()}

for plane, rel in (('A', REL_A), ('B', REL_B)):
    write(f'{loop}/{rel}', painted[plane])
    write(f'{ctrl}/{rel}', masked[plane])

print('DERIVATION OF THE CONTROL, checked rather than asserted:')
for plane in ('A', 'B'):
    p, m, s = painted[plane], masked[plane], shipped[plane]
    d_pm = [i for i in range(len(p)) if p[i] != m[i]]
    d_ms = [i for i in range(len(m)) if m[i] != s[i]]
    d_ps = [i for i in range(len(p)) if p[i] != s[i]]
    only_x = all((p[i] & ~XOVER_BITS) == (m[i] & ~XOVER_BITS) for i in d_pm)
    print(f'  plane {plane}: painted vs control = {len(d_pm):4d} word(s)  '
          f'(all differ ONLY in bits 15:14: {only_x})')
    print(f'           control vs SHIPPED @75da5e1c = {len(d_ms):4d} word(s) '
          f'-- the loop GEOMETRY, present on BOTH sides')
    print(f'           painted vs SHIPPED           = {len(d_ps):4d} word(s)')
    if d_pm:
        print(f'           marked word indices: {d_pm}')

# The single most important line: the ONLY thing the two build inputs disagree
# about is the crossover field.
for plane in ('A', 'B'):
    for i in range(len(painted[plane])):
        assert (painted[plane][i] & ~XOVER_BITS) == (masked[plane][i] & ~XOVER_BITS), (plane, i)
print('  ASSERTED: loop tree and control tree agree on every non-crossover bit '
      'of every one of %d words in both planes.' % len(painted['A']))
