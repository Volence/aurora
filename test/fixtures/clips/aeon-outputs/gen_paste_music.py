# Regenerates paste-music.cases.json (see paste-music.cases.provenance.json), ROADMAP row 222.
# Run FROM a materialised aeon copy (git archive of a named revision, donors converted
# with `tools/s2_zone_convert.py convert --all-six`):
#   EMPYREAN_SUITE_ROOT=<suite> python3 <this file> <scratch dir> <bundle out path>
# Every case is a REAL subprocess of aeon's CLI, invoked the way Aurora invokes it
# (validate <path> --donor-root <root> --json), on s2_ehz_cpz plus ONE pasted clip.
# Each case also records the manifest it validated, so the Aurora test can hold
# withClip's own output to it (test/formats/paste-music-r3.test.ts): the clip
# entries below are what withClip writes, and that test fails if they are not.
# Nothing below edits aeon's output.
import copy, json, os, subprocess, sys

root = os.getcwd()
out = sys.argv[1]
bundle_path = sys.argv[2]
bundle = {}


def fx(n):
    return json.load(open(f"games/sonic4/data/clips/{n}/clips.json"))


EHZ_PASTE = {"id": "ehz_1", "donor": "s2disasm", "zone": "EHZ",
             "src_rect": {"x": 0, "y": 0, "w": 2048, "h": 1024},
             "dst_rect": {"x": 0, "y": 2048, "w": 2048, "h": 1024}}
OOZ_PASTE = {"id": "ooz_1", "donor": "s2disasm", "zone": "OOZ",
             "src_rect": {"x": 0, "y": 0, "w": 2048, "h": 1024},
             "dst_rect": {"x": 0, "y": 4096, "w": 2048, "h": 1024}}


def paste_ehz_inherits(d):
    # withClip since row 222: the song the act's s2disasm EHZ clip names.
    song = next(c["music"] for c in d["clips"] if (c["donor"], c["zone"]) == ("s2disasm", "EHZ"))
    d["clips"].append(dict(EHZ_PASTE, music=song))


def paste_ehz_pre222(d):
    # withClip before row 222: the same clip with no music.
    d["clips"].append(dict(EHZ_PASTE))


def paste_new_zone(d):
    # a zone the act does not carry: withClip writes no music, before and after row 222.
    d["clips"].append(dict(OOZ_PASTE))


plan = [("accept_paste_inherits_music", "s2_ehz_cpz", paste_ehz_inherits),
        ("refuse_r3_paste_pre222", "s2_ehz_cpz", paste_ehz_pre222),
        ("accept_paste_new_zone_no_music", "s2_ehz_cpz", paste_new_zone)]
os.makedirs(out, exist_ok=True)


def run(name, path, doc):
    argv = ["python3", "tools/clip_manifest.py", "validate", path,
            "--donor-root", os.path.join(root, "games/sonic4/data/donors"), "--json"]
    p = subprocess.run(argv, capture_output=True, text=True)
    bundle[name] = {"exit": p.returncode, "stdout": p.stdout, "stderr": p.stderr, "manifest": doc}
    print(name, p.returncode, len(p.stdout))


for name, base, m in plan:
    d = copy.deepcopy(fx(base))
    m(d)
    p = f"{out}/{name}.clips.json"
    json.dump(d, open(p, "w"), indent=2)
    run(name, p, d)
with open(bundle_path, "w") as fh:
    json.dump(bundle, fh, indent=2, sort_keys=True)
    fh.write("\n")
