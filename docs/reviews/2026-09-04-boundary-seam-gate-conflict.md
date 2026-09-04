# The boundary witness is blocked by aeon's own seam gate, not by the spelling

**The corrected spelling assembles the way aeon's `097c22f5` says it does. The build is
refused one step earlier, by `tools/effects_seam_gate.py`, which cannot express the case the
`boundary` key exists for.** Handed to aeon per the standing split.

## What was done, on a fresh copy at aeon `b9430729`

1. Authored both documents with Aurora's own serializer (unchanged script).
2. Pointed `section_6.meta.json`'s `rasterRef` at `aurora_boundary_witness`.
3. Applied **the spelling aeon's own doc prescribes**, read out of `097c22f5`'s diff and not
   from any message: *"THE SPELLING THAT WORKS — OMIT THE `raster:` ARGUMENT ENTIRELY"*, plus
   `patched: ojz_act1_sec_patched(sec: 6)` with `hand:` omitted.

That is the combination their own table marks buildable: omitting `hand:` builds **when the
chooser has an arm for that section**, and here the patched chooser does — my document is the arm.

## The refusal, and it is not the assembler

    effects_seam_gate: FAIL - the raster binding seam is broken in ojz_effects.emp:
      - section 6's sidecar names rasterRef 'aurora_boundary_witness', but no preset threads
        ojz_act1_sec_raster(sec: 6) - the generator would emit the binding row and nothing
        would read it, which presents to the author as an assignment that did nothing.

**Read from the gate's own source** (`effects_seam_gate.py:221-227`): it walks every section
sidecar carrying a `rasterRef` and requires each to appear among the sections threaded through
`ojz_act1_sec_raster`. And — measured, not inferred — **`grep -c 'sec_patched'` over that file
returns `0`. The gate does not know the patched chooser exists.**

## Why no spelling satisfies both

| attempt | outcome |
|---|---|
| thread `raster: ojz_act1_sec_raster(sec: 6)` | the raster chooser has **no arm for 6** — the document lowers to `ep_patched` — refused, per aeon's own table |
| thread `raster:` with a non-zero hand | trips `preset()`'s `ep_raster == 0` or `ep_patched == 0` ensure |
| omit `raster:`, thread `patched:` — **the prescribed spelling** | assembles, and **the seam gate refuses the build** because it only looks for `raster:` |

**So a section sidecar whose `rasterRef` names a patched-arm document cannot satisfy the gate
at all** — and `rasterRef` is the correct key by aeon's own ruling to me: *a section sidecar's
`rasterRef` binds the section to its preset document; which arm that document lowers into is
decided by the document's own keys.*

## What this is and is not

**It is not the `hand:` problem** — that is fixed and the fix works. This is one step earlier,
in a Python gate that has not caught up with a key the contract now has: the same class as an
instrument scoped to a fallback table while an authored one exists.

**It is not a stop**, per the hub's standing instruction, and not mine to fix — the gate is
aeon's, and changing it decides what the seam means.

**Nothing here is a claim about the engine.** The boundary program still reaches the ROM and is
still bound by a generated chooser; what has never been observed is it being INSTALLED.

## Where the witness stands

Blocked on aeon, pose unchanged and already worked out: section 6 is column 0 **row 2**
(`GRID_W = 3`, 2048 px sections), camera `y ≈ 5120`, and a control is available in the same run
because crossing **out** of section 6 installs cleanly. The moment a build carrying a
boundary-bound section 6 exists, the run is minutes.
