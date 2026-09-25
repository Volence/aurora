# Regenerates validate-json.cases.json (see aeon-outputs.provenance.json).
# Run FROM a materialised aeon copy (git archive of a named revision, donors converted
# with `tools/s2_zone_convert.py convert --all-six`):
#   EMPYREAN_SUITE_ROOT=<suite> python3 <this file> <scratch dir> <bundle out path>
# Every case is a REAL subprocess of aeon's CLI, invoked the way Aurora invokes it
# (validate <path> --donor-root <root> --json). Nothing below edits aeon's output.
# The mutations are aeon's own, from tools/test_clip_manifest_json.py at 1d9afb25.
import copy, json, os, subprocess, sys

root = os.getcwd()
out = sys.argv[1]
bundle_path = sys.argv[2]
bundle = {}


def fx(n):
    return json.load(open(f"games/sonic4/data/clips/{n}/clips.json"))


def mut_r7(d):
    d["clips"][1]["dst_rect"]["w"] = 1024


def mut_r10(d):
    d["clips"][1]["dst_rect"]["x"] = 1024
    d["clips"][1]["unaligned_dst_reason"] = "probe"


def mut_r10c(d):
    d["corridors"][0]["dst_rect"]["x"] = 10960


def mut_w3(d):
    for c, x in zip(d["clips"], (0, 1024)):
        c["src_rect"] = dict(c["src_rect"], w=1024, h=1024)
        c["dst_rect"] = {"x": x, "y": 0, "w": 1024, "h": 1024}
        c["unaligned_dst_reason"] = "mixed-section probe"


def mut_w2_r12(d):
    d["clips"][0]["src_rect"]["h"] = d["clips"][0]["dst_rect"]["h"] = 8
    d["clips"][1]["src_rect"]["x"] = 4096 + 8


plan = [("accept_s2_ehz_cpz", "s2_ehz_cpz", None), ("refuse_r7", "s2_two_clip", mut_r7),
        ("refuse_r10_pair", "s2_two_clip", mut_r10), ("refuse_r10_clip_corridor", "s2_ehz_cpz", mut_r10c),
        ("accept_w3", "s2_two_clip", mut_w3), ("refuse_r12_after_w2", "s2_two_clip", mut_w2_r12)]
os.makedirs(out, exist_ok=True)


def run(name, path):
    argv = ["python3", "tools/clip_manifest.py", "validate", path,
            "--donor-root", os.path.join(root, "games/sonic4/data/donors"), "--json"]
    p = subprocess.run(argv, capture_output=True, text=True)
    bundle[name] = {"exit": p.returncode, "stdout": p.stdout, "stderr": p.stderr}
    print(name, p.returncode, len(p.stdout))


for name, base, m in plan:
    d = copy.deepcopy(fx(base))
    if m:
        m(d)
    p = f"{out}/{name}.clips.json"
    json.dump(d, open(p, "w"), indent=2)
    run(name, p)
open(f"{out}/notjson.clips.json", "w").write("{ this is not json")
run("crash_not_json", f"{out}/notjson.clips.json")
run("crash_missing_path", f"{out}/no_such_file.json")
json.dump([1, 2], open(f"{out}/toplist.clips.json", "w"))
run("refuse_untagged_top_list", f"{out}/toplist.clips.json")
with open(bundle_path, "w") as fh:
    json.dump(bundle, fh, indent=2, sort_keys=True)
    fh.write("\n")
