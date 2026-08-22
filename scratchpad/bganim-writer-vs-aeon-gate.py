#!/usr/bin/env python3
"""Judge AURORA'S OWN writer bytes with AEON'S OWN validator.

Closes HALF of ROADMAP item 20's open limit ("no writer has yet produced anims
bytes that aeon's gate has judged"). Run by the overseer in the foreground.

  node_modules/.bin/esbuild scratchpad/bganim-writer-vs-aeon-gate.emit.ts \
      --bundle --platform=node --format=cjs --outfile=/tmp/emit.cjs
  node /tmp/emit.cjs <outdir>            # writes 3 documents
  python3 scratchpad/bganim-writer-vs-aeon-gate.py <outdir>

WHAT IT PROVES: Aurora's serializeBgOverride output is ACCEPTED by aeon's
validate_band_coherence on a real 2-band document, and the gate DISCRIMINATES
(a prefix-identity poison is rejected, naming the right band).

WHAT IT DOES NOT PROVE, and this is the honest limit:
  * It is a ROUND TRIP, not an ORIGINATION. The bands come from aeon-generated
    content that already satisfied the invariant. A band COMPOSED by Aurora's
    add-band command is still unjudged — that is part 3's proof.
  * validate_band_coherence is ONE function. The rest of inject_editor_bg.main()
    (bank emit, table emit, palette stamp) is not exercised, and neither is the
    build. A pass here says nothing about the ROM.
  * The staleness gate is not involved. See docs/OVERSEER.md — writing the real
    file makes a staleness stop CERTAIN, and it presents as a refusal.

The validator is loaded from aeon's file at a PINNED REVISION resolved by
ls-remote, never from the sibling working tree (which is a peer's live tree).
Pinned at: b16ec612ecc31e6e610a368f83a87daf7c598747
"""
import json, sys, importlib.util, pathlib, subprocess, inspect

AEON_REV = "b16ec612ecc31e6e610a368f83a87daf7c598747"
sp = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
aeon = pathlib.Path(__file__).resolve().parents[2] / "aeon"

for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    dest = sp / pathlib.Path(mod).name
    dest.write_bytes(subprocess.run(
        ["git", "-C", str(aeon), "show", f"{AEON_REV}:{mod}"],
        capture_output=True, check=True).stdout)

sys.path.insert(0, str(sp))
spec = importlib.util.spec_from_file_location("inj", sp / "inject_editor_bg.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
vbc = m.validate_band_coherence
print(f"validator: aeon validate_band_coherence @ {AEON_REV[:8]} "
      f"({len(inspect.getsource(vbc).splitlines())} lines, aeon's file, not a restatement)\n")

ROWS = [("aurora-clean     (Aurora writer output)",     "aurora-clean.json",     "ACCEPT"),
        ("control-original (fixture bytes, untouched)", "control-original.json", "ACCEPT"),
        ("aurora-poisoned  (prefix identity broken)",   "aurora-poisoned.json",  "REJECT")]
ok = True
for label, fn, expect in ROWS:
    d = json.loads((sp / fn).read_text()); bands = d.get("anims") or []
    # ANTI-VACUOUS: a zero-band document satisfies band coherence trivially.
    assert bands, f"VACUOUS: {fn} carries no bands; the row proves nothing"
    try:
        vbc(bands, d["tiles"]); got, detail = "ACCEPT", f"{len(bands)} bands judged"
    except AssertionError as e:
        got, detail = "REJECT", str(e).split("\n")[0][:90]
    ok &= (got == expect)
    print(f"[{'PASS' if got == expect else '**FAIL**'}] {label}\n"
          f"       expected {expect}, got {got} — {detail}")

a = json.loads((sp / "aurora-clean.json").read_text())
c = json.loads((sp / "control-original.json").read_text())
ab, cb = (sp / "aurora-clean.json").read_bytes(), (sp / "control-original.json").read_bytes()
print(f"\nsemantic equality: {a == c}   byte-identical: {ab == cb}")
print(f"FORMAT CHURN: aurora {len(ab)}B vs aeon json.dump {len(cb)}B for identical semantics "
      f"({100 * (len(cb) - len(ab)) // len(cb)}% smaller; both single-line, different separators).")
print("\nRESULT:", "all rows as expected" if ok else "SOME ROWS FAILED")
sys.exit(0 if ok else 1)
