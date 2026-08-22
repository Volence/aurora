"""Does aeon's TOOL-01 refusal fire on TODAY'S SHIPPED FILE SHAPE, not just the
historical b0e5a661 fixture?

The acceptance suite proves refusal against a fixture. The shipped file has no
`anims`, so the gate is structurally vacuous against it -- the first real band
Aurora authors would be the first time it fires on live data. This closes that
early, on a COPY. Nothing in the aeon tree is written.

Pairing (anti-vacuous): the same live file WITHOUT `anims` must be ACCEPTED by
the same call, or a refusal proves only that the tool dislikes the file.
"""
import io, json, os, sys, tempfile, shutil
from contextlib import redirect_stdout
import numpy as np
from PIL import Image

AEON = "/home/volence/sonic_hacks/aeon"
LIVE = os.path.join(AEON, "games/sonic4/data/editor_bg_override.json")
sys.path.insert(0, os.path.join(AEON, "tools"))
import png_to_bg_override as tool

live_bytes = open(LIVE, "rb").read()

tmp = tempfile.mkdtemp()
png = os.path.join(tmp, "bg.png")
a = np.zeros((64, 64, 3), np.uint8)
for i, c in enumerate([(0,0,0),(34,34,34),(68,68,68),(102,102,102),
                       (136,136,136),(170,170,170),(204,204,204),(255,255,255)]):
    a[:, i*8:(i+1)*8] = c
Image.fromarray(a).save(png)

def run(path):
    saved_o, saved_a = tool.OVERRIDE, sys.argv
    tool.OVERRIDE = path
    sys.argv = ["png_to_bg_override.py", png]
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            tool.main()
        return 0, buf.getvalue()
    except SystemExit as e:
        return (e.code if e.code is not None else 0), buf.getvalue()
    finally:
        tool.OVERRIDE, sys.argv = saved_o, saved_a

live = json.loads(live_bytes)
print(f"live keys={sorted(live)}  len(tiles)={len(live['tiles'])}  "
      f"len(layout)={len(live['layout'])}")
assert "anims" not in live, "premise broken: the live file already has anims"

# --- control: the live shape, unmodified, must be ACCEPTED --------------------
ctl = os.path.join(tmp, "control.json")
shutil.copyfile(LIVE, ctl)
code, _ = run(ctl)
ctl_keys = sorted(json.load(open(ctl)))
print(f"CONTROL  (live shape, no anims): exit={code!r}  keys_after={ctl_keys}")
assert code == 0, f"control must be accepted, got {code!r}"

# --- subject: the live shape + one real band (b0e5a661's band 0 geometry) -----
band = {"cols": 32, "rows": 4, "pattern_px": 256, "driver": "camera_x",
        "rate_shift": 2, "slot_base": 0,
        "phases": [live["tiles"][0:128] for _ in range(8)]}
subj_doc = dict(live); subj_doc["anims"] = [band]
subj = os.path.join(tmp, "subject.json")
with open(subj, "w") as f:
    json.dump(subj_doc, f)
before = open(subj, "rb").read()
code, _ = run(subj)
intact = open(subj, "rb").read() == before
print(f"SUBJECT  (live shape + 1 band):  exit={code!r}")
print(f"         file left byte-intact: {intact}")
assert code != 0, "REFUSAL DID NOT FIRE on the live file shape"
assert "anims" in str(code), f"refusal fired but does not name anims: {code!r}"
assert intact, "refused but MODIFIED the file"

# --- the aeon tree is untouched ----------------------------------------------
assert open(LIVE, "rb").read() == live_bytes, "the live aeon file was modified!"
print("\nlive aeon file byte-identical after probe: True")
print("RESULT: refusal fires on the SHIPPED file shape, names the key, "
      "leaves bytes intact; the no-anims control is accepted.")
shutil.rmtree(tmp)
