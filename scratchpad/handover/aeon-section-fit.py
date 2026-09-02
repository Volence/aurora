#!/usr/bin/env python3
"""Does the handover band FIT aeon's `ojz_bg_anim` section, by AEON'S OWN ARITHMETIC?

The section byte count is not something Aurora may assert. It comes from aeon's
`tools/inject_editor_bg.py` — `bganim_section_bytes(n_bands, total_slots)` and
`BGANIM_SECTION_CEILING` — read at a PINNED REVISION and CALLED, never copied
here as a number. `check_bganim_section_fits` is aeon's own refusal gate; this
script is a caller of it, not a reimplementation of it.

  python3 scratchpad/handover/aeon-section-fit.py <doc.json> [--rev SHA]
  python3 scratchpad/handover/aeon-section-fit.py <doc.json> --plant-slots 40

`--plant-slots N` replaces the band's geometry with an N-slot band and expects
aeon's gate to REFUSE — the red-first proof that a green verdict on the real
band means something. Choose an N over the ceiling for the run to be a proof.
`--rev` defaults to the RESOLVED pushed master, never a constant: a built-in
default revision is how the item-27 probe silently certified against a
months-old injector.
"""
import argparse, importlib.util, json, os, pathlib, subprocess, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument("doc")
ap.add_argument("--rev", default=None, help="aeon revision (default: resolved origin/master)")
ap.add_argument("--plant-slots", type=int, default=None,
                help="RED-FIRST: pretend the band covers this many slots and expect a refusal")
args = ap.parse_args()

import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "lib"))
from suite_paths import sibling_path   # the suite's 4-step precedence, one derivation
AEON = sibling_path('aeon')   # honours AEON_DIR / LIVE_AEON, then EMPYREAN_SUITE_ROOT;
                              # the parents[2] guess it replaces was wrong from a worktree
REV = args.rev or subprocess.run(
    ["git", "-C", str(AEON), "ls-remote", "origin", "refs/heads/master"],
    capture_output=True, check=True, text=True).stdout.split("\t")[0].strip()

tmp = pathlib.Path(tempfile.mkdtemp(prefix="section-fit-"))
for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (tmp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(AEON), "show", f"{REV}:{mod}"], capture_output=True, check=True).stdout)
sys.path.insert(0, str(tmp))
spec = importlib.util.spec_from_file_location("inj", tmp / "inject_editor_bg.py")
inj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inj)

doc = json.loads(pathlib.Path(args.doc).read_text())
anims = doc.get("anims") or []
if args.plant_slots is not None:
    anims = [dict(anims[0] if anims else {"cols": 1, "rows": 1},
                  cols=args.plant_slots, rows=1)]

n_bands = len(anims)
slots = sum(a["cols"] * a["rows"] for a in anims)
size = inj.bganim_section_bytes(n_bands, slots)
ceiling = inj.BGANIM_SECTION_CEILING
fits_slots = max(0, (ceiling - inj.BGANIM_COUNT_BYTES
                     - inj.BGANIM_RECORD_BYTES * max(1, n_bands)) // inj.BGANIM_BYTES_PER_SLOT)

print(f"[aeon] tools/inject_editor_bg.py read at {REV}"
      + ("" if args.rev else "  (RESOLVED from origin/master this run)"))
print(f"[aeon] BGANIM_COUNT_BYTES={inj.BGANIM_COUNT_BYTES}  "
      f"BGANIM_RECORD_BYTES={inj.BGANIM_RECORD_BYTES}  "
      f"BGANIM_PHASES={inj.BGANIM_PHASES}  BGANIM_TILE_BYTES={inj.BGANIM_TILE_BYTES}  "
      f"BGANIM_BYTES_PER_SLOT={inj.BGANIM_BYTES_PER_SLOT}")
print(f"[aeon] BGANIM_MAX_BANDS={inj.BGANIM_MAX_BANDS}  "
      f"BGANIM_SECTION_CEILING={ceiling}  BGANIM_WORST_CASE_BYTES={inj.BGANIM_WORST_CASE_BYTES}")
print(f"[band] {n_bands} band(s), {slots} slots"
      + (f"  **PLANTED, not the real band**" if args.plant_slots is not None else "")
      + f"  -> ojz_bg_anim = {inj.BGANIM_COUNT_BYTES} + {inj.BGANIM_RECORD_BYTES}x{n_bands} "
        f"+ {slots}x{inj.BGANIM_BYTES_PER_SLOT} = {size} B")
print(f"[band] ceiling {ceiling} B, so {ceiling - size:+d} B spare; "
      f"at {max(1, n_bands)} band(s) the ceiling allows {fits_slots} slots")

try:
    inj.check_bganim_section_fits(anims)
except SystemExit as e:
    print("\naeon's OWN gate REFUSED:")
    print("\n".join(str(e).splitlines()[:6]))
    ok = args.plant_slots is not None
    print(f"\nRESULT: {'RED AS EXPECTED (the gate can fail)' if ok else '**REFUSED**'}")
    sys.exit(0 if ok else 1)

if args.plant_slots is not None:
    print(f"\n**THE PLANT WAS ACCEPTED — {slots} slots is NOT over the {ceiling} B ceiling, "
          f"so this run proves nothing. Re-run with --plant-slots > {fits_slots}.**")
    sys.exit(1)
print(f"\nRESULT: aeon's own check_bganim_section_fits ACCEPTS this band at {REV}")
