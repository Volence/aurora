#!/usr/bin/env python3
"""The last link, on the SHIPPING document: a band PROMOTED on aeon's live
448/448 `editor_bg_override.json`, judged by aeon's own injector.

Items 20 and 23 ran `inject_editor_bg.main()` against an INSERTED band on the
b0e5a661 fixture (340 tiles, 108 free) -- a historical document. The promotion
parcel proved promotion works on the live file but exercised Aurora's writer
only. This joins the two and is the row the parcel tagged for the overseer.

  node_modules/.bin/esbuild scratchpad/bganim-promoted-vs-aeon-injector.emit.ts \
      --bundle --platform=node --format=cjs --outfile=<out>/emit.cjs
  R=$(git -C ../aeon ls-remote origin refs/heads/master | cut -f1)
  git -C ../aeon show "${R}:games/sonic4/data/editor_bg_override.json" > <out>/live-source.json
  node <out>/emit.cjs <out>/live-source.json <out>
  python3 scratchpad/bganim-promoted-vs-aeon-injector.py <out>

MEASURED (aeon @ 9b3f11f60def3dbad10fe69fff719ea92874d749):
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

aeon files load at an ls-remote-resolved revision, never the sibling working tree.
"""
import sys, importlib.util, pathlib, tempfile, struct, io, contextlib, shutil, subprocess, json

AEON_REV = "9b3f11f60def3dbad10fe69fff719ea92874d749"
sp = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
aeon = pathlib.Path(__file__).resolve().parents[2] / "aeon"
for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (sp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(aeon), "show", f"{AEON_REV}:{mod}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(sp))
from vram_map import BG_TILE_BASE_SLOT

def run(fn):
    spec = importlib.util.spec_from_file_location("inj", sp / "inject_editor_bg.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    out = pathlib.Path(tempfile.mkdtemp(prefix="pv-")); m.OVERRIDE, m.OUT_DIR = str(sp / fn), str(out)
    try:
        with contextlib.redirect_stdout(io.StringIO()): m.main()
    except AssertionError as e:
        shutil.rmtree(out, ignore_errors=True); return None, str(e).split("\n")[0][:100]
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

pre, pre_tbl = run("live-before.json")
new, new_tbl = run("live-promoted.json")
ok = True
if new is None:
    print(f"[**FAIL**] aeon REJECTED the promoted band: {new_tbl}"); sys.exit(1)
print(f"[PASS] aeon's injector ACCEPTED a band PROMOTED on its own live 448/448 document")
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
_anims = json.loads((sp / "live-promoted.json").read_text()).get("anims") or []
assert len(_anims) == 1, f"expected exactly one band in live-promoted.json, found {len(_anims)}"
_b = _anims[0]
exp = _b["cols"] * _b["rows"] * PHASE_BANKS * TILE_BYTES
got = sz(new, "bg_anim_banks.bin") - sz(pre, "bg_anim_banks.bin")
tdelta = sz(new, "bg_tiles.bin") - sz(pre, "bg_tiles.bin")
print(f"       banks delta expected cols*rows*BANKS*32 = {exp}; got {got} -> {'MATCH' if exp == got else '**MISMATCH**'}")
print(f"       tiles delta expected 0 (promotion adds NO tiles); got {tdelta} -> {'MATCH' if tdelta == 0 else '**MISMATCH**'}")
ok &= (exp == got and tdelta == 0)

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
print(f"\nVERDICT: picture {'IDENTICAL' if not diffs else '**CHANGED**'} across promotion, through aeon's own emitter, ON THE SHIPPING DOCUMENT.")
for d in (pre, new): shutil.rmtree(d, ignore_errors=True)
print("RESULT:", "all rows as expected" if ok else "SOME ROWS FAILED")
sys.exit(0 if ok else 1)
