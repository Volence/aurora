# A drift value authored in Aurora moves a layer in the running ROM

**2026-09-02, run by the overseer in the foreground** (background agents cannot touch the
emulator). This closes EFFECTS-W1's own goal sentence for drift — *"an effect an author
builds in Aurora reaches a ROM"* — end to end, rather than to the wire.

## The result

| band | before (px) | after (px) | delta over 60 frames | px/frame |
|---|---|---|---|---|
| 0 | 0.000 | 0.000 | 0.000 | 0.0000 |
| 1 | 0.000 | 0.000 | 0.000 | 0.0000 |
| **2** | **−172.000** | **−232.000** | **−60.000** | **−1.0000** |
| 3 | 0.000 | 0.000 | 0.000 | 0.0000 |
| 4 | 0.000 | 0.000 | 0.000 | 0.0000 |
| 5–7 | 0.000 | 0.000 | 0.000 | 0.0000 |

Authored: layer 2, `−1 px/frame`. Measured: `−1.0000 px/frame`, sign correct, **7 of 7
un-drifting bands moved by exactly 0**.

## What makes it a proof of AURORA's half rather than aeon's

The scene was authored **through Aurora's own codec**, not by hand-editing JSON —
`scratchpad/author-drift-scene.test.ts` parses the shipped scene with `parseEffectsScene`,
converts px/frame through `driftPxPerFrameToRate` (the single ×256 site), and writes it
back with `serializeEffectsScene`. Hand-writing the JSON would have walked around the exact
seam under test: Aurora's export → aeon's generator.

**The control layers were authored, not borrowed, and that was aeon's correction.** The
shipped hand-authored OJZ scene carries `Rate(-32)` on **all four** of its bands, on purpose
(the canopy is one visual plane cut into four records; per-band rates would shear it). So
"a layer on the same plane that must not move" does not exist in it — the nearest candidate
drifts at the *same rate* and would have read as a passing control **while proving nothing**.
The scene used here starts with no drift on any layer, so the four untouched layers are
genuine controls, and their absence of drift is asserted in the authoring step rather than
assumed.

Two further hazards aeon named, both honoured: **the sign is asserted** (a dropped sign
passes a magnitude check), and the sample is long enough that the fractional part carries
(at `−32` the integer scroll moves one pixel every eight frames, so a four-frame sample can
read zero and look like a dead layer — this run used `−256` and 60 frames).

## The observable, and why not a screenshot

`Parallax_Drift_Acc` (`0xFF8944`), the RAM array of 16.16 accumulators indexed by config
band index — the quantity the drift actually integrates. **A screenshot diff cannot answer
this**, the same reason it could not answer whether a band steps: pixels move for many
reasons and the tile ids never move at all. Camera held stationary throughout (no input);
`emulator/run_frames` is bounded, so there is no polling race.

## Provenance

- aeon `b294234b`, cloned with full history (a `git archive` extract fails the build: a
  build-time test reads a historical blob and correctly refuses to be a skip).
- Built **inside the suite root** — out-of-tree, `suite_paths` cannot resolve sibling repos
  and five build-time tests fail on that alone, before any ROM is emitted.
- `DEBUG=1 ./build.sh` exit **0**, 1957 passed / 6 skipped, ROM **737,643 bytes**.
- Assembler: `sigil 0a58f2ecc8e7`, md5 **`6c2378ae8a657e26684d4019a7d976d7`** — pinned by
  md5, not by revision, because sigil rebuilt this binary after the previous one was stamped
  from a branch since **deleted**, making its revision string unreproducible.
- Emulator: this session's **own private instance** (`bus.mode: own-instance`, private
  `mkdtemp` socket). No `oracle-frontend`/`oracle_gui` was running; nothing the owner could
  be watching was touched.

## What this does NOT prove

That the drifting layer is *visually correct* — that its art, its rate against the camera,
or its interaction with the other four planes looks right. This proves the authored number
reaches the machine and moves the right band by the right amount in the right direction.
The look remains the owner's call.
