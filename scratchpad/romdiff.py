#!/usr/bin/env python3
"""Attribute every differing ROM byte to a symbol, from THIS build's own listing.

usage: romdiff.py <ctrl.bin> <loop.bin> <ctrl.lst> [<loop.lst>]
Symbol addresses are matched on the symbol NAME in the listing's symbol table,
never on a line number.
"""
import re, sys, zlib

ctrl_bin, loop_bin, ctrl_lst = sys.argv[1], sys.argv[2], sys.argv[3]
loop_lst = sys.argv[4] if len(sys.argv) > 4 else ctrl_lst
A = open(ctrl_bin, 'rb').read()
B = open(loop_bin, 'rb').read()
print(f'ctrl {len(A)} B crc32={zlib.crc32(A) & 0xffffffff:08x}')
print(f'loop {len(B)} B crc32={zlib.crc32(B) & 0xffffffff:08x}')
if len(A) != len(B):
    print(f'LENGTHS DIFFER by {len(B) - len(A)} bytes')
n = min(len(A), len(B))
diff = [i for i in range(n) if A[i] != B[i]]
print(f'{len(diff)} differing bytes over the common {n}')


def symbols(path):
    out = []
    txt = open(path, 'r', errors='replace').read()
    for m in re.finditer(r"^ ([A-Za-z_$][\w$.]*) : ([0-9A-Fa-f]+) ", txt, re.M):
        try:
            out.append((int(m.group(2), 16), m.group(1)))
        except ValueError:
            pass
    out.sort()
    return out


syms = symbols(ctrl_lst)
print(f'{len(syms)} symbol rows parsed from {ctrl_lst}')


def owner(addr):
    lo, hi, best = 0, len(syms) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        if syms[mid][0] <= addr:
            best = syms[mid]; lo = mid + 1
        else:
            hi = mid - 1
    return best


buckets = {}
for i in diff:
    o = owner(i)
    k = (o[1], o[0]) if o else ('<before first symbol>', 0)
    buckets.setdefault(k, []).append(i)
print('\nbytes moved, by owning symbol:')
for (name, addr), idx in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
    print(f'  {name:32s} ${addr:06X}  {len(idx):6d} bytes   first ${idx[0]:06X}')

# CrossoverTable specifically, if the listing names it.
for addr, name in syms:
    if name == 'CrossoverTable':
        print(f'\nCrossoverTable @ ${addr:06X}:')
        ca = A[addr:addr + 256]
        cb = B[addr:addr + 256]
        print(f'  control  non-zero slots: {[(i, v) for i, v in enumerate(ca) if v]}')
        print(f'  loop     non-zero slots: {[(i, v) for i, v in enumerate(cb) if v]}')
        break
