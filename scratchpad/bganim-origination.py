#!/usr/bin/env python3
"""ORIGINATION proof: a band Aurora INVENTED, judged by aeon's injection path.

Closes the limit the round-trip probe (bganim-writer-vs-aeon-gate) could not:
there, every band came from aeon-generated content that already satisfied every
invariant. Here Aurora's own add-band command composes a band that has never
existed -- 8x4, timer-driven, non-zero art in all 8 banks -- and aeon judges it.

  node_modules/.bin/esbuild scratchpad/bganim-origination.emit.ts \
      --bundle --platform=node --format=cjs --outfile=<out>/orig.cjs
  node <out>/orig.cjs <out>
  python3 scratchpad/bganim-origination.py <out>

WHAT IT PROVES
  A. aeon's inject_editor_bg.main() ACCEPTS an Aurora-originated band.
     BgAnim_Table goes 2 -> 3.
  B. Both artifact deltas match values DERIVED from the band's geometry, not
     typed in: banks +cols*rows*BANKS*32 B, tiles +cols*rows*32 B.
  C. IMAGE INVARIANCE AT THE ARTIFACT LEVEL. Every one of the 4096 nametable
     cells is resolved through to (attrs, tile bytes) in both the before and
     after artifacts and compared. 1536 raw words change -- the indices move --
     and ZERO resolved cells differ. This is stronger than the unit test, which
     asserts invariance on the document; this asserts it on what aeon emitted.

WHAT IT STILL DOES NOT PROVE
  * NO BUILD, NO ROM. Nothing assembles the emitted .emp. The band has never
    run on hardware or in an emulator.
  * NO STALENESS GATE. Writing the real file trips it by construction --
    editor_bg_override.json is literally in level_staleness.editor_sources().
    See docs/OVERSEER.md; attribute by stage before reading a failure as a
    verdict on the bytes.

aeon files load at an ls-remote-resolved revision, never the sibling working
tree. Pinned at: 427dd1112d44e80a58227d932c7e260a91bda07c
"""
import sys, importlib.util, pathlib, tempfile, struct, io, contextlib, shutil, subprocess

AEON_REV = "427dd1112d44e80a58227d932c7e260a91bda07c"
sp = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
aeon = pathlib.Path(__file__).resolve().parents[2] / "aeon"
for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (sp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(aeon), "show", f"{AEON_REV}:{mod}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(sp))
from vram_map import BG_TILE_BASE_SLOT          # DERIVED from aeon, never typed

def run(fn):
    spec = importlib.util.spec_from_file_location("inj", sp / "inject_editor_bg.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    out = pathlib.Path(tempfile.mkdtemp(prefix="orig-")); m.OVERRIDE, m.OUT_DIR = str(sp / fn), str(out)
    try:
        with contextlib.redirect_stdout(io.StringIO()) as cap: m.main()
    except AssertionError as e:
        shutil.rmtree(out, ignore_errors=True); return None, str(e).split("\n")[0][:100], ""
    emp = (out / "bg_anim.emp").read_text()
    return out, next(l.strip() for l in emp.splitlines() if "BgAnim_Table" in l), cap.getvalue().strip()

def resolve(d):
    """Every nametable cell -> (attrs, tile bytes): the RENDERED picture."""
    nt = (d / "zone_bg.bin").read_bytes(); raw = (d / "bg_tiles.bin").read_bytes()
    ln, = struct.unpack_from(">H", raw, 0); blob = raw[2:2 + ln]
    cells = []
    for i in range(len(nt) // 2):
        w, = struct.unpack_from(">H", nt, i * 2)
        if w == 0: cells.append((0, b"BLANK")); continue
        idx = (w & 0x7FF) - BG_TILE_BASE_SLOT
        cells.append((w & ~0x7FF, blob[idx * 32:(idx + 1) * 32]))
    return cells

pre, pre_tbl, pre_log = run("pre-origination.json")
new, new_tbl, new_log = run("originated.json")
ok = True
if new is None:
    print(f"[**FAIL**] aeon REJECTED Aurora's originated band: {new_tbl}"); sys.exit(1)
print(f"[PASS] aeon ACCEPTED a band Aurora invented\n       before: {pre_tbl}\n       after : {new_tbl}")
if "= 3" not in new_tbl: print("       **VACUOUS: band did not reach the emit**"); ok = False

COLS, ROWS, BANKS, TB = 8, 4, 8, 32
for f, exp in (("bg_anim_banks.bin", COLS * ROWS * BANKS * TB), ("bg_tiles.bin", COLS * ROWS * TB)):
    got = (new / f).stat().st_size - (pre / f).stat().st_size
    ok &= (got == exp)
    print(f"       {f:20} delta {got:+6}  expected {exp:+6} (derived from geometry)  "
          f"{'MATCH' if got == exp else '**MISMATCH**'}")

a, b = resolve(pre), resolve(new)
nonblank = sum(1 for _, t in a if t != b"BLANK"); distinct = len({t for _, t in a if t != b"BLANK"})
print(f"\n[anti-vacuous] {nonblank}/{len(a)} cells draw a tile, {distinct} distinct tile images")
if not (nonblank and distinct > 1): print("       **VACUOUS**"); ok = False
words = sum(1 for i in range(len(a))
            if struct.unpack_from(">H", (pre / "zone_bg.bin").read_bytes(), i * 2)
            != struct.unpack_from(">H", (new / "zone_bg.bin").read_bytes(), i * 2))
diffs = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
ok &= (not diffs)
print(f"       raw nametable words differ : {words} cells   (indices moved -- expected)")
print(f"       RESOLVED attrs+tile bytes  : {len(diffs)} cells")
print(f"\nVERDICT: rendered picture is {'IDENTICAL' if not diffs else '**CHANGED**'} "
      f"across Aurora originating a band, measured through aeon's emitted artifacts.")
for d in (pre, new): shutil.rmtree(d, ignore_errors=True)
print("\nRESULT:", "all rows as expected" if ok else "SOME ROWS FAILED")
sys.exit(0 if ok else 1)
