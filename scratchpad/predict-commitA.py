import json, sys
# PREDICTION written BEFORE the harness ran (ROADMAP row 60, commit A).
# The factor select's own option list, in schema order, plus the packed sentinel LAST.
# (Derived from $defs/factor.oneOf[0].enum + CUSTOM_FACTOR_VALUE; length 17.)
F = ["FACTOR_LOCKED", "FACTOR_0", "FACTOR_1", "FACTOR_1_2", "FACTOR_1_4", "FACTOR_1_8",
     "FACTOR_1_16", "FACTOR_1_32", "FACTOR_3_4", "FACTOR_3_8", "FACTOR_3_16", "FACTOR_5_8",
     "FACTOR_5_16", "FACTOR_7_8", "FACTOR_7_16", "FACTOR_15_16", "__packed__"]
PACKED = {"op": 0, "s1": 0, "s2": 15}
N = 16   # R3: the app's own ceiling (schema layers.maxItems, raised by row 56)
L = len(F)
layers = []
for i in range(N):
    fa = F[i % L]                       # R5
    fb = F[(L - 1 - i) % L]             # R6
    layers.append({
        "fa": PACKED if fa == "__packed__" else fa,
        "fb": PACKED if fb == "__packed__" else fb,
        "world_y": i * 32,              # R4
    })
scene = {
    "id": "writer_session_ojz",
    "layers": layers,
    "name": "Oracle Jungle Zone — writer session",
    "schema": 1,
    "transition": "instant",            # R9 last option
    "v_center": N,                      # R8
    "v_factor": N % 16,                 # R7 amended: N wrapped into the control's own 0..15 range
    "v_offset": -N,                     # R8
}
out = json.dumps(scene, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
sys.stdout.write(out)
