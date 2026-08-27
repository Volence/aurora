#!/usr/bin/env python3
"""ROADMAP item 14 — does the July clobber still happen? BEHAVIOUR, not presence.

The owner closed item 14 on 2026-08-27 conditionally: "not worth worrying about
if still not happening." An `import bg_override_io` in each writer is PRESENCE.
This probe is BEHAVIOUR: it calls the shared refusal with each writer's own
declared OWNED_KEYS over a file carrying `anims`, and reports the exit status.

The module beside this file was extracted with
    git -C ../aeon show 89d73e0c8f4f0eaa7a805af4bd8a86abed248101:tools/bg_override_io.py
i.e. from aeon's PUSHED origin/master resolved by `git ls-remote` — not from the
sibling working tree, which is another session's live directory.

OWNED_KEYS below are TRANSCRIBED FROM EACH WRITER at that same revision, not
guessed: png_to_bg_override.py:77, forest_bg_gen.py:20.

Expected, and what a green result rules out:
  png_to_bg_override -> exit 1  (the July tool refuses; the loss cannot recur)
  forest_bg_gen      -> exit 0  (it OWNS anims, so it does NOT refuse — the
                                 residual booked as item 53; d-14 moved band
                                 art into Aurora, which is what makes this live)
A run in which BOTH accept would mean the discharge at aeon bd31e133 had been
reverted; a run in which both refuse would mean forest_bg_gen can no longer
author the bands it exists to author. Neither is "green".
"""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
SHIM = HERE / "bg_override_io.aeon-89d73e0c.py"

WRITERS = [
    ("png_to_bg_override", ("layout", "tiles", "palette", "palette_line"), 1),
    ("forest_bg_gen",      ("layout", "tiles", "anims"),                   0),
]

RUNNER = '''
import importlib.util, sys
spec = importlib.util.spec_from_file_location("bg_override_io", %r)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.read_existing_override(%r, frozenset(%r), %r)
print("ACCEPTED (no refusal)")
'''

def main() -> int:
    doc = HERE / "override-with-anims.json"
    doc.write_text(json.dumps({"layout": [0], "tiles": [[0]], "anims": [{"base": 0}]}))
    bad = 0
    for tool, owned, expect in WRITERS:
        r = subprocess.run(
            [sys.executable, "-c", RUNNER % (str(SHIM), str(doc), owned, tool)],
            capture_output=True, text=True)
        ok = r.returncode == expect
        bad += not ok
        print(f"--- {tool}: exit {r.returncode} (expected {expect}) "
              f"{'OK' if ok else '*** UNEXPECTED ***'} ---")
        print((r.stdout + r.stderr).strip())
        print()
    doc.unlink()
    print("VERDICT:", "as recorded in item 14" if not bad else f"{bad} writer(s) MOVED — re-open item 14")
    return bad

if __name__ == "__main__":
    sys.exit(main())
