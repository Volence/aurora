# EW-BOUNDARY-ROM-WITNESS — Aurora-authored documents reach the ROM

**Scope ruling honoured:** the artifact half is COMPLETE and measured. **The runtime
half is NOT done, and §5 says exactly why** — two structural blockers, both findings
rather than effort failures.

## 1. What was authored, and by what

Both documents were written by **Aurora's own serializer**, not typed as JSON:
`serializeEffectsPreset` / `serializeEffectsScene`, each round-tripped back through
Aurora's own reader before it left (`serialize(parse(bytes)) === bytes`). The script is
`scratchpad/witness-author.test.ts`.

- **Boundary preset** `aurora_boundary_witness.json`, seeded from `newBoundary()` — the
  panel's own contract-derived seed, so no number in it was invented here.
- **Reels rates `[7, -6, 4, -2, 1]`** into `ojz_act1_depth.json`. Chosen distinct from
  aeon's shipped `[3, -5, 2, -4, 6]` **precisely so the emitted table cannot be theirs by
  coincidence** — five pairwise-distinct i8, satisfying `uniqueItems`.

## 2. The build — and it is a DEV artifact, said in the build's own words

Built in a **disposable copy** of aeon at `origin/master` `75cd390f`, in a private suite
root of symlinks, so nothing here touched the aeon lane's live tree. `FAST=1 DEBUG=1`,
which the build's own banner labels: *"This is a DEV artifact… NOTHING here checked that
— run ./build.sh before you land it."* Nothing is being landed in aeon; this ROM exists
only to be read.

**A boundary preset written by Aurora BUILDS.** `BUILD RC=0`. That is the direct refutation
of the sentence retired earlier today, now measured from the other end rather than inferred
from aeon's page.

| ROM | md5 |
|---|---|
| control (no authored documents) | `2c337eb514dd9abf3f7597cb0f470558` |
| + both authored documents | `98bf668d66017556bec2263f569ec8c3` |
| + section 6 bound to the preset | `3f919cc73e4febc12862405dac78691f` |

## 3. Reels — the authored table is in the ROM, and the control proves it is mine

| what | authored ROM | control ROM |
|---|---|---|
| Aurora's `[7,-6,4,-2,1]` = `07 FA 04 FE 01` | **`0x13FCE`** | **absent** |
| aeon's `[3,-5,2,-4,6]` | `0x14806` (the demo fallback, untouched) | `0x13FCE` **and** `0x1476C` |

**The authored table replaced aeon's at the SAME address.** `EditorReelBindings_OJZ_Act1`
reads `00013e92 00013fce 00000000` — one `(config, rates)` pair then the terminator, whose
rates half is **`0x13FCE`, exactly where Aurora's bytes are**, and whose config half is
`EditorSceneBinding_OJZ_Act1_Sec4`. Section 4's sidecar carries `sceneRef:
ojz_act1_depth` — the scene authored here — so the rung-1 binding the contract requires is
the one that got built.

## 4. Boundary — lowered field-for-field, and bound to a section

`effects_scenes.emp` (generated):

```
const EditorPatchedSrc_OJZ_Act1_aurora_boundary_witness = patchable(
    fx_tint_band(line: 100, slot: 0, pal_line: 2, entry: 4, count: 3, sh: 1),
    ch: 0, lo: 3, hi: 220, offscreen_ship: 1)
```

Against what Aurora wrote — `line 100, slot 0, pal_line 2, entry 4, count 3, sh 1,
channel 0, lo 3, hi 220, offscreen_ship 1` — **every field matches**. It reaches the ROM as
`EditorPatched_OJZ_Act1_aurora_boundary_witness` at `0x13FE0`, and after binding section 6's
`rasterRef`, the generator emits `if sec == 6 { out = EditorPatched_OJZ_Act1_aurora_boundary_witness }`.

⚠ **A WRONG INSTRUMENT ON THE WAY, RECORDED BECAUSE IT READ AS A CLEAN NEGATIVE.** Searching
the ROM for the 4-byte absolute `0x00013FE0` returned **zero references**, which looks exactly
like "nothing uses it". The reference is resolved through a **comptime chooser function**, not
stored as an absolute long, so the search could only ever return nothing whatever the truth
was. Same class as `$16` reading 19 earlier today: **the encoding has to be established before
absence means anything.**

⚠ **AND A CONTROL COMPARED AT A FIXED ADDRESS ACROSS TWO BUILDS IS NOT A CONTROL.** `0x14734`
holds `OJZ_Preset_Sec6` in the authored ROM and something else entirely in the control, because
adding data moved the layout. Resolve per build, by name.

## 5. What is NOT witnessed, and why — both are findings

**Neither effect was observed EXECUTING. No claim is made that one did.**

1. **Reels has no call site in the shipped game path.** `OJZ_Reels_Fill`'s only caller is
   `games/sonic4/test/ojz_scroll_test.emp` — a test game state. A breakpoint on it does not
   fire through boot or ordinary play (measured: 642 frames, no hit). So "drive the game and
   watch it" cannot reach this effect at all.
2. **Aeon's own runtime witness is scoped to the DEMO table and cannot answer the authored
   question.** `tools/reels_witness.py` hardcodes `SPEEDS = [3, -5, 2, -4, 6]`. Pointed at a
   ROM whose active table is authored, it would go red *because the authoring worked*.
   Widening it is aeon's call on aeon's instrument, not this lane's edit.
   `tools/reels_gate.py --shape debug` passes here (5 pairwise-distinct rates, `OJZ_Reels_Fill`
   86 bytes) — but read what it checks: **the fallback `OJZ_Reel_Speed` at `0x14806`**, not the
   authored table. The authored half is §3's measurement and has no gate of aeon's yet.
3. **Boundary firing needs the player inside section 6.** The program is lowered and bound;
   nothing here drove to it.

## 6. Reproduction

`scratchpad/witness-author.test.ts` writes both documents. It cannot run from `scratchpad/`
— vitest's `include` covers `test/**` and `src/**/__tests__/**` only — so copy it to `test/`,
run it with `WITNESS_AEON=<aeon copy>`, and delete it again. It is deliberately NOT left in
`test/`: it writes into a peer tree and must never run as part of `npm test`.
