# Guard transcription — verified against a real aeon build, in BOTH directions

**Date** 2026-08-27 · **Branch** `verify/guard-transcription` · **Parcel type** verification, not repair.

Aurora's Effects panel warns about — and in one case disables — scene shapes because *aeon's
build would refuse them*. Those warnings are a **transcription** of aeon's comptime `ensure`s,
written by reading aeon's source. Nobody had ever checked the transcription against a real
build in either direction. This packet does.

---

## 0. The framing correction that changes how the whole table reads

The brief said "Aurora's Effects panel **refuses** certain scenes". Measured on the code:
**four of the five guards are ADVISORY and nothing is refused.** A warned scene saves, and a
test pins that (row 58's deliberate posture — `scene.ts`'s advisory docblock argues it at
length: *"a second enforcement here would be a second rulebook, free to drift"*).

So in every 2×2 below, **"Aurora refuses"** means *Aurora's specific check fired and the panel
renders the warning* — not that a write was blocked. The one exception is guard 3
(`sprite_mask`), which is a **prevention**: the `<option>` is rendered `disabled`.

This distinction is load-bearing for direction 2. Aurora "accepting" a scene the build refuses
is the **designed** behaviour for guards 1, 2, 4 and 5 — the question this packet can actually
answer is whether the *warning* fires on exactly the scenes the build refuses.

---

## 1. Provenance

| | |
|---|---|
| aeon under test | `git clone` of `/home/volence/sonic_hacks/aeon` at HEAD `0cbb28fb` into scratchpad. **`../aeon` and `../sigil` were never written to.** |
| Banner, EVERY build in this packet | `Assembler: sigil fbf60abd1612 (dirty at capture — 0 modified, 1 untracked)` |
| Revision half | **`fbf60abd`** — matches the pin on all 27 build invocations. Never varied. Stop condition never triggered. |
| `tree:` half | reads `dirty` on every invocation, as the brief said it would. Not treated as a signal. |
| Pins | `SIGIL_BUILD` / `SIGIL_EMIT` = `/home/volence/sonic_hacks/sigil/target/release/{sigil,emit_sound_blob}`, `AEON_SKDISASM_DIR=/home/volence/sonic_hacks/skdisasm` |
| `cargo` inside sigil | **never run.** The two binaries were only *executed*. |

**aeon editor-effects tree, md5 before and after — required line:**

```
BEFORE                                   AFTER (identical)
dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json
bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json
```

`diff` of the two md5 listings is empty. `git -C ../aeon status --porcelain` is unchanged
across the whole parcel (` M docs/lane-status.json`, `?? games/sonic4/data/sprites/object-bindings.json`
— both pre-existing, neither ours).

### 1.1 The environment defect that had to be cleared first, and why it matters

The **first** baseline build on the copy went RED — and it had nothing to do with any scene:

```
FileNotFoundError: [Errno 2] No such file or directory:
'…/scratchpad/sigil/crates/sigil-harness/src/native.rs'
4 failed, 1456 passed, 10 skipped, 49 subtests passed in 13.74s
Tool-suite tests failed — the build tooling is broken, not just the ROM.
```

`tools/emp_helper_closure.py` locates its paired sigil checkout as a **sibling of the aeon
root**, so any copy of aeon that is not beside `sigil/` fails four tool tests before the
assembler is ever reached. Cleared by symlinking `scratchpad/sigil -> /home/volence/sonic_hacks/sigil`
(a symlink; sigil itself was not written).

**This is exactly the trap the brief names.** A red build here looks identical to a red build
caused by a poisoned scene. It is recorded rather than quietly fixed, because it is the reason
the baseline requirement is not ceremony.

### 1.2 Green baselines

| Build | rc | Evidence |
|---|---|---|
| Canonical baseline (untouched copy) | **0** | `emp_expect_fail: OK — 35/35 cases` · `effects_gen: OK` · `built: sonic4 plain native ROM — crc=e9e07375 len=718999` · 66.9 s wall · uptime `up 1 day, 22:49` |
| FAST baseline (the per-case loop) | **0** | same `crc=e9e07375 len=718999` — **byte-identical to the canonical ROM** · 1.7 s · uptime `up 1 day, 22:53` |
| FINAL canonical restore-green | **0** | `emp_expect_fail: OK — 35/35` · `effects_gen: OK` · `crc=e9e07375 len=718999` · 67 s · uptime `up 1 day, 22:57 → 22:59` |

Per-case builds used `FAST=1` (1.7 s vs 67 s) **and** were validated against the canonical
build: FAST emits the byte-identical ROM, and the refusals under test are comptime `ensure`s
inside the one sigil invocation FAST always runs. Every case was followed by a **restore +
rebuild green**, all 13 rc=0 — so every refusal is attributable to the scene and not to
accumulated state.

### 1.3 Method

Fixture JSON → `games/sonic4/data/editor/effects/ojz_act1_start.json` in the **copy** →
`python3 tools/effects_gen.py emit` (regenerates the committed binding module, so the drift
gate cannot mask the guard) → `./build.sh`. This is the author's real path, not a synthetic
one. Aurora's side was measured by running each identical fixture through
`parseEffectsScene` + the panel's own predicates (`sceneDeformAdvisories`,
`leftColumnMaskOptions`, `factor0LockRefusal`, `tableRefAdvisory`,
`layerCurveDeformAdvisory`, `advisoryLayerDeformConflicts`) under vitest.

---

## 2. ⭐ THE POSITIVE CONTROL — what licenses the direction-2 column

Per the mid-parcel instruction: before "Aurora accepted nothing the build refused" can mean
anything, the pipeline must be shown *capable of detecting a refusal at all*.

**Constructed by hand, bypassing Aurora entirely** (the JSON was written by a Python script,
never by the editor): `ojz_act1_start` with `v_deform.columns` attached and **no**
`left_column_mask` key.

Build: **rc=1**. Quoted error text, verbatim:

> `[Error] scene(): a scene with 5 layer(s) attaching a per-column V-deform table (SceneVDeform.Columns, sample speed 0, amplitude shift 2) declares NO left_column_mask policy. With per-column V-scroll on, non-zero Plane-B HScroll makes the leftmost partial column render at a V-scroll the program never wrote — silicon, no register fix (see Vscroll_Write's banner in engine/level/parallax.emp). Design §2 makes the answer mandatory: declare left_column_mask: SceneLeftColMask.Factor0Lock (verified: plane B provably never H-scrolls), .Accept (ship the artifact — a real answer, it is what this game's Rocking and Perspective families do), or .SpriteMask (engine covers the sliver; emission not yet landed, see docs/DEFERRED_WORK.md)`

It names guard 1, by its own text, with this scene's interpolated signature (`5 layer(s)`,
`speed 0`, `shift 2`). **The pipeline detects refusals. The direction-2 column is licensed.**

Six further refusals were produced (§4), each with distinct attributable text — so this is not
a single lucky detection.

### 2.1 A confounder found while establishing the control, relayed to the aeon lane

On the **canonical** (non-FAST) run, the positive control did not surface as a ROM-build
failure. It surfaced through the expect-fail lane, as:

> `emp_expect_fail: FAIL — the sentinel did not fire. `sigil build --extra-entry` is not evaluating the module it is given, so every case below would be vacuous; this run stops here.`

That message is **wrong about its own cause**. The sentinel *did* fire; it reported
`fragment 'EMP_EXPECT_FAIL_SENTINEL' present but got 5 [Error] diagnostic(s), expected 1`,
the four extra diagnostics being the real tree's poisoned scene leaking into every
`--extra-entry` build. **Any red real tree makes `emp_expect_fail` accuse its own mechanism.**
Aeon's, not Aurora's — relayed, not booked here.

---

## 3. Have the guards MOVED? — the headline question

**No. Every one of the five is exactly where Aurora transcribed it, and says what Aurora
says it says.** Read out of `/home/volence/sonic_hacks/aeon` at HEAD `0cbb28fb` today:

| # | Aurora's cited location | Actual location TODAY | Verdict |
|---|---|---|---|
| 1 | `scene_dsl.emp:1288` | `ensure(` at **:1287**, its message string at **:1288** | ✅ points at the rule |
| 2 | `scene_dsl.emp:1293` | `ensure(` at **:1292**, its message string at **:1293** | ✅ points at the rule |
| 3 | `scene_dsl.emp:1354` | `ensure(` at **:1354**, its message string at :1355 | ✅ exact |
| 4 | *(no line cited; "sigil refuses")* | `parallax_dsl.emp:52` (`deform_sine`) and **`:87`** (`deform_triangle`) | ✅ rule intact — see §3.1 |
| 5 | *(no lines cited)* | `scene_dsl.emp:580` + **:586** (curve vs layer deform), **:1251** (curve vs anchor amp), **:1271** (vsplit vs `v_deform`) | ✅ rule intact — see §3.2 |

Guards 1 and 2 were transcribed by **message line**, guard 3 by **`ensure` line**. A
one-line inconsistency in citation style, not a drift. `tools/emp_expect_fail.py:282` is
still the mutual-gate pin, as the brief said.

Two further Aurora citations checked and **both correct**: `scene_dsl.emp:558` is
`let eff_dsb = if is_own == 1 { own_sb } else { dsb }` (the fold), and the `fb` scan at
`:1302-1310` does not consult `enabled`.

### 3.1 Guard 4 — one wording correction for the transcription

Aurora's comment says *"sigil requires a generator's period to DIVIDE the table length"* and
`effects-aeon.ts:363` cites *"period must divide 256"*. Both are **true**, but the owner is
the **engine**, not sigil, and the constant is a **literal 256**, not a derived table length:

> `engine/level/parallax_dsl.emp:52`
> ```
> ensure(256 % period == 0, "deform_sine: period {period} must divide 256")
> ```
> `engine/level/parallax_dsl.emp:87`
> ```
> ensure(256 % period == 0, "deform_triangle: period {period} must divide 256")
> ```

Aurora's `EFFECTS_DEFORM_TABLE_BYTES` happens to be 256 and `scene-ui` asserts `period`'s
schema max equals it, so the two agree today by construction. Recorded because the wording
would send a reader to the wrong repo.

### 3.2 Guard 5 — it is FOUR ensures, not two

Aurora's summary ("`curve` is refused beside a strip's `deform`, and `vsplit` beside a scene's
`v_deform`") under-counts the engine. The engine spells four:

> `scene_dsl.emp:580` — `ensure(is_curve == 0 || (eff_dsa == 15 && eff_dsb == 15),` … *"this layer authors BOTH a curve and a live deform amplitude"*
> `scene_dsl.emp:586` — `ensure(is_curve == 0 || is_own == 0,` … *"this layer authors both `curve:` and `deform: Own(..)`"*
> `scene_dsl.emp:1251` — `ensure(any_curve == 0 || anchor_amp == 0,` … *"this scene carries a curve layer AND an anchor with live deform shifts"*
> `scene_dsl.emp:1271` — `ensure(any_vsplit == 0 || scene_vdeform_is_none(v_deform) == 1,`

**Aurora's `layerCurveDeformAdvisory` covers :580 AND :586 correctly** — it returns early on
`layerDeformValue(layer) !== null` (the `own` arm, :586) before falling through to the
amplitude test (:580). **`:1251` (curve layer + live ANCHOR shifts) has no Aurora counterpart
and is NOT covered by this packet's fixtures** — see §6, UNVERIFIED.

---

## 4. The 2×2s

Legend: **A✓** Aurora's check fired · **A✗** it did not · **B✓** the build refused · **B✗** the build built green.

### Guard 1 — per-column V-deform with no `left_column_mask` (`scene_dsl.emp:1287/:1288`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | `g1_accept` — `v_deform` + `left_column_mask: accept`. rc=0, 0 `[Error]`, `crc=e9e07375`. **AGREE** | — |
| **Aurora warns** | — | `g1_refuse` — rc=1. **AGREE** |

*Which Aurora check fired, and how I know:* `sceneDeformAdvisories(scene)` returned exactly 1
string on `g1_refuse` and 0 on `g1_accept`. Text:
> *"V deform is on and this scene declares no left_column_mask policy, which the build requires: in per-column mode the leftmost partial column renders at a scroll nothing wrote. Answer it on the Left col row below."*

Panel path confirmed: `EffectsScenePanel.tsx:618` maps that array to `<Hint tone="warning">`.
Build error quoted in full at §2. **✅ VERIFIED BOTH DIRECTIONS.**

### Guard 2 — a declared policy with no `v_deform` (`scene_dsl.emp:1292/:1293`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | *baseline* — no `v_deform`, no policy. rc=0. **AGREE** | — |
| **Aurora warns** | — | `g2_refuse` — `left_column_mask: accept`, no `v_deform`. rc=1. **AGREE** |

Aurora: `sceneDeformAdvisories` → 1 string —
> *"this scene declares left_column_mask \"accept\" but attaches no per-column V deform, so the policy adjudicates an artifact that cannot occur; the build refuses it. Clear it to undeclared, or attach a V deform."*

Build:
> `[Error] scene(): left_column_mask is declared but this scene attaches NO per-column V-deform table — the leftmost-partial-column artifact is a property of per-column VSRAM mode (VDP reg $0B bit 2), which this scene never enters, so the policy adjudicates an artifact that cannot occur. Remove the declaration; it would only mislead the next reader into believing this scene is a per-column one`

Names the rule under test. **✅ VERIFIED BOTH DIRECTIONS.**

### Guard 3 — `sprite_mask` refused in every scene (`scene_dsl.emp:1354`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | — | ⚠ **`g3_refuse` — see below. THIS CELL IS OCCUPIED.** |
| **Aurora prevents** | *(no accept-side exists — no scene content makes it legal)* | picker renders the option `disabled` |

Build on `g3_refuse` (`v_deform` + `left_column_mask: sprite_mask`): **rc=1**.
> `[Error] scene(): left_column_mask: SpriteMask is declared, but the engine's left-column strip emission has NOT landed — the declaration would be accepted while the sliver stays uncovered. It is blocked on an aeon+sigil pair (the strip emitter needs engine/objects/sprites.emp's FIRST Game.*/CAP_* reference, a sigil port-flip) and on the game-owned opaque mask tile; the mechanism ruling (opaque strip at screen X 0, first in the link chain — NOT the VDP's X=0 sprite-masking feature, which suppresses later sprites and cannot repaint a plane pixel) and the 7-slot pricing are already recorded in docs/DEFERRED_WORK.md §'Sprite mask for per-column V-scroll' and tools/effects_budget_model.toml. Declare Factor0Lock or Accept, or land the emission parcel first`

**Aurora, on the identical document:** `parseEffectsScene` accepts it, `sceneDeformAdvisories`
returns **`(none)`**, `advisoryLayerDeformConflicts` returns none. `leftColumnMaskOptions`
reports `disabled: ["sprite_mask"]` — but *disabling an option does not warn about the value
already selected*. The prevention is real for **authoring**; it does nothing for a document
that already carries the value.

**What the author actually sees** (traced through `EffectsScenePanel.tsx:601-606` and
`leftColumnMaskRowVisible`): the policy row IS on screen, and the closed `<select>` displays
the disabled option's label — which is `` `sprite_mask` + ' (engine refuses)' ``. So the signal
is **a four-word suffix on a control label**, where guards 1, 2 and 5b each get a full warning
row. Not silent, but **the only one of the five guards with no advisory**, and the asymmetry
is undocumented. **Booked as ROADMAP row 62. Not fixed** — this is a verification parcel.

**The transcription itself is CORRECT**: the engine does refuse `sprite_mask` in every scene,
at the line Aurora cites. The gap is in *coverage of the surface*, not in the rule.

### Guard 4 — a generator's `period` must divide 256 (`parallax_dsl.emp:52` / `:87`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | `g1_accept` (period 32). rc=0. **AGREE** | — |
| **Aurora advises** | — | `g4_refuse` (period 100). rc=1. **AGREE on the diagnosis, by design not on the outcome** |

Build:
> `[Error] deform_sine: period 100 must divide 256`

Exactly one `[Error]`, naming guard 4 and nothing else — the cleanest attribution in the packet.

Aurora: `tableRefAdvisory(v_deform.table)` →
> *"period 100 does not divide the 256-byte table — the cycle would not close and the build refuses it"*

Surfaced at `EffectsScenePanel.tsx:250` (`TableRefField`), so it reaches the author on every
table control. **The diagnosis matches exactly.** The document still saves — the designed
posture. **✅ VERIFIED BOTH DIRECTIONS.**

⚠ **But the affordance is a separate defect and it is booked as row 63.** `period`'s schema
range is 1..256 and the control is a plain clamped spinner, so **247 of the 256 reachable
values are illegal** — only 9 divide 256. Every other numeric control in this panel clamps to
a range in which every value is legal. Row 60 already had to special-case this (`period` takes
`max ÷ N` in the harness *"because the build refuses a period that does not divide the table"*).

### Guard 5a — `curve` beside a strip's `deform` (`scene_dsl.emp:580` + `:586`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | `g5a_accept` — curve on layer 3, `dsa`/`dsb` both 15. rc=0. **AGREE** | — |
| **Aurora warns** | — | `g5a_refuse` — curve on layer 3 with `dsa: 2`. rc=1. **AGREE** |

Aurora: `layerCurveDeformAdvisory(layers[3])` →
> *"this strip authors a curve and a live deform amplitude (dsa 2 / dsb 15; 15 is the no-deform sentinel) — the build forbids curve and deform on one strip."*

Build:
> `[Error] layer(): this layer authors BOTH a curve and a live deform amplitude (dsa 2 / dsb 15; 15 is the no-deform sentinel). Design §2 forbids curve AND deform on one layer: the fill's curve loop already spends all seven usable data registers (accumulator, whole step, Bresenham remainder and error, span modulus, constant FG word, line index) plus two address registers, and a sampled channel needs three more. Give the deform to a different layer, or drop the curve`

Aurora reproduces the engine's own interpolated values (`dsa 2 / dsb 15`) and its sentinel
explanation. **✅ VERIFIED BOTH DIRECTIONS.** (`:586`, the `own`-arm twin, is covered by
Aurora's early return but has **no build fixture here** — §6.)

### Guard 5b — `vsplit` beside a scene's `v_deform` (`scene_dsl.emp:1271`)

| | Build ACCEPTS | Build REFUSES |
|---|---|---|
| **Aurora silent** | `g5b_accept` — vsplit on layer 3, no `v_deform`. rc=0. **AGREE** | — |
| **Aurora warns** | — | `g5b_refuse` — vsplit + `v_deform` + `accept`. rc=1. **AGREE** |

Aurora → *"V deform is on and layer 3 authors a Plane B split — both write the same VSRAM word, and the build refuses the pair. Author one of them."*

Build:
> `[Error] scene(): a layer authors vsplit: At(..) while this scene attaches a per-column V-deform table (SceneVDeform.Columns). Same word, second collision: in per-column mode (VDP reg $0B bit 2) VSRAM entry 1 is PLANE B OF COLUMN 0, not the plane, and Vscroll_Write ships the whole 80-byte column buffer by DMA each frame — so a whole-plane mid-frame write below the line would shift ONE 16-px column of forty and leave the rest where the column buffer put them. Whole-plane vertical depth and per-column V-deform are two spellings of the same VSRAM; author one of them`

Aurora even names the correct layer index. **✅ VERIFIED BOTH DIRECTIONS.**

---

## 5. `factor0_lock` — the deliberate divergence, re-checked

**Claim under test:** Aurora is stricter than the engine in exactly one spot, and stricter is safe.

### 5.1 The divergence is REAL, still present, and still in the STRICTER direction

`f0_packed`: every layer's `fb` = `{s1: 15, s2: 15, op: 0}` (which packs to `$0FF` = `FACTOR_0`),
`v_deform` on, `left_column_mask: factor0_lock`.

| | Result |
|---|---|
| **Build** | **rc=0, 0 `[Error]`, `crc=e9e07375 len=718999`** — the engine compares `l.ly_fb != $0FF` on the packed byte and the claim is TRUE |
| **Aurora** | **warns** — `factor0LockRefusal` → *"layer 0's Plane B factor is packed(15, 15, +), not FACTOR_0 (a custom packed factor: Aurora cannot prove it is locked) — the partial column exists on every line where Plane B scrolls, so the claim is false as authored and the build refuses it."* |

**Aurora refuses, the build accepts. Stricter, exactly as documented.** The control column
`f0_named` (same scene, `fb: "FACTOR_0"` by name) is **silent in Aurora and green in the build**
— so the divergence is isolated to the packed spelling and is not Aurora rejecting the whole
family. Aurora's own docblock predicted this outcome verbatim, and it holds.

⚠ One wording nit: Aurora's message ends *"and the build refuses it"*, which is **false for
this exact case** — the build accepted it. Cosmetic, inside a deliberately-stricter check;
noted, not booked.

### 5.2 Is it still the ONLY divergence? — tested, and yes on everything reachable

The engine's `factor0_lock` precondition is two halves. Both were checked against source and
one was built:

**Half one** (`scene_dsl.emp:1309`, `lcm_fb_unlocked`) — scans `l.ly_fb != $0FF` over `0..count`
with **no `enabled` consultation**. Aurora's `layerFbIsZero` scan is over all `scene.layers`,
likewise ignoring `enabled`. **Faithful.** Its one gap is §5.1's packed spelling.

**Half two** (`scene_dsl.emp:1346`, `lcm_b_deform_live`) — `lcm_b_amp` scans `l.ly_dsb != 15`
**plus** the anchor's `dsb` when `anchor_ch != $FF`; `lcm_b_table` is `deform_bg` not-none **or**
`any_own`. Aurora's `effectiveDsb` implements the engine's `eff_dsb = is_own ? own_sb : dsb`
fold (`:558`), checks `scene.anchor.at.dsb`, and tests `deform_bg` or any layer `own` — and
correctly does **not** count `deform_fg`. **Faithful, field for field.**

Built as `f0_half2` (all `fb: FACTOR_0`, layer 2 `dsb: 2`, a `deform_bg` shared table,
`factor0_lock`, `v_deform` on):

| | Result |
|---|---|
| **Build** | **rc=1** — `[Error] scene(): left_column_mask: Factor0Lock claims the leftmost partial column cannot exist, but this scene can put live H-deform on Plane B — a layer or anchor dsb is not 15 while a table can reach the plane (the scene's deform_bg, or a layer's Own table, which serves both planes). Deform adds per-line Plane-B HScroll on top of the locked factor, so the sliver comes back on exactly those rows. NOTE the check is conservative: table contents are Labels and invisible at comptime, so a live dsb against the all-zero table is refused too (Rocking spells Accept for this reason). Silence the B amplitude, or declare Accept / SpriteMask` |
| **Aurora** | **warns, naming the same layer** — *"layer 2 has a live Plane B deform amplitude (shift 2; 15 is the no-sample sentinel) while a table can reach the plane — deform adds per-line Plane B scroll on top of the locked factor, so the sliver comes back on those rows. The build refuses it, conservatively: table contents are invisible at build time, so even an all-zero table counts."* |

**AGREE.** Half two is verified in the refuse direction with no divergence at all.

**Conclusion: the packed-triple case is still the only divergence found, and it is still
stricter-not-permissive.** Bounded honestly — see §6.

---

## 6. UNVERIFIED cells, stated rather than filled in

1. **`scene_dsl.emp:1251` — curve layer + live ANCHOR deform shifts.** No fixture, no build.
   It is part of guard 5's family and **Aurora appears to have no counterpart for it at all**
   (`layerCurveDeformAdvisory` is per-layer; `sceneDeformAdvisories` has no anchor arm).
   That is a *suspicion from reading*, not a measurement, and it is recorded as UNVERIFIED
   rather than booked as a defect.
2. **`scene_dsl.emp:586` — `curve` + `deform: Own(..)`, build side.** Aurora's early return
   covers it in source; no build fixture was run. Aurora-side verified, build-side UNVERIFIED.
3. **`deform_triangle`'s period guard (`parallax_dsl.emp:87`).** Only `deform_sine` (`:52`) was
   built. The two `ensure`s are textually identical and Aurora's `tableRefAdvisory` is
   generator-agnostic, so the risk is low — but it was not measured.
4. **"Only ONE divergence" is bounded by the fixtures run.** §5.2 checks the `factor0_lock`
   precondition field-by-field against source and builds half two. It is not an exhaustive
   search over all scene shapes, and should not be read as one.
5. **NOT SEEN ON HARDWARE / no emulator touched**, per the standing invariant. Nothing here
   needed one — this parcel tests whether things BUILD.

---

## 7. Summary

| Guard | Direction 1 (false refusal) | Direction 2 (false acceptance) |
|---|---|---|
| 1 · `v_deform` w/o policy | ✅ none | ✅ none |
| 2 · policy w/o `v_deform` | ✅ none | ✅ none |
| 3 · `sprite_mask` | ✅ none | ⚠ **gap — no advisory; label suffix only. Row 62** |
| 4 · `period` divides 256 | ✅ none | ⚠ **by design (advisory). Affordance defect → row 63** |
| 5a · `curve` + strip deform | ✅ none | ✅ none |
| 5b · `vsplit` + `v_deform` | ✅ none | ✅ none |
| `factor0_lock` precondition | ⚠ **1, deliberate, STRICTER (packed `{15,15,0}`)** | ✅ none |

- **No guard has moved.** All five are where Aurora transcribed them and say what Aurora says.
- **No false refusals** among the five. The only Aurora-refuses/build-accepts case is the
  documented `factor0_lock` packed-triple divergence, confirmed still stricter.
- **Direction 2 is licensed by a positive control** (§2) and produced **one real gap**
  (`sprite_mask`, row 62) plus one affordance defect (row 63).
- **Booked, not fixed:** rows 62 and 63. Nothing in `src/` was changed by this parcel.

---

## 8. Reproduction

Fixtures are eleven JSON documents differing from `ojz_act1_start.json` by one or two authored
fields each: `g1_refuse` (+`v_deform`), `g1_accept` (+`v_deform` +`left_column_mask: accept`),
`g2_refuse` (+`accept` only), `g3_refuse` (+`v_deform` +`sprite_mask`), `g4_refuse`
(+`v_deform` with `period: 100` +`accept`), `g5a_refuse` / `g5a_accept` (layer 3 curve, `dsa: 2`
vs `dsa: 15`), `g5b_refuse` / `g5b_accept` (layer 3 vsplit, ±`v_deform`), `f0_packed` /
`f0_named` (all `fb` packed `{15,15,0}` vs named `FACTOR_0`, +`v_deform` +`factor0_lock`), and
`f0_half2` (all `fb: FACTOR_0`, layer 2 `dsb: 2`, +`deform_bg` +`v_deform` +`factor0_lock`).

`v_deform` throughout is
`{"columns": {"table": {"generator": "sine", "amplitude": 8, "period": 32}, "speed": 0, "amp_shift": 2}}`.

Loop: clone aeon to a scratch dir, **symlink `sigil` beside it** (§1.1), install a fixture as
`games/sonic4/data/editor/effects/ojz_act1_start.json`, `python3 tools/effects_gen.py emit`,
`FAST=1 ./build.sh` with the three pins, then `git checkout --` the fixture and rebuild to
prove green.
