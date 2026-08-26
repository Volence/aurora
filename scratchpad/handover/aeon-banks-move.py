#!/usr/bin/env python3
"""DOES THE BAND MOVE — measured on AEON'S OWN EMITTED BYTES, not on Aurora's JSON.

The composition probe (bganim-promoted-vs-aeon-injector.py) proves aeon's
injector ACCEPTS the band and that the picture AT REST is unchanged. Neither of
those can distinguish a band that moves from one that does not: a `copy`-filled
band passes every row of it. `copy` is the panel's DEFAULT, so "validates
perfectly and is visually inert" is the failure mode this file exists for.

So: run aeon's injector at a PINNED revision, read the `bg_anim_banks.bin` it
wrote, and check that bank k is bank 0 rolled k pixels left — in the PACKED 4bpp
bytes the ROM actually DMAs, decoded independently here.

⚠ TWO DIFFERENT ENCODINGS, AND CONFUSING THEM COSTS A DAY.
   * A phase tile in `editor_bg_override.json` is 64 PIXEL NIBBLES, row-major —
     one array entry per pixel. Decode it the packed way and every bank reads as
     broken in a way that looks exactly like a writer defect.
   * A tile in `bg_anim_banks.bin` IS packed: 32 bytes, 8 rows x 4 bytes, high
     nibble = even pixel (inject_editor_bg.py `(hi << 4) | lo`).
   This file reads the SECOND one, which is why it unpacks. That is deliberate,
   and it is also what makes it an INDEPENDENT instrument: it never touches the
   JSON the harness already judged.

  python3 scratchpad/handover/aeon-banks-move.py <doc.json> [--rev SHA]
  python3 scratchpad/handover/aeon-banks-move.py <doc.json> --plant-copy

`--plant-copy` rewrites banks 1..7 as copies of bank 0 before baking — the
red-first proof that this probe can tell an inert band from a moving one. It is
exactly the document the panel's DEFAULT fill produces, so the plant is not a
hypothetical.
"""
import argparse, contextlib, importlib.util, io, json, os, pathlib, re, shutil, subprocess, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument("doc")
ap.add_argument("--rev", default=None)
ap.add_argument("--plant-copy", action="store_true",
                help="RED-FIRST: bake banks 1..7 as copies of bank 0 and expect this probe to fail")
args = ap.parse_args()

AEON = pathlib.Path(os.environ.get("AEON_DIR", "/home/volence/sonic_hacks/aeon"))
REV = args.rev or subprocess.run(
    ["git", "-C", str(AEON), "ls-remote", "origin", "refs/heads/master"],
    capture_output=True, check=True, text=True).stdout.split("\t")[0].strip()

tmp = pathlib.Path(tempfile.mkdtemp(prefix="banks-move-"))
for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (tmp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(AEON), "show", f"{REV}:{mod}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(tmp))

doc = json.loads(pathlib.Path(args.doc).read_text())
if args.plant_copy:
    for a in doc["anims"]:
        a["phases"] = [[list(t) for t in a["phases"][0]] for _ in a["phases"]]
src = tmp / "doc.json"
src.write_text(json.dumps(doc))

spec = importlib.util.spec_from_file_location("inj", tmp / "inject_editor_bg.py")
inj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inj)
out = pathlib.Path(tempfile.mkdtemp(prefix="banks-out-"))
inj.OVERRIDE, inj.OUT_DIR = str(src), str(out)
with contextlib.redirect_stdout(io.StringIO()):
    inj.main()

banks = (out / "bg_anim_banks.bin").read_bytes()
emp = (out / "bg_anim.emp").read_text()
anim = doc["anims"][0]
COLS, ROWS = anim["cols"], anim["rows"]
N, PHASES = COLS * ROWS, len(anim["phases"])
TILE_BYTES, TILE_W = inj.BGANIM_TILE_BYTES, 8

print(f"[aeon] tools/inject_editor_bg.py read at {REV}"
      + ("" if args.rev else "  (RESOLVED from origin/master this run)"))
print(f"[emit] bg_anim_banks.bin = {len(banks)} B "
      f"(expected {N}x{PHASES}x{TILE_BYTES} = {N * PHASES * TILE_BYTES})"
      + ("   **PLANTED: banks 1..7 replaced with copies of bank 0**" if args.plant_copy else ""))
ok = len(banks) == N * PHASES * TILE_BYTES

# ── the band table aeon emitted, which is what the ROM reads at runtime ──
hdr = re.search(r"_BgAnim_Band0_hdr: \[u16; 6\] = \[([^\]]+)\]", emp)
fields = [f.strip() for f in hdr.group(1).split(",")]
names = ["driver", "rate_shift", "step_mask", "col_shift", "tile_count", "vram_dest"]
tbl = dict(zip(names, fields))
DRIVERS = {"camera_x": 0, "camera_y": 1, "timer": 2}
want_driver = DRIVERS[anim.get("driver", "camera_x")]
# The rate_shift DEFAULT is read out of aeon's own source line, never typed here:
# Aurora's UI has no rate_shift control, so an absent key is the normal case and
# this number is the one the ROM will actually use.
AEON_RATE_DEFAULT = int(re.search(r"a\.get\('rate_shift',\s*(\d+)\)",
                                  (tmp / "inject_editor_bg.py").read_text()).group(1))
want_rate = anim.get("rate_shift", AEON_RATE_DEFAULT)
col_bytes = ROWS * TILE_BYTES
print(f"[emit] band table: " + "  ".join(f"{k}={v}" for k, v in tbl.items()))
tbl_ok = (int(tbl["driver"]) == want_driver
          and int(tbl["rate_shift"]) == want_rate
          and int(tbl["step_mask"]) == anim["pattern_px"] - 1
          and (1 << int(tbl["col_shift"])) == col_bytes
          and int(tbl["tile_count"]) == N)
print(f"[emit] table matches the authored band "
      f"(driver {anim.get('driver', 'camera_x')}={want_driver}, rate_shift {want_rate}"
      f"{' — DEFAULT, the key is absent from the document' if 'rate_shift' not in anim else ''}, "
      f"step_mask {anim['pattern_px'] - 1}, col_shift log2({col_bytes}), tile_count {N})"
      f" -> {'MATCH' if tbl_ok else '**MISMATCH**'}")
ok &= tbl_ok

# ── unpack the emitted 4bpp bytes into a pixel grid, per bank ─────────────
def bank_grid(k):
    base = k * N * TILE_BYTES
    w, h = COLS * TILE_W, ROWS * TILE_W
    grid = [[0] * w for _ in range(h)]
    for col in range(COLS):
        for r in range(ROWS):
            off = base + (col * ROWS + r) * TILE_BYTES     # slots are COLUMN-MAJOR
            for row in range(TILE_W):
                for byte in range(4):
                    b = banks[off + row * 4 + byte]
                    grid[r * TILE_W + row][col * TILE_W + byte * 2] = (b >> 4) & 0xF
                    grid[r * TILE_W + row][col * TILE_W + byte * 2 + 1] = b & 0xF
    return grid

g0 = bank_grid(0)
W = len(g0[0])
rolled_ok, differs = [], []
for k in range(PHASES):
    want = [[line[(x + k) % W] for x in range(W)] for line in g0]
    rolled_ok.append(bank_grid(k) == want)
    differs.append(k > 0 and bank_grid(k) != g0)
print(f"\n[motion] pattern is {W}px wide; bank k must equal bank 0 rolled k px LEFT")
print("[motion] " + "  ".join(f"bank{k}:{'roll-ok' if rolled_ok[k] else 'MISMATCH'}" for k in range(PHASES)))
print(f"[motion] banks 1..{PHASES - 1} differing from bank 0: "
      f"{[k for k in range(1, PHASES) if differs[k]] or 'NONE — the band is INERT'}")
ok &= all(rolled_ok) and any(differs)

for d in (tmp, out):
    shutil.rmtree(d, ignore_errors=True)
if args.plant_copy:
    good = not ok
    print(f"\nRESULT: {'RED AS EXPECTED — a copy-filled band is caught' if good else '**THE PLANT PASSED: this probe cannot tell an inert band from a moving one**'}")
    sys.exit(0 if good else 1)
print(f"\nRESULT: {'THE BAND MOVES — proven on the bytes aeon emits' if ok else '**SOME ROWS FAILED**'}")
sys.exit(0 if ok else 1)
