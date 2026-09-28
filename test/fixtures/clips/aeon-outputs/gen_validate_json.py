# Regenerates validate-json.cases.json (see validate-json.cases.provenance.json).
# Run FROM a materialised aeon copy (git archive of a named revision, donors converted
# with `tools/s2_zone_convert.py convert --all-six`):
#   EMPYREAN_SUITE_ROOT=<suite> python3 <this file> <scratch dir> <bundle out path>
# Every case is a REAL subprocess of aeon's CLI, invoked the way Aurora invokes it
# (validate <path> --donor-root <root> --json). Nothing below edits aeon's output.
# The mutations are aeon's own, from tools/test_clip_manifest_json.py at 1d9afb25, except
# the ones on s2_woven (ROADMAP rows 232 and 233): each is the least edit of the real woven act
# that trips ONE of the connector rules whose subject is not a clip or corridor (K8 names
# the fill, K9 a shaft), so the shaft/fill subject shapes are aeon's, not typed by hand.
import copy, json, os, subprocess, sys

root = os.getcwd()
sys.path.insert(0, os.path.join(root, "tools"))  # mut_k9_shaft_past_act reads aeon's SECTION_SIZE
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


def mut_k8_fill_no_why(d):
    # K8: "`fill` has no `why`" -- the fill's own refusal, subject {kind: fill}.
    del d["fill"]["why"]


def mut_k9_shaft_pitch(d):
    # K9: shafts[3] (ehz_to_hpz, a stair shaft) with its ledges one block row further
    # apart than the least standing-jump rise (80 px at the pin), subject {kind: shaft}.
    assert d["shafts"][3]["id"] == "ehz_to_hpz"
    d["shafts"][3]["ledges"]["pitch"] = 96


def mut_k9_shaft_dup_clip_id(d):
    # K9 pair: shafts[0] takes clips[0]'s id -- a clip and a shaft in ONE refusal.
    d["shafts"][0]["id"] = d["clips"][0]["id"]


def mut_k9_shaft_past_act(d):
    # K9 "runs past the act" (ROADMAP row 233): shafts[2] (wfz_to_cpz) moved WHOLLY past the
    # act's east edge, x = the act's width (grid_w x aeon's own SECTION_SIZE), subject
    # {kind: shaft}. The one real shaft refusal whose rectangle is not on the target pane.
    import clip_manifest as CM
    assert d["shafts"][2]["id"] == "wfz_to_cpz"
    d["shafts"][2]["dst_rect"]["x"] = d["act"]["grid_w"] * CM.geometry_constants()["SECTION_SIZE"]


# accept_s2_two_clip (ROADMAP row 219): the unmutated two-clip act, the one acceptance in
# the set aeon answers with NO warning (measured at the pin: s2_ehz_cpz and every woven
# act carry W3), so "accepted, nothing to say" is aeon's answer, not an empty list typed here.
plan = [("accept_s2_ehz_cpz", "s2_ehz_cpz", None), ("accept_s2_two_clip", "s2_two_clip", None),
        ("refuse_r7", "s2_two_clip", mut_r7),
        ("refuse_r10_pair", "s2_two_clip", mut_r10), ("refuse_r10_clip_corridor", "s2_ehz_cpz", mut_r10c),
        ("accept_w3", "s2_two_clip", mut_w3), ("refuse_r12_after_w2", "s2_two_clip", mut_w2_r12),
        ("refuse_k8_fill_no_why", "s2_woven", mut_k8_fill_no_why),
        ("refuse_k9_shaft_ledge_pitch", "s2_woven", mut_k9_shaft_pitch),
        ("refuse_k9_shaft_dup_clip_id", "s2_woven", mut_k9_shaft_dup_clip_id),
        ("refuse_k9_shaft_past_act", "s2_woven", mut_k9_shaft_past_act)]
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
    if base == "s2_woven":
        # Row 232: the woven cases also carry the manifest aeon judged (the mutated
        # woven act, as written above), so the target pane's refused-subject rows
        # place the subjects on THAT manifest rather than re-deriving the mutation.
        bundle[name]["manifest"] = d
open(f"{out}/notjson.clips.json", "w").write("{ this is not json")
run("crash_not_json", f"{out}/notjson.clips.json")
run("crash_missing_path", f"{out}/no_such_file.json")
json.dump([1, 2], open(f"{out}/toplist.clips.json", "w"))
run("refuse_untagged_top_list", f"{out}/toplist.clips.json")
with open(bundle_path, "w") as fh:
    json.dump(bundle, fh, indent=2, sort_keys=True)
    fh.write("\n")
