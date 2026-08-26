#!/usr/bin/env python3
"""The last link, on a REAL aeon document: a band authored by Aurora, judged by
aeon's own injector (`inject_editor_bg.main()`).

Items 20 and 23 ran the injector against an INSERTED band on the b0e5a661
fixture (340 tiles, 108 free) -- a historical document. Item 27 proved
PROMOTION works on the live 448/448 file but exercised Aurora's writer only;
this probe joined the two (the row item 27 tagged for the overseer). ROADMAP
item 24 generalised it: `--after <name>` picks the authored document, and the
expected `bg_tiles.bin` delta is DERIVED from the two documents' tile counts
rather than assumed zero -- so the same probe judges a PROMOTED band (delta 0)
and an INSERTED band on a roomy document (delta cols*rows*TILE_BYTES).

  node_modules/.bin/esbuild scratchpad/bganim-promoted-vs-aeon-injector.emit.ts \
      --bundle --platform=node --format=cjs --outfile=<out>/emit.cjs
  # promote (live, full):
  R=$(git -C ../aeon ls-remote origin refs/heads/master | cut -f1)
  git -C ../aeon show "${R}:games/sonic4/data/editor_bg_override.json" > <out>/live-source.json
  node <out>/emit.cjs <out>/live-source.json <out>
  python3 scratchpad/bganim-promoted-vs-aeon-injector.py <out>
  # insert (roomy) -- model-authored:
  node <out>/emit.cjs test/fixtures/bg-override/editor_bg_override.roomy.json <out> --insert
  python3 scratchpad/bganim-promoted-vs-aeon-injector.py <out> --after live-inserted.json
  # insert (roomy) -- UI-authored, from scratchpad/bganim-insert-roomy-harness.mjs's EMIT_DIR:
  python3 scratchpad/bganim-promoted-vs-aeon-injector.py scratchpad/item24-emit --after live-inserted.json

MEASURED (aeon @ 9b3f11f60def3dbad10fe69fff719ea92874d749, promotion):
  * aeon's injector ACCEPTS a band promoted on its own live document.
    BgAnim_Table goes from the disabled stub (band_count = 0, which the ROM has
    carried since dd93a840 on 2026-07-21) to `u16 = 1`.
  * bg_anim_banks.bin 0 -> 8192 B = cols*rows*BANKS*32, DERIVED from geometry.
    FOOTNOTE: that 0 is what the injector emits into THIS probe's clean tempdir,
    and it matches what reaches the ROM (the disabled stub emits Data.empty).
    It is NOT aeon's tree, where the file is 49,152 B of stale banks -- the
    injector writes it only inside `if anims:`, so the stub path leaves whatever
    was there. Known and deliberate on their side: it is in verify_level_bin.py's
    _ORPHAN_ALLOWLIST with a reason, because that checker walks embed->file and
    never file->embed. Expect the apparent contradiction the first time a real
    promotion writes that file.
  * bg_tiles.bin delta ZERO. Promotion adds no tiles -- the entire reason it
    exists, since insertBand cannot touch a 448/448 document at any band size.
  * IMAGE INVARIANCE on aeon's emitted artifacts: 2464 raw nametable words
    differ (the indices move) and ZERO resolved (attrs, tile bytes) cells do.
  * Anti-vacuous: the emit is refused if the source is not full or already
    carries bands, and 4096/4096 cells draw across 448 distinct tile images.

STILL NOT PROVEN: no build, no ROM, no staleness gate. Nothing assembles the
emitted .emp and the band has never run. Writing the real file trips the
staleness gate BY CONSTRUCTION (docs/OVERSEER.md) -- attribute by stage.

aeon files load at a pinned revision (AEON_REV, env-overridable), never the
sibling working tree.
"""
import sys, os, importlib.util, pathlib, tempfile, struct, io, contextlib, shutil, subprocess, json, argparse

ap = argparse.ArgumentParser()
ap.add_argument("out", nargs="?", default=".")
ap.add_argument("--before", default="live-before.json")
ap.add_argument("--after", default="live-promoted.json",
                help="the authored document: live-promoted.json (default) or live-inserted.json")
args = ap.parse_args()

AEON_REV = os.environ.get("AEON_REV", "9b3f11f60def3dbad10fe69fff719ea92874d749")
sp = pathlib.Path(args.out)
aeon = pathlib.Path(os.environ.get("AEON_DIR", pathlib.Path(__file__).resolve().parents[2] / "aeon"))
for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (sp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(aeon), "show", f"{AEON_REV}:{mod}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(sp))
from vram_map import BG_TILE_BASE_SLOT
print(f"[aeon] injector + vram_map read at {AEON_REV}; before={args.before} after={args.after}")

def run(fn):
    spec = importlib.util.spec_from_file_location("inj", sp / "inject_editor_bg.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    out = pathlib.Path(tempfile.mkdtemp(prefix="pv-")); m.OVERRIDE, m.OUT_DIR = str(sp / fn), str(out)
    try:
        with contextlib.redirect_stdout(io.StringIO()): m.main()
    except (AssertionError, SystemExit) as e:
        shutil.rmtree(out, ignore_errors=True); return None, str(e).split("\n")[0][:160]
    emp = (out / "bg_anim.emp").read_text() if (out / "bg_anim.emp").exists() else ""
    return out, next((l.strip() for l in emp.splitlines() if "BgAnim_Table" in l), "NO TABLE")

def resolve(d):
    nt = (d / "zone_bg.bin").read_bytes(); raw = (d / "bg_tiles.bin").read_bytes()
    ln, = struct.unpack_from(">H", raw, 0); blob = raw[2:2 + ln]; cells = []
    for i in range(len(nt) // 2):
        w, = struct.unpack_from(">H", nt, i * 2)
        if w == 0: cells.append((0, b"BLANK")); continue
        idx = (w & 0x7FF) - BG_TILE_BASE_SLOT
        cells.append((w & ~0x7FF, blob[idx * 32:(idx + 1) * 32]))
    return cells

pre, pre_tbl = run(args.before)
if pre is None:
    print(f"[**FAIL**] aeon REJECTED the BEFORE document ({args.before}): {pre_tbl}"); sys.exit(1)
new, new_tbl = run(args.after)
ok = True
if new is None:
    print(f"[**FAIL**] aeon REJECTED the authored band ({args.after}): {new_tbl}"); sys.exit(1)
before_doc = json.loads((sp / args.before).read_text())
after_doc = json.loads((sp / args.after).read_text())
mode = "INSERTED" if len(after_doc["tiles"]) != len(before_doc["tiles"]) else "PROMOTED"
print(f"[PASS] aeon's injector ACCEPTED a band {mode} on a real document "
      f"({len(before_doc['tiles'])} -> {len(after_doc['tiles'])} tiles)")
print(f"       before: {pre_tbl}\n       after : {new_tbl}")
if "= 1" not in new_tbl: print("       **VACUOUS: no band reached the emit**"); ok = False

def sz(d, n): return (d / n).stat().st_size if (d / n).exists() else 0
# DERIVED FROM THE BAND UNDER TEST, NOT TYPED IN. This was `8 * 4 * 8 * 32` --
# the geometry of the band THIS probe's own emit.ts happens to make -- which
# silently reported **MISMATCH** for every correct band of any other size. Found
# 2026-08-24 by ROADMAP item 29, whose UI-authored band is 2x1: the injector
# emitted exactly 512 B and the probe called it a mismatch against 8192.
# The constants come from the vendored consumer contract, so they cannot drift
# from the thing they describe.
_contract = json.loads((pathlib.Path(__file__).resolve().parents[1]
                        / "src/core/formats/bg-override/bganim-consumer-contract.json").read_text())
PHASE_BANKS = _contract["constants"]["BGANIM_PHASE_BANKS"]["value"]
TILE_BYTES = _contract["constants"]["TILE_BYTES"]["value"]
_anims = after_doc.get("anims") or []
assert len(_anims) == 1, f"expected exactly one band in {args.after}, found {len(_anims)}"
_b = _anims[0]
exp = _b["cols"] * _b["rows"] * PHASE_BANKS * TILE_BYTES
got = sz(new, "bg_anim_banks.bin") - sz(pre, "bg_anim_banks.bin")
# The tiles delta is what the two DOCUMENTS say it should be: promotion moves
# art (0), insertion adds cols*rows tiles of TILE_BYTES each.
texp = (len(after_doc["tiles"]) - len(before_doc["tiles"])) * TILE_BYTES
if mode == "INSERTED" and texp != _b["cols"] * _b["rows"] * TILE_BYTES:
    print(f"       **the blob grew by {texp // TILE_BYTES} tiles but the band has {_b['cols'] * _b['rows']}**"); ok = False
tdelta = sz(new, "bg_tiles.bin") - sz(pre, "bg_tiles.bin")
print(f"       banks delta expected cols*rows*BANKS*32 = {exp}; got {got} -> {'MATCH' if exp == got else '**MISMATCH**'}")
print(f"       tiles delta expected (after.tiles - before.tiles)*{TILE_BYTES} = {texp} ({mode}); got {tdelta} -> {'MATCH' if tdelta == texp else '**MISMATCH**'}")
ok &= (exp == got and tdelta == texp)

a, b = resolve(pre), resolve(new)
nonblank = sum(1 for _, t in a if t != b"BLANK"); distinct = len({t for _, t in a if t != b"BLANK"})
print(f"\n[anti-vacuous] {nonblank}/{len(a)} cells draw a tile, {distinct} distinct images")
ok &= (nonblank > 0 and distinct > 1)
words = sum(1 for i in range(len(a))
            if struct.unpack_from(">H", (pre / "zone_bg.bin").read_bytes(), i * 2)
            != struct.unpack_from(">H", (new / "zone_bg.bin").read_bytes(), i * 2))
diffs = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
ok &= (not diffs)
print(f"       raw nametable words differ : {words}\n       RESOLVED attrs+tile bytes  : {len(diffs)}")
print(f"\nVERDICT: picture {'IDENTICAL' if not diffs else '**CHANGED**'} across the {mode} band, through aeon's own emitter.")
for d in (pre, new): shutil.rmtree(d, ignore_errors=True)
print("RESULT:", "all rows as expected" if ok else "SOME ROWS FAILED")
sys.exit(0 if ok else 1)
