# EW-BOUNDARY-ROM-WITNESS — Aurora-authored documents reach the ROM

**Scope ruling honoured:** the artifact half is COMPLETE and measured. **The runtime
half is NOT done, and §5 says exactly why** — two structural blockers, both findings
rather than effort failures.

## 1. What was authored, and by what

Both documents were written by **Aurora's own serializer**, not typed as JSON:
`serializeEffectsPreset` / `serializeEffectsScene`, each round-tripped back through
Aurora's own reader before it left (`serialize(parse(bytes)) === bytes`). The script is
`scratchpad/witness-author.vitest-source.ts`.

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

**Neither effect was observed EXECUTING when this was first written. THE REELS HALF NOW HAS BEEN — see §7, added after aeon supplied the missing poke. The boundary half still has not.**

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

`scratchpad/witness-author.vitest-source.ts` writes both documents. Copy it to
`test/witness-author.test.ts`, run it with `WITNESS_AEON=<aeon copy>`, and delete it again.

⚠ **It is deliberately NOT named `*.test.ts` on disk.** It was, and `check-test-collection`
correctly failed the repo: vitest's `include` covers `test/**` and `src/**/__tests__/**`
only, so a test-shaped file in `scratchpad/` is one that **looks like coverage and runs
never**. The gate caught it the same hour it was written. It is deliberately NOT left in
`test/`: it writes into a peer tree and must never run as part of `npm test`.


---

## 7. THE REELS RUNTIME WITNESS — the walk selects the authored table

*(Added after §5.1/§5.2 went to aeon and aeon answered: `OJZ_Reels_Fill` sits behind
`tst.b OJZ_Reel_Active`, whose **only writer anywhere in the tree** is their witness tool
poking it over the bus. There is no hotkey, deliberately — every remaining pad chord was
enumerated against this shape's readers and none was free. **So the breakpoint never firing
across 642 frames was correct behaviour, not a defect**, and the way in is the RAM cell.)*

Same private own-instance server, same authored DEBUG ROM (`3f919cc7`), symbols bound from
its own listing.

**Control and test differ in ONE value: the active parallax config.**

| | `Parallax_Current_Config` | walk outcome | `a2` after the walk |
|---|---|---|---|
| **control** | `0x13DD4` — `EditorSceneBinding_OJZ_Act1_Sec0` (whatever the scene happened to be) | **MISS** | **`0x14806` = `OJZ_Reel_Speed`, the demo fallback** |
| **test** | `0x13E92` — `EditorSceneBinding_OJZ_Act1_Sec4`, the config the binding table names | **HIT** | **`0x13FCF` — one byte into `0x13FCE`, the AUTHORED table** |

In the test pass `d1` reads `0x00013E92` (the bound config, fetched from
`EditorReelBindings_OJZ_Act1`) and `d2` reads `0x00013FCE` (the authored rates), and `a2`
lands inside the authored table with band 0 already consumed. **`0x13FCE` is where §3
measured Aurora's `[7,-6,4,-2,1]`, absent from the control ROM.**

**The control is what makes this a witness rather than a screenshot of a pointer.** In the
miss pass `d2` ALSO holds `0x13FCE` — the routine reads the candidate either way — and `a2`
still ends at the fallback. So "the authored address appears in a register" proves nothing on
its own; **only `a2` separates the two outcomes**, and only the paired run shows that it does.

**What this does and does not establish.** It establishes that the association walk selects the
Aurora-authored table when the active config is the one the generator bound. It does **not**
establish that a player reaches that state by playing: the config was poked, as was
`OJZ_Reel_Active`. Aeon reads *"show on screen or in a witness"* as satisfied by a poke-driven
witness and notes `OJZ_BaseSwap` was accepted the same way; **that reading is theirs and the
hub's to settle, not this lane's, and it is recorded here rather than assumed.**

**Still not witnessed:** the boundary program executing. It is lowered and bound to section 6
(§4); nothing here drove the player into section 6.


---

## 8. THE BOUNDARY HALF — NOT witnessed, and the reason is a measurement, not a shortfall

The boundary program is lowered, in the ROM, and named by a generated chooser (§4). It is
**not installed at runtime**, and the state is now characterised precisely rather than left
as "did not get to it".

### What was measured

`Raster_InstallPatched` (`0x86C2`) is the engine's single entry for a patched program —
`preset.emp` calls it only when `EffectsPreset.ep_patched(a3)` is non-zero, and takes
`.no_patch` otherwise. Breakpointed across a full run:

- **It fires exactly once per scene start**, at frame 69, with `a0 = 0x14762 =
  `OJZ_TwoChannel`` — a hand-authored program, not Aurora's.
- Teleporting the player **and** the camera into section 6 fires it **not at all**, while
  crossing back **out** to section 0 fires it immediately with `OJZ_TwoChannel` again. That
  asymmetry is the whole tell: the crossing machinery works; section 6 simply has nothing
  patched to install.

**The section arithmetic was derived, not guessed.** `GRID_W = 3` (act descriptor), sections
`1 << SECTION_SIZE_SHIFT` = 2048 px, so section 6 is column 0, **row 2** — *below*, not to the
right. My first attempt swept x and reached a clamped section 2; `Parallax_CheckBoundary`
confirmed the corrected pose with `d0 = d6 = 6`.

### The artifact that explains it

`EffectsPreset` (engine/effects/preset.emp): `ep_raster @ $08`, `ep_patched @ $0C`. Read out
of the built ROM, with section 0 as the control that proves the offset:

| preset | `ep_raster` `$08` | `ep_patched` `$0C` |
|---|---|---|
| `OJZ_Preset_Sec0` `0x145F2` | `0` | **`0x14762` — `OJZ_TwoChannel`** |
| `OJZ_Preset_Sec6` `0x14734` | **`0x86BC` — `Raster_Program_None`** | **`0`** |

**Section 6 carries neither program.** So the generated chooser emits
`if sec == 6 { out = EditorPatched_OJZ_Act1_aurora_boundary_witness }` and the program sits in
the ROM at `0x13FE0`, while the preset object that section 6 actually resolves to has
`ep_patched = 0`.

### What this is NOT

**A mechanism is not asserted here.** The plausible reading is that the preset was bound via
the section sidecar's **`rasterRef`** — a key named for the RASTER arm — while `boundary` is a
**PATCHED** arm, so the binding may lower the program without ever attaching it. **That is a
hypothesis and it is untested.** Two things make it worth aeon's eyes rather than mine:
`rasterRef` is the only preset-binding key a section sidecar has, and the codec parcel already
established that `boundary` lowers into `ep_patched`, the sibling field.

**A caveat that belongs to me, not to aeon:** I set `section_6.meta.json`'s `rasterRef` **by
hand**, preserving the key set, rather than through Aurora's own writer. The generator did
accept it — it reported "2 sidecar rasterRef(s)" and emitted the chooser — but a hand-edited
sidecar is a legitimate suspect and is named here so nobody has to discover it.

**Handed to aeon** with the artifact, per the standing split: the editor-side half is measured,
the engine-side diagnosis is theirs.
