# Regenerates bake-json.cases.json (see bake-json.cases.provenance.json).
# Run FROM a materialised aeon copy (git archive of a named revision, donors converted
# with `tools/s2_zone_convert.py convert --all-six`):
#   EMPYREAN_SUITE_ROOT=<suite> python3 <this file> <scratch dir> <bundle out path>
# Every case is a REAL subprocess of aeon's CLI, invoked the way Aurora invokes it
# (bake <path> --out <dir> --json; src/main/clip-tool.ts clipToolArgv), except
# `refuse_untagged_expect_worst`, which adds aeon's own --expect-worst (Aurora never
# passes it; it is the one way to reach an untagged bake refusal without patching aeon).
# Nothing below edits aeon's output. The mutations are aeon's own, from
# tools/test_clip_bake_json.py at 71ae3433: manifest mutations of committed fixtures, and
# for C1/C3 a donor tree PAINTED in place (backed up first and restored afterwards, so the
# copy's donors are the converter's again when this exits).
import copy, json, os, shutil, subprocess, sys

root = os.getcwd()
out = sys.argv[1]
bundle_path = sys.argv[2]
bundle = {}
sys.path.insert(0, os.path.join(root, "tools"))
import numpy as np                   # noqa: E402
import collision_pipeline as CP      # noqa: E402
import clip_manifest as CM           # noqa: E402
import fg_page_order as fpo          # noqa: E402


def fx(n):
    return json.load(open(f"games/sonic4/data/clips/{n}/clips.json"))


def mut_r7(d):
    d["clips"][1]["dst_rect"]["w"] //= 2


def mut_w2(d):
    d["clips"][0]["src_rect"]["h"] = d["clips"][0]["dst_rect"]["h"] = 8


def mut_w2_r12(d):
    mut_w2(d)
    d["clips"][1]["src_rect"]["x"] += CM.TILE_PX


plan = [("accept_s2_ehz_cpz", "s2_ehz_cpz", None), ("accept_w2", "s2_two_clip", mut_w2),
        ("refuse_r7", "s2_two_clip", mut_r7), ("refuse_r12_after_w2", "s2_two_clip", mut_w2_r12)]
os.makedirs(out, exist_ok=True)


def run(name, path, extra=()):
    argv = ["python3", "tools/clip_act_bake.py", "bake", path, "--out", f"{out}/{name}.out"] + list(extra) + ["--json"]
    p = subprocess.run(argv, capture_output=True, text=True)
    bundle[name] = {"exit": p.returncode, "stdout": p.stdout, "stderr": p.stderr,
                    "argv": ["bake", "<path>", "--out", "<dir>"] + list(extra) + ["--json"]}
    print(name, p.returncode, len(p.stdout), len(p.stderr))


for name, base, m in plan:
    d = copy.deepcopy(fx(base))
    if m:
        m(d)
    p = f"{out}/{name}.clips.json"
    json.dump(d, open(p, "w"), indent=2)
    run(name, p)

# --expect-worst the act cannot meet: aeon's untagged ClipBakeError (rule null, no subjects).
run("refuse_untagged_expect_worst", "games/sonic4/data/clips/s2_ehz_boot/clips.json",
    ["--expect-worst", str(fpo.load_budget_constants()["PAGE_FRAMES"] + 1)])

# C1 / C3: the bake's OWN refusals, on a valid one-clip manifest over a painted EHZ tree.
TREE = "games/sonic4/data/donors/s2disasm/EHZ"
BACKUP = f"{out}/EHZ.unpainted"
shutil.rmtree(BACKUP, ignore_errors=True)
shutil.copytree(TREE, BACKUP)


def paint(cells_by_suffix):
    m = json.load(open(os.path.join(TREE, "zone.json")))
    st = CM.geometry_constants()["SECTION_SIZE"] // CM.TILE_PX
    gw = m["grid"]["w"]
    for suffix, cells in cells_by_suffix.items():
        by = {}
        for (r, c), w in cells.items():
            by.setdefault((r // st) * gw + c // st, []).append((r % st, c % st, w))
        for n, items in by.items():
            p = os.path.join(TREE, f"section_{n}.{suffix}.bin")
            g = np.frombuffer(open(p, "rb").read(), dtype=">u2").reshape(st, st).copy()
            for r, c, w in items:
                g[r, c] = w
            open(p, "wb").write(g.astype(">u2").tobytes())


def restore():
    shutil.rmtree(TREE)
    shutil.copytree(BACKUP, TREE)


def one_clip(name, src):
    doc = {"schema": 1, "units": "world_px", "id": "xover_cut", "act": {"grid_w": 1, "grid_h": 1},
           "clips": [{"id": "ehz_cut", "donor": "s2disasm", "zone": "EHZ",
                      "src_rect": dict(zip(("x", "y", "w", "h"), src)),
                      "dst_rect": {"x": 0, "y": 0, "w": src[2], "h": src[3]}}]}
    p = f"{out}/{name}.clips.json"
    json.dump(doc, open(p, "w"), indent=2)
    return p


try:
    xo = ((40, 100), (100, 100))
    paint({"collattr": {c: CP.XOVER_TO_B << CP.XOVER_SHIFT for c in xo},
           "collattrb": {c: CP.XOVER_TO_A << CP.XOVER_SHIFT for c in xo}})
    run("refuse_c1_bake_own", one_clip("refuse_c1_bake_own", (0, 0, 2048, 512)))
    restore()
    paint({"collattr": {(10, 10): 0x18 | (CP.SOL_ALL << CP.PLANE_SOL_SHIFT)}})
    run("refuse_c3_act_level", one_clip("refuse_c3_act_level", (0, 0, 2048, 1024)))
finally:
    restore()
    shutil.rmtree(BACKUP)

open(f"{out}/notjson.clips.json", "w").write("{ this is not json")
run("crash_not_json", f"{out}/notjson.clips.json")
run("crash_missing_path", f"{out}/no_such_file.json")
with open(bundle_path, "w") as fh:
    json.dump(bundle, fh, indent=2, sort_keys=True)
    fh.write("\n")
