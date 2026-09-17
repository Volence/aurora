"""Run aeon's OWN generator and seam-gate functions over one aeon-shaped tree and
print what they say about raster ownership, as JSON. Used to record the truth the
aurora fixtures are held to. Argument: the tree root (tools/ from aeon c7ebe7a1)."""
import hashlib, json, os, re, sys
root = os.path.abspath(sys.argv[1])
sys.path.insert(0, os.path.join(root, "tools"))
import effects_gen as g
import effects_seam_gate as s

names = g.act_names(root)
lib_path = os.path.join(root, s.EFFECTS_LIB)
desc_path = os.path.join(root, s.DESCRIPTOR)
lib = open(lib_path).read()
desc = open(desc_path).read()
refs, owner_rec, region_mode = s.owner_maps(root, desc)
raster_calls = s.raster_call_sites(lib, names.fn_preset_raster)
channels = {}
for ch in g.SECTION_CHANNELS:
    if ch.channel in g.ARM_CHANNELS:
        continue
    cs = s.channel_call_sites(lib, getattr(names, ch.names_attr), ch.index_param)
    channels[ch.channel] = {k: {kk: sorted(vv) for kk, vv in v.items()} for k, v in cs.items()}
rekey = g._rekey_bound_to_record(refs, owner_rec, "region" if region_mode else "section", "x")
wired = sorted((o for o, r in owner_rec.items() if raster_calls.get(r, (None,))[0] == r), key=str)

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

inputs = {"library": sha(lib_path), "descriptor": sha(desc_path)}
data = os.path.join(root, "games/sonic4/data/editor/ojz/act1")
for n in sorted(os.listdir(data)):
    if n.endswith(".meta.json") or n == "regions.json":
        inputs[n] = sha(os.path.join(data, n))

print(json.dumps({
    "has_act_regions": g.has_act_regions(root),
    "fn_preset_raster": names.fn_preset_raster,
    "owner_maps.raster_refs": {str(k): v for k, v in refs.items()},
    "owner_maps.owner_records": {str(k): v for k, v in owner_rec.items()},
    "raster_call_sites": {k: v[0] for k, v in raster_calls.items()},
    "channel_call_sites": channels,
    "_rekey_bound_to_record": rekey,
    "homes_whose_record_threads_itself": [str(o) for o in wired],
    "sha256_of_inputs": inputs,
}, indent=2, sort_keys=True))
