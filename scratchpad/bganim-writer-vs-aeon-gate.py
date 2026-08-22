#!/usr/bin/env python3
"""Judge AURORA'S OWN writer bytes with AEON'S OWN injection path.

Closes most of ROADMAP item 20's open limit ("no writer has yet produced anims
bytes that aeon's gate has judged"). Overseer-run, foreground.

  node_modules/.bin/esbuild scratchpad/bganim-writer-vs-aeon-gate.emit.ts \
      --bundle --platform=node --format=cjs --outfile=<out>/emit.cjs
  node <out>/emit.cjs <out>
  python3 scratchpad/bganim-writer-vs-aeon-gate.py <out>

WHAT IT PROVES
  A. aeon's inject_editor_bg.MAIN() -- the whole path, not one function --
     accepts Aurora's serializeBgOverride output on the real 2-band b0e5a661
     document, and emits real bands (BgAnim_Table = 2, not the disabled stub).
  B. All four generated artifacts (bg_anim.emp, bg_anim_banks.bin, bg_tiles.bin,
     zone_bg.bin) are BYTE-IDENTICAL whether the input came from Aurora's writer
     or from aeon's own file -- with a determinism control (same input twice)
     proving the comparison is not measuring nondeterminism.
  C. The path DISCRIMINATES: a prefix-identity poison is REJECTED, naming band 0.
     Aurora's writer independently refuses the same poison, so the poison must
     bypass serializeBgOverride to reach aeon's gate unshielded.

WHAT IT DOES NOT PROVE -- the honest limit:
  * ROUND TRIP, NOT ORIGINATION. The bands come from aeon-generated content that
    already satisfied every invariant. A band COMPOSED by Aurora's add-band
    command is still unjudged; that is part 3's proof and this cannot stand in
    for it.
  * NO BUILD, NO ROM. main() emits generated files; nothing assembles them.
  * NO STALENESS GATE. Writing the real file makes a staleness stop CERTAIN and
    it presents as a refusal -- see docs/OVERSEER.md.

aeon's files are loaded at a revision resolved by ls-remote, never from the
sibling working tree (a peer's live, possibly-uncommitted tree).
Pinned at: ce10277ea67d2ae382f147d0e1f5c853b88fa2af
"""
import json, sys, importlib.util, pathlib, subprocess, tempfile, hashlib, shutil, io, contextlib

AEON_REV = "ce10277ea67d2ae382f147d0e1f5c853b88fa2af"
sp = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
aeon = pathlib.Path(__file__).resolve().parents[2] / "aeon"

for mod in ("tools/vram_map.py", "tools/inject_editor_bg.py"):
    (sp / pathlib.Path(mod).name).write_bytes(subprocess.run(
        ["git", "-C", str(aeon), "show", f"{AEON_REV}:{mod}"],
        capture_output=True, check=True).stdout)
sys.path.insert(0, str(sp))

def load():
    spec = importlib.util.spec_from_file_location("inj", sp / "inject_editor_bg.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

def run(fn):
    """Run aeon's main() on one document. Returns (verdict, detail, outdir|None)."""
    m = load(); out = pathlib.Path(tempfile.mkdtemp(prefix="bgemit-"))
    m.OVERRIDE, m.OUT_DIR = str(sp / fn), str(out)
    try:
        with contextlib.redirect_stdout(io.StringIO()) as cap: m.main()
    except AssertionError as e:
        shutil.rmtree(out, ignore_errors=True)
        return "REJECT", str(e).split("\n")[0][:88], None
    emp = (out / "bg_anim.emp").read_text() if (out / "bg_anim.emp").exists() else ""
    tbl = next((l.strip() for l in emp.splitlines() if "BgAnim_Table" in l), "NO TABLE")
    return "ACCEPT", tbl, out

ROWS = [("aurora-clean     (Aurora writer output)",     "aurora-clean.json",     "ACCEPT"),
        ("control-original (fixture bytes, untouched)", "control-original.json", "ACCEPT"),
        ("aurora-poisoned  (prefix identity broken)",   "aurora-poisoned.json",  "REJECT")]

print(f"aeon inject_editor_bg.main() @ {AEON_REV[:8]} — the whole path, not one function.\n")
ok, dirs = True, {}
for label, fn, expect in ROWS:
    got, detail, out = run(fn)
    if got == "ACCEPT":
        dirs[fn] = out
        # ANTI-VACUOUS: a disabled stub ALSO succeeds. Require bands to have reached the emit.
        if "= 0" in detail:
            detail += "   <-- VACUOUS: disabled stub, no band reached the emit"; ok = False
    ok &= (got == expect)
    print(f"[{'PASS' if got == expect else '**FAIL**'}] {label}\n"
          f"       expected {expect}, got {got} — {detail}")

def digest(d): return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(d.iterdir())}
if len(dirs) == 2:
    _, _, ctl2 = run("control-original.json")          # determinism control
    a, c, c2 = digest(dirs["aurora-clean.json"]), digest(dirs["control-original.json"]), digest(ctl2)
    print(f"\ndeterminism control (same input twice): "
          f"{'IDENTICAL' if c == c2 else '**NONDETERMINISTIC — the comparison below is meaningless**'}")
    if c != c2: ok = False
    print("Aurora-written input vs aeon's own file:")
    for k in sorted(set(a) | set(c)):
        same = a.get(k) == c.get(k); ok &= same
        print(f"    [{'same' if same else 'DIFFER'}] {k}")
    print(f"  -> generated artifacts {'BYTE-IDENTICAL' if a == c else 'DIFFER'} across the two inputs")
    shutil.rmtree(ctl2, ignore_errors=True)

ab = (sp / "aurora-clean.json").read_bytes(); cb = (sp / "control-original.json").read_bytes()
print(f"\nFORMAT CHURN (item 22): aurora {len(ab)}B vs aeon json.dump {len(cb)}B, identical semantics "
      f"({100 * (len(cb) - len(ab)) // len(cb)}% smaller, both single-line, different separators).")
for d in dirs.values(): shutil.rmtree(d, ignore_errors=True)
print("\nRESULT:", "all rows as expected" if ok else "SOME ROWS FAILED")
sys.exit(0 if ok else 1)
