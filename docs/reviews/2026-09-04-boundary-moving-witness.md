# The boundary MOVES — an Aurora-authored sweep, witnessed against a still control

**Result: the band moves. Paired against the sitting-still control from the previous witness,
same instrument, same window, same frames, same pose — only the document differs.**

## The measurement

`Raster_Buf_A`/`Raster_Buf_B` (`$FFFF8BE0`, the double-buffered per-line raster schedule),
256 bytes, sampled at the same two frames in both builds after the same camera pose into
section 6:

| build | frame 549 | frame 586 | changed |
|---|---|---|---|
| **still control** (`804d0f52`) | `0004 8AFF …` | **byte-identical** | **no** |
| **swept** (`f00f7a9c`) | `0004 8A74 …` | `0004 8A9B …` (buf B `8A9A`) | **yes — exactly one field** |

**Every other byte of the 256 is identical in both builds and at both frames.** One field
sweeps and nothing else does, which is what an anchor sweep should look like and what a
general "something changed" reading could not have told apart from ordinary per-frame churn.

The still control sits at `8AFF` — the no-anchor sentinel. The swept one sits at a real,
changing line.

## What was authored, and every value derived

Through Aurora's own reader/writer, round-tripped before it left:

- `patch_world_ys: [5220]` — **derived, not invented**: the boundary declares `line: 100`, the
  latched line is `anchor - Camera_Y`, and the witness drives the camera to `y = 5120`, so
  `5220` puts the band at its own declared line at that pose.
- `patch_motion: [{sweep: {amp_shift: 2, period_shift: 0, phase: 0}}]` — the **largest and
  fastest rungs the schema allows** (64 px peak excursion, one cycle in 256 ticks ≈ 4.27 s),
  chosen so motion is unmissable in a 37-frame window rather than argued about.

Both reached the ROM: `ep_patch_world_ys = [5220, 32767, 32767, 32767]`,
`ep_patch_motion = [8192, 0, 0, 0]`.

## ⚠ A section needs FOUR threadings, and aeon's tree has none of them for section 6

The first rebuild was **green and byte-identical to the control** — the two new keys did not
reach the ROM. The re-bake had run and had seen the changed file; the preset simply did not
thread the choosers. Section 6 needed, in `ojz_effects.emp`:

1. `ojz_act1_sec_patched` added to the editor-module import,
2. `patched: ojz_act1_sec_patched(sec: 6)`,
3. `patch_world_ys: [ojz_act1_sec_patch_world_y(sec: 6, ch: 0..3, hand: PATCH_ANCHOR_NONE)]`,
4. `patch_motion: [ojz_act1_sec_patch_motion(sec: 6, ch: 0..3, hand: ANCHOR_MOTION_NONE)]`,

spelling copied from `OJZ_Preset_Sec5`, which threads (3) and (4) already. **These are edits in
a disposable copy, not aeon's tree.** A green build with an unchanged ROM is the shape worth
naming: nothing failed, and the authored keys were simply not read.

## ⚠ My first observable was blind, and the control is what proved it rather than the feature

I sampled `Raster_Patch_Tab` first and it was byte-identical between the still and swept
builds. Read alone that says *"the sweep does not run"* — a clean, confident, wrong answer.
The motion word was already in the ROM (`8192`), so the instrument, not the feature, was at
fault. `Raster_Buf_A` is where the swept line lands. **A null result from an observable whose
coverage you have not established is not a finding.**

## Open

Nothing here says a person would SEE it: this is the schedule the raster writes, not pixels.
The band's motion is measured in the engine's own per-line buffer, which is one layer above
the screen and one below a claim about what the display looks like.
