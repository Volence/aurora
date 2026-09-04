# The boundary runtime witness — an Aurora-authored boundary IS installed by the engine

**Result: INSTALLED, witnessed against a control. NOT moving, and that is my document's doing,
not the engine's.**

## Setup

Fresh disposable copy at aeon `6924fbde` (contains the seam fix `aeb9cda7`). Both documents
authored by Aurora's own serializer. Section 6's `rasterRef` → `aurora_boundary_witness`. The
spelling read out of `097c22f5`'s diff: **omit `raster:`**, `patched: ojz_act1_sec_patched(sec: 6)`
with `hand:` omitted. **One edit the gate asked for and I made**: `ojz_act1_sec_patched` added to
`ojz_effects.emp`'s import of the editor module — the new gate catches a dropped binding, which
is what it is for. `FAST=1 DEBUG=1`, a DEV artifact by the build's own banner.

## Artifact

`OJZ_Preset_Sec6` (`0x14734`): `ep_raster $08 = 0`, **`ep_patched $0C = 0x00013FE0`** =
`EditorPatched_OJZ_Act1_aurora_boundary_witness`. Exclusivity holds. `effects_seam_gate: OK`,
now naming both arms.

## Runtime — one instrument, one run, two sections

| when | `a3` (preset) | `a0` at `Raster_InstallPatched` |
|---|---|---|
| boot, section 0 — **control** | `0x145F2` `OJZ_Preset_Sec0` | `0x14762` `OJZ_TwoChannel` |
| crossing into section 6 | `0x14734` **`OJZ_Preset_Sec6`** | **`0x13FE0` — the Aurora-authored program** |

Same breakpoint, same run, `d6 = 6`. The install fires **on the crossing**, which in every
previous attempt it did not, because there was nothing patched to install.

## ⚠ It does not MOVE, and the reason is in my document

`ep_patch_world_ys = [32767, 32767, 32767, 32767]` — all sentinel — and the authored document
carries **neither `patch_world_ys` nor `patch_motion`**. So this is exactly the **fourth
advisory**: a boundary seeded but not swept is legal, builds, installs, and sits still, and
**nothing in aeon or Aurora refuses it**. The hub's bar was *"the tint band moving where the
control's does not"*; that bar is not met and cannot be by this document.

**So the witness demonstrates two things, and the second was not planned:** the install path
works end to end from an editor document, **and the fourth advisory is real** — a legal
document that installs and does nothing is reachable, which is why the panel says so on screen.

**Open:** a moving boundary needs a document carrying both keys. That is authoring, not
engine work, and it is a small follow-on.
