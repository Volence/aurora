#!/usr/bin/env python3
"""Read a REAL shipped loop's per-path solidity out of a donor chunk map.

Ground truth for the question the anchor's §3.3 answers by example: in a working
loop, WHICH 16px cells are solid on which collision path. Nothing here is
invented — the chunk map is the donor's own blob, decompressed with aeon's
`load_chunk_map` at the pinned revision, and the word layout is `bake_cell`'s
documented one (bits 9:0 block id, 10 xflip, 11 yflip, 13:12 path-A solidity,
15:14 path-B solidity).
"""
import sys, os

AEON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'suite', 'aeon')
sys.path.insert(0, os.path.join(AEON, 'tools'))
from ojz_common import load_chunk_map, kos_decompress  # noqa: E402

SRC = sys.argv[1]
SKIP = int(os.environ.get('SKIP', '0'))
try:
    chunks = load_chunk_map(SRC)
except Exception as e:                       # noqa: BLE001
    print('load_chunk_map failed:', e)
    chunks = []
if not chunks or len(chunks) < 2:
    raw = open(SRC, 'rb').read()
    dec, end = kos_decompress(raw, SKIP)
    print(f'raw kos from offset {SKIP}: {len(dec)} B, ended at {end} of {len(raw)}')
    chunks = [[(dec[i * 128 + j * 2] << 8) | dec[i * 128 + j * 2 + 1] for j in range(64)]
              for i in range(len(dec) // 128)]
print(f'{SRC}: {len(chunks)} chunks')


def solA(x):
    return (x >> 12) & 3


def solB(x):
    return (x >> 14) & 3


scored = []
for ch, words in enumerate(chunks):
    diff = sum(1 for x in words if (solA(x) != 0) != (solB(x) != 0))
    if diff:
        scored.append((diff, ch))
scored.sort(reverse=True)
print('chunks by path-disagreement (top 12):', scored[:12])

want = [int(a) for a in sys.argv[2:]] or [c for _, c in scored[:4]]
for ch in want:
    words = chunks[ch]
    print(f'\n=== chunk ${ch:02X} ({ch}) ===  A=path-A only  B=path-B only  X=both  .=neither')
    for r in range(8):
        a = ''
        ids = []
        for c in range(8):
            x = words[r * 8 + c]
            sa, sb = solA(x) != 0, solB(x) != 0
            a += 'X' if (sa and sb) else 'A' if sa else 'B' if sb else '.'
            ids.append(f'{x & 0x3FF:3d}{"x" if x & 0x400 else " "}{"y" if x & 0x800 else " "}'
                       f'/{solA(x)}{solB(x)}')
        print(f'  {a}    ' + ' '.join(ids))
