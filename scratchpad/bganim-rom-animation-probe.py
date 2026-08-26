#!/usr/bin/env python3
"""Does a band authored in Aurora ANIMATE in a built ROM?

Run against a live `oracle-aether` serving the ROM built from the document you pass:

    oracle-aether <rom> --socket /run/user/1000/aurora-band.sock &
    python3 scratchpad/bganim-rom-animation-probe.py <editor_bg_override.json> [socket]

THREE TRAPS THIS PROBE EXISTS TO NOT FALL INTO — each yields a confident wrong verdict.

1. A CRC delta does not prove the band reached the ROM. The section expands into
   pre-existing $00 fill under aeon's `dac_banks` anchor, so the ROM file grows by a few
   dozen bytes while the section is ~8 KB — equally consistent with the banks blob being
   dropped. Confirm the SIZE separately (aeon's `tools/bganim_room.py --lst`), not here.

2. VRAM IS A COLUMN ROTATION OF A BANK, NOT A BANK. aeon's coarse two-piece bank DMA
   means band slot column j holds art column (j + c) mod cols at coarse step c; only at
   c == 0 does VRAM equal a bank verbatim. Checking "is VRAM one of the 8 banks" reports
   false misses most of the time and reads exactly like a dead band. The model is all
   `banks x cols` (bank, rotation) pairs.

3. A phase tile in the document is 64 PIXEL NIBBLES, row-major — NOT 32 packed bytes, and
   the nibble order is hi-then-lo. Decode it the other way and the art is "nowhere in
   VRAM", which looks exactly like a writer defect. THE CONTROL BELOW IS WHAT MAKES ANY
   VERDICT HERE TRUSTWORTHY: the STATIC tiles (past the band prefix) must be findable in
   VRAM under the same packing. If they are not, the packing is wrong and the probe says
   so instead of blaming the band.

ANTI-VACUOUS: the (bank, rotation) images must be mutually distinct, or "it matched" says
nothing. The probe refuses rather than reporting a green it cannot justify.
"""
import socket, json, sys, itertools

DOC = sys.argv[1]
SOCK = sys.argv[2] if len(sys.argv) > 2 else "/run/user/1000/aurora-band.sock"
BASE = 0x8000                      # BG_TILE_BASE_SLOT(1024) * 32 — the band is a PREFIX here
TILE_BYTES = 32

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.connect(SOCK)
f = s.makefile("rwb"); _id = itertools.count(1)
def call(m, p=None, notify=False):
    msg = {"jsonrpc": "2.0", "method": m}
    if p is not None: msg["params"] = p
    if not notify: msg["id"] = next(_id)
    f.write((json.dumps(msg) + "\n").encode()); f.flush()
    if notify: return None
    while True:
        line = f.readline()
        if not line: raise SystemExit("server closed the connection")
        r = json.loads(line)
        if "id" in r:
            if "error" in r: raise SystemExit(f"{m} -> {r['error']}")
            return r["result"]

init = call("initialize", {"clientCapabilities": {"events": True}})
call("initialized", {}, notify=True)          # subscription happens on the SECOND message
print(f"[handshake] {init.get('serverName')} — {len(init.get('methods', []))} methods")

def pack(tile):                                # nibbles -> 4bpp bytes, hi then lo
    return bytes(((tile[k] & 0xF) << 4) | (tile[k+1] & 0xF) for k in range(0, len(tile), 2))
def vram(addr, n):
    out = b""
    while n > 0:
        k = min(4096, n)
        out += bytes.fromhex(call("emulator/read_vram", {"addr": hex(addr + len(out)), "len": k})["bytes"][2:])
        n -= k
    return out

doc = json.load(open(DOC))
band = (doc.get("anims") or doc.get("bands"))[0]
COLS, ROWS, phases = band["cols"], band["rows"], band["phases"]
N = COLS * ROWS
print(f"[doc] band {COLS}x{ROWS} = {N} slots, {len(phases)} banks, driver={band.get('driver','<default>')}, "
      f"rate_shift={band.get('rate_shift','<default>')}")

call("emulator/run_frames", {"frames": 120})   # let the level come up

# ── CONTROL: establish the packing against tiles we KNOW are on screen ────────────
whole = vram(0, 0x10000)
static = doc["tiles"][N:N+40]
hits = sum(1 for t in static if whole.find(pack(t)) >= 0)
print(f"[control] {hits}/{len(static)} STATIC tiles found in VRAM under hi_lo packing")
if hits < len(static) * 0.9:
    raise SystemExit("[control] FAILED — the packing or the base is wrong. Fix the INSTRUMENT; "
                     "this says nothing about the band.")
first_static = whole.find(pack(doc["tiles"][N]))
print(f"[control] first static tile at VRAM 0x{first_static:04X}; band prefix expected at 0x{BASE:04X}"
      f" ({'consistent' if first_static == BASE + N*TILE_BYTES else 'INCONSISTENT'})")

# ── MODEL: every (bank, coarse rotation) pair ─────────────────────────────────────
exp = {}
for k, ph in enumerate(phases):
    for c in range(COLS):
        img = b"".join(pack(ph[((j + c) % COLS) * ROWS + r]) for j in range(COLS) for r in range(ROWS))
        exp.setdefault(img, []).append((k, c))
combos = len(phases) * COLS
print(f"[model] {len(phases)} banks x {COLS} rotations = {combos} combos -> {len(exp)} distinct images")
if len(exp) < combos:
    raise SystemExit("[model] VACUOUS: (bank, rotation) images collide — a match would prove nothing.")

seen = []
for n in range(28):
    reg = vram(BASE, N * TILE_BYTES)
    m = exp.get(reg)
    st = call("emulator/status")
    seen.append(m[0] if m else None)
    if n < 10 or m is None:
        print(f"  frame {st['frame']:6d} -> " + (f"(bank {m[0][0]}, rot {m[0][1]})" if m else "NO MATCH"))
    call("emulator/run_frames", {"frames": 3})

ok = [x for x in seen if x]
banks_seen = sorted({b for b, _ in ok}); rots_seen = sorted({c for _, c in ok})
print(f"\n[result] {len(seen)} samples, unmatched {seen.count(None)}")
print(f"  distinct banks visited     : {banks_seen}")
print(f"  distinct rotations visited : {rots_seen}")
moved = seen.count(None) == 0 and len(banks_seen) > 1
print("[verdict] BAND ANIMATES — every sample is art this editor authored" if moved
      else "[verdict] NOT PROVEN — see unmatched samples above")
sys.exit(0 if moved else 1)
