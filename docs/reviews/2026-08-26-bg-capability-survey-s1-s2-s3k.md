# Background capability survey — Sonic 1, Sonic 2, Sonic 3&K vs. the aeon/Aurora effects model

*2026-08-26. Read-only research; no source edits. Owner's question: "check Sonic 1, Sonic 2 and
Sonic 3&K and see if there's anything so far we couldn't do that they do for backgrounds."*

**Surveyed at:** aurora `ec58cc1`, aeon `c3f5cbe0` (read by path, not built), empyrean
`origin/main` `4ec0a52` (`docs/AURORA_EFFECTS_SCHEMA.md`), s1disasm `f6ece65`
(`Revision = 1`, so `_inc/DeformLayers (REV01).asm`), s2disasm `e45ebf3` (`s2.asm`), skdisasm
`2fcd861` (`sonic3k.asm` + `Lockon S3/Screen Events.asm`). Every line number below is from those
revisions. No emulator was used; nothing here is a runtime measurement.

> ## ⚠ [TAG-PEER] EVERY "aeon" VERDICT HERE MEASURES ANOTHER LANE'S SOURCE. RE-MEASURE BEFORE QUOTING.
>
> *(Banner rewritten 2026-08-29 by the aurora overseer as parcel **O19**, replacing the
> provisional one at `d15b9e0`. The pass behind it is complete: **all 25 rows re-measured**, none
> left unchecked. Yes, 25 — the table is numbered 1..25 and has always had 25 rows; the "21" in
> circulation was a miscount, and a row nobody counts is a row nobody re-checks.)*
>
> **What a stale row costs, twice in one night, both real:**
>
> 1. **Row 4 (layer cap).** The row said the engine caps a scene at **8 layers**.
>    `MAX_PARALLAX_BANDS` went **8 → 16 and landed** on 2026-08-27. A peer planned an overnight
>    parcel off the dead number — *"band merging to fit the 8-layer cap"* — and this lane was one
>    dispatch from building an advisory for a limit that does not exist at that value.
>    **Aurora's own vendored schema already read `maxItems: 16`.** The prose in a review beat the
>    machine-readable file in the same repo, because prose is what people quote.
> 2. **Row 6 (time-driven drift).** Proposed to this lane as **editor-only** work. The row's own
>    verdict column says **Engine M + Schema S**, with the one Aurora field arriving *after* both.
>    Both premises of that proposal were contradicted by this document, by a reader who read a
>    summary of it instead of the column.
>
> **A row can be HALF stale, and that is the failure mode this banner exists for.** Row 4's
> *number* died and its *reasoning* survived word for word — the cap is per scene, per 512-line
> plane, not per screen. A reader who threw the whole row away would have lost the useful half; a
> reader who kept the whole row planned against a phantom. **Every row below now says which half.**
>
> **Per-row markers, not one doc-wide warning.** Doc-wide staleness is unactionable: it tells you
> to distrust everything, so you distrust nothing. Each row in §B now carries its own
> **`[O19 @ aeon 4f846e25 — …]`** marker naming the verdict now, the **symbol** the claim rests on,
> and the file. Trust row 7 while distrusting row 4.
>
> **Symbols, not line numbers.** Where a marker could cite either, it cites the symbol. Line
> numbers rot faster, and a value referenced through a named constant does not appear in a grep for
> its literal — which is exactly how the 2026-08-28 `PATH_B_SOL_SHIFT` incident happened.
>
> ### The one-command re-check
>
> ```
> git -C ../aeon grep -n <SYMBOL> origin/master        # or: git -C ../aeon show <rev>:<path>
> git -C ../empyrean grep -n <key> origin/main -- contract/schema/
> ```
>
> Read at a **revision**, never through the sibling working tree — those are live checkouts being
> edited right now, and a path read is not reproducible.
>
> ### O19 re-grounding pass — measured at
>
> | side | revision | how it was read |
> |---|---|---|
> | **aeon** | **`4f846e25`** | `git show 4f846e25:<path>` / `git grep 4f846e25` — never by path |
> | **empyrean** | **`86925008`** | same form, `contract/schema/` |
> | **aurora** | `8b716f5` (this repo, §E7 and the vendored schema only) | working tree |
>
> The S1/S2/S3K citations are **not** re-measured by O19 and did not need to be: they are pinned
> disassemblies (see "Surveyed at" above), the most stable content in the document.
>
> ### Which rows are most perishable — the standing ranking
>
> | tier | rows | why |
> |---|---|---|
> | **HOT** — assume stale, re-check every time | **4, 5** (a ceiling constant), **6, 15** (an in-flight design), **11, 19, 20** (d-31 is being priced now), **16, 17** (the wave-2 preset surface is landing) | each names a number or a surface that moved, or is moving, inside the last week |
> | **WARM** — check the symbol, expect it to hold | **2, 8, 14** (capability bits; a game's `SCANLINE_CAPS` word can flip without any engine change), **7, 13** (a stated loss that a small engine parcel could lift) | the mechanism is stable; the *adoption* is not |
> | **COLD** — structural, moves only with a rewrite | **1, 3, 9, 10, 12, 18, 21, 22, 23, 24, 25** | plane geometry, VRAM layout, the 68000 |
>
> **The weakest row in the pass is 22**, and it is labelled: its NO is an argument from absence,
> not a symbol. Absence claims are the ones a grep for a literal gets wrong.
>
> ### What O19 could not settle
>
> Nothing was left unmeasurable at the pinned revisions. **Two claims are TAGGED for foreground
> runtime confirmation** and neither is load-bearing for any row's verdict: aeon's own drift-design
> §10.6 numeric witness, and the cycle re-measurement behind row 4's landed cost (both are aeon's,
> and both are *corroboration* of source derivations, not the derivations themselves). **No
> emulator was used by this pass, as by the original.**
>
> ### Peer-document errors found while re-grounding (aeon's to fix, not ours; do not repeat them)
>
> - `docs/DEFERRED_WORK.md` says a proposed guard *"names `PLANE_B_SPAN`, which is not a constant
>   that exists."* It exists — `engine/level/parallax.emp:410`, with its own `ensure` at `:411`
>   and a mirror pin at `scene_dsl.emp:60`.
> - `engine/level/scene_dsl.emp:137` says of `CAP_FACTOR_CURVE` that *"neither shipped game raises
>   it."* sonic4's `SCANLINE_CAPS = $005E` contains $0040. Curves are shipped.
>
> Both are the same species as row 4: a true sentence that outlived the thing it described.

Abbreviations: **S1** `s1disasm/_inc/DeformLayers (REV01).asm` unless another file is named;
**S2** `s2disasm/s2.asm`; **S3K** `skdisasm/sonic3k.asm`, **SE** `skdisasm/Lockon S3/Screen
Events.asm`; **pd** `aeon/engine/level/parallax_dsl.emp`; **sd** `aeon/engine/level/scene_dsl.emp`;
**px** `aeon/engine/level/parallax.emp`; **ba** `aeon/engine/level/bg_anim.emp`; **rd**
`aeon/engine/effects/raster_dsl.emp`; **schema** = the empyrean schema doc.

---

## A. Verdict

Scroll-wise, the model already covers most of what the three games do with a background: flat
strips at any fraction the two-term encoding can spell, per-scanline strip tops, per-line factor
ramps (finer than S1's own 16-px-row ramps), sine/triangle wobble on either plane with
independent phases, a mid-frame vertical split, per-column vertical scroll, and per-section scene
switching with a lerp. Starlight Zone in particular is fully expressible (§C). The gaps that
matter are four, and they are engine gaps, not schema or Aurora gaps: **(1) time-driven
horizontal drift** — clouds and stars that move with no camera input — appears in every one of
the three games (GHZ, WFZ, HTZ, DEZ, SCZ, AIZ, MGZ, FBZ, ICZ, LBZ2, SSZ …) and the band factor has
no clock term at all; BgAnim's `timer` driver can fake it for a tile strip at power-of-two rates,
which is a partial, budget-costly stand-in. **(2) Background art wider than one 512-px plane**,
i.e. per-band background cameras redrawing Plane B as you move (S1 GHZ/MZ/SBZ, S2 CPZ, all of S3K's
`Draw_BG` band tables): aeon blits Plane B once at level load and never redraws it, so every
background layer must tile at 512 px and the whole act's background lives in 448 tiles.
**(3) Background art that changes mid-act** (AIZ fire, FBZ indoor/outdoor, ICZ, HCZ2 wall) — same
root cause; the seam-streaming spec that would fix (2) and (3) is already booked in aeon.
**(4) Camera-tracking vertical scroll below a split** (S3K AIZ2 battleship / MHZ2 airship via
`HInt6`): our split writes a constant and is refused on a camera-tracking plane. Everything else
is either already there, a fraction rounding (vertical factors are shifts only — MZ's 3/4, SYZ's
3/16, CNZ's 13/128 round to 1/2, 1/4, 1/8), or a nicety (deform phase speeds below 1 step/frame,
non-uniform tile-frame durations, palette-cycle authoring in Aurora). §B is the table, §C the
per-zone list, §D what we do that they never did, §E where this brief was wrong.

**[O19, 2026-08-29 @ aeon `4f846e25` — ALL FOUR GAPS RE-MEASURED AND ALL FOUR STILL HOLD.** That
is a real result, recorded rather than left to silence. What moved around them: **(1)** now has a
full engine design and a gated contract field, but no engine code — still a gap. **(2)** and
**(3)** are unchanged at the root (`BG_Init` blits once, `Draw_BG_TileColumn` still has zero
callers) and their *vertical* half is now scoped and priced under aeon's d-31 option 3; the
horizontal half is not. **(4)** is untouched. The one sentence in this paragraph that has aged
badly is not a gap at all: *"the whole act's background lives in 448 tiles"* is still true, and
streaming makes 448 bite **harder**, not softer — 1.45× harder for OJZ. Everything else here
holds.**]**

---

## B. Capability table — by technique, across all three games

Legend for "aeon": **YES** expressible through the wave-1 JSON + engine as shipped; **PARTIAL**
expressible with a stated loss; **ENGINE-ONLY** the engine has it but the Aurora schema does not
author it; **NO** not expressible. "Smallest fix" names the layer (engine / schema / Aurora UI)
and a size guess (S / M / L).

**Every aeon cell also carries an `[O19 @ aeon 4f846e25 — …]` marker**: the verdict as of
2026-08-29, the symbol the claim rests on, and — where a row is half stale — **which half died**.
Read the marker before the cell; it is newer.

### B.0 — the O19 roll-up

[TAG-PEER] *This table measures a peer at a pinned revision. It is perishable; re-measure before
quoting. Full evidence is in each row's own marker.*

| # | verdict now | primary symbol re-checked | which half died |
|---|---|---|---|
| 1 | unchanged | `packed()` / `FACTOR_*`, `Decode_Factor_A/B` | — (only a line cite in the fix column) |
| 2 | unchanged, and now **shipped** | `SceneCurve.To`, `CAP_FACTOR_CURVE` in sonic4's `$005E` | — |
| 3 | unchanged | `band_top_plane`, `Parallax_Fill_PerLine` | — |
| 4 | **CHANGED** | `MAX_PARALLAX_BANDS` = **16** | **NUMBER died (8), REASONING lived** (per scene, per 512-line plane). Fix column dead: landed + fully costed. |
| 5 | **half stale** | `MAX_PARALLAX_BANDS` | the **8** inside the YES; the YES itself lived |
| 6 | verdict unchanged | no `band_drift` / `CAP_BAND_DRIFT` anywhere; `LAYER_KEYS` has no `drift` | **FIX column died** — the shadow-view accumulator is structurally impossible. Design + gated schema field now exist. |
| 7 | unchanged | `Parallax_Deform_Phase_FG/BG`, speed `u8` | — |
| 8 | unchanged | `CAP_MULTI_DEFORM_TABLE` $0020 vs `SCANLINE_CAPS` $005E | — (refusal moved file/line) |
| 9 | unchanged | `scene_dsl.emp:275-278` Plane-A hard lock | — |
| 10 | unchanged | `bganim_band.driver` = Camera_X | — |
| 11 | mechanism unchanged | `Parallax_Step5_Vscroll`, one `asr.w` | — but a **new** measured consequence: `512 << v_factor` act-height ceiling, OJZ 2,048 px past it; d-31 opt 3 scoped |
| 12 | unchanged | `PLANE_B_SPAN` = 512 | — (and aeon's doc claiming that constant does not exist is wrong) |
| 13 | unchanged | `fx_vscroll_split` = `stream_vsram(2,[offset])` | — |
| 14 | unchanged **+ new obligation** | `SceneVDeform.Columns`; `left_column_mask` now mandatory | — |
| 15 | verdict unchanged | `pcfg_v_offset` still a constant | **FIX column died** — a bob does NOT ride on row 6's parcel; it is a scene-level Step-5 term |
| 16 | **CHANGED** | `aurora-effects-preset.schema.json` (empyrean) | **"not authorable" half died**: bands are a JSON PRESET doc now. The "not a scene field" half lived. New live limit: an unbound preset **shows nothing**. |
| 17 | unchanged | `PAL_CYCLE_MAX_CHANNELS` = 4; `cycles` reserved-and-refused | — |
| 18 | unchanged | `fx_sh_below`, `reg_set`, `stream_vsram`, `stream_cram` | — |
| 19 | verdict unchanged | `BG_Init` blits once; `Draw_BG_TileColumn` **still zero callers** | — but the fix is now **scoped and priced** (d-31 opt 3, vertical only) |
| 20 | unchanged | same as 19 | — |
| 21 | unchanged | `BGANIM_BANKS` = 8; `sec_anim_blocks` still has one occurrence (its declaration) | — |
| 22 | unchanged | *(absence claim — the weakest row here, and labelled)* | — |
| 23 | unchanged, **stronger** | `boot_data.emp:140-158`: window disabled AND no free window VRAM | — |
| 24 | unchanged | `reg_set` refuses persistence; `Set_VDP_Reg` | — |
| 25 | unchanged | `VDP_REG_0C_BOOT` — "no interlace" | — |

Outside §B, **§E7 also moved** (the Aurora panel now authors six more fields than the row claims)
and **§F's open items are closed**. §E6, §E5 and §E10 were re-checked and hold.

### B.1 Horizontal scroll

| # | Technique | Who does it (routine) | aeon | Smallest fix |
|---|---|---|---|---|
| 1 | **Flat strip at a camera fraction** | Every zone. S1 GHZ 3/8 + 1/2 (S1:55-69); MZ 3/4,1/4,1/2 (S1:255-277); SBZ1 1/2,1/4,3/8 (S1:558-579). S2 EHZ 1/64, 1/16, 3/32 (S2:15276-15328); CPZ 1/8 + 1/2 (S2:17247-17260); OOZ 1,1/4,1/8,1/16 of BG cam (S2:16355-16377). S3K CNZ 7/16 (S3K:107690); LBZ1 1/16 (SE:1571-1584); LRZ 1/8 (S3K:115403-115410). | **YES** for any fraction of the form 2^-a or 2^-a ± 2^-b, a,b in 0..14 (pd:21-40 `packed(s1,s2,op)`; named set pd:25-40; custom `{s1,s2,op}` schema §2.3). **PARTIAL** for fractions outside that set: S2 MCZ/ARZ n/10 (S2:16472-16480, 17708-17714), MZ clouds 6/5-based ramp, CNZ 13/128 vertical (S3K:107669-107677) — nearest expressible: 1/10 → 3/32 (=0.094) or 7/64 (=0.109, `{s1:3,s2:6,op:1}`); 3/10 → 5/16; 13/128 → 7/64 or 3/32. **[O19 @ aeon `4f846e25` — UNCHANGED.** `packed()` + the named `FACTOR_*` set, `engine/level/parallax_dsl.emp:21-40` (16 names, same 16); `Decode_Factor_A` / `Decode_Factor_B`, `engine/level/parallax.emp:1678` / `:1712`, still two `asr.w` terms; `band_entry`, `:83`, still 10 bytes with no spare. The *fix* column's line cite moved: `MAX_PARALLAX_BANDS` is `engine/system/constants.emp:638`, not `:602`.**]** | Schema/engine M if ever wanted: a third term or an 8.8 multiplier per band. Decode is two `asr.w` terms (px:1619-1651) and the 10-byte `band_entry` has no spare byte (px:71-82); it would be a capability-gated tail like `band_curve` (px:181-205). Not recommended — nothing in the three games needs n/10 visibly. |
| 2 | **Per-row / per-line factor ramp** (horizon, ground plane) | S1 GHZ water per-scanline (S1:144-163, `camX/208` per line); MZ/SLZ/SYZ/SBZ1 per-16-px row (S1:304-324, 375-395, 479-535, 600-620). S2 EHZ 78-line ramp `-camX/128`/line grouped 1/2/3 lines (S2:15332-15380); HPZ mirrored (S2:16142-16182); CNZ 7 rows (S2:17047-17061); DEZ Earth limb 7/8,6/8,5/8 (S2:17497-17512). S3K AIZ1 intro 37 steps (SE:530-538); ICZ2 40-line ramp (SE:1267-1269); MHZ2 pillar `divu #$30` 48 lines (S3K:113203-113230); band tables with `$8000\|N` = N per-scanline values (S3K:103670-103674). | **YES** — `curve: {to: factor}` ramps Plane B linearly from `fb` at the layer top to `to` at its bottom, per scanline by Bresenham (sd:256-286; px:1718-1723, 1846-1857). Endpoints must be packed factors (sd guard 3). Ramps whose ends are not in the set round as row 1. Ramps that are not linear (S3K CNZ's irregular multiples S3K:107693-107716; MGZ1's swapped last two rows SE:1019-1022) become extra flat layers. **[O19 @ aeon `4f846e25` — UNCHANGED, and now SHIPPED rather than merely available.** `SceneCurve.To`, `engine/level/scene_dsl.emp:289`; the five curve guards at `:608`, `:614`, `:621`, `:627`, `:633` (guard 1 = `:608`, the deform-amplitude refusal); `CAP_FACTOR_CURVE = $0040`, `scene_dsl.emp:187`, and sonic4's `SCANLINE_CAPS = $005E` (`games/sonic4/config/game.emp:71`) **does** contain it — $5E = $02+$04+$08+$10+$40. Beware a stale comment in aeon's own tree: `scene_dsl.emp:137` still says *"neither shipped game raises it"*, which the caps word contradicts.**]** | None for linear ramps. A curve layer may not also carry a deform amplitude (sd guard 1 — register file measured, not the design's stated reason). |
| 3 | **Non-8-px strip tops; strips shorter than 8 lines** | Routine. S2 EHZ tops 22/80/101/…; ARZ rows 21,12,14,6,12,31 (S2:17795). S3K HCZ1 `5,5,6` (SE:972); MGZ1 `4,4,$D,$13` (SE:1025); ICZ1 intro has a 2-line band (SE:1253); HPZ `4,4` (S3K:120239). | **YES** — band tops are plane LINES 0..511 (px:77,84 `band_top_plane: u16`), the fill is per-line for every scene (px:1727 `Parallax_Fill_PerLine`; sd:588-590 "per-line for every scene since 2026-08-26"); `world_y` is a pixel (schema §2.2). **[O19 @ aeon `4f846e25` — UNCHANGED.** `band_entry.band_top_plane: u16` (0..511), `engine/level/parallax.emp:84`; `Parallax_Fill_PerLine`, `:1786`; `PLANE_B_SPAN = 512`, `:410`. The per-line-for-every-scene fact is now load-bearing elsewhere too: `CAP_PER_LINE` is RETIRED (`scene_dsl.emp`, the RETIRED block above the CAP list).**]** | — |
| 4 | **Many strips on screen** | S3K MGZ2 16 in one frame (SE:1204); SSZ1 29-band table (S3K:117578); FBZ indoors 34 bands (S3K:109227); S2 DEZ 36 bands (S2:17600), MCZ 24 (S2:16585), WFZ ~38 (S2:15729). | **PARTIAL** — hard cap **16 layers per scene** ~~8~~ (the 8 was true when this row was written and died on 2026-08-27; the sentence that follows it did not), and the cap is per scene = per 512-line plane, not per screen (`scene()`, scene_dsl.emp:1117-1118; anchored scene needs count+1 ≤ 16, :1123-1124). Tall acts get another 16 per section via `sceneRef` (schema §3; `act_descriptor.emp:35-55`), but a single screen never shows more than 16. **[O19 @ aeon `4f846e25` — CHANGED, HALF STALE. THE NUMBER DIED; THE REASONING LIVED.** `MAX_PARALLAX_BANDS = 16`, `engine/system/constants.emp:638`; `scene()`'s ceiling `engine/level/scene_dsl.emp:1117-1118` and the anchored `count + 1 <= 16` at `:1123-1124`; `tools/effects_gen.py:193` mirrors 16; empyrean `86925008` `contract/schema/aurora-effects-scene.schema.json:398` = `maxItems: 16`; **and Aurora's own vendored copy already reads 16** (`src/core/formats/effects/aurora-effects-scene.schema.json:398`, cap derived in `scene-ui.ts`). **The 'hard cap 8' is dead.** What survives verbatim: the cap is per SCENE = per 512-line plane, not per screen. **The whole 'Smallest fix' column is also dead** — it landed 2026-08-27 (`parcel/band-ceiling-16-impl`), and both halves are costed: RAM +224 B, cycles O(live band count) so an unused ceiling costs ZERO per frame, a full 16-band scene 17,474 cyc = 13.7% of the NTSC frame. Side effect worth knowing downstream: `parallax_config` grew 28 -> 30 and `pcfg_layer_mask` became a `u16` at $02.**]** | **DONE — LANDED 2026-08-27, this column is history.** ~~Engine M: `MAX_PARALLAX_BANDS` (constants.emp:602) sizes shadow RAM and the search; raising to 16 is a RAM + cycle question. Schema S (bump `layers` max).~~ Both landed (`parcel/band-ceiling-16-impl`) and both questions are answered: RAM **+224 B** (`Parallax_State` 328 → 552; §F derived the same number independently), cycles **O(live band count), not O(MAX)** — a scene that does not use the extra bands pays **zero** added cycles per frame; a full sixteen costs 17,474 cyc = 13.7% of the NTSC frame. The real blocker was neither: `pcfg_layer_mask` was a `u8`, so bands 8..15 tested a structurally-zero bit and silently inherited the band above. Fixed by growing `parallax_config` 28 → 30 with a `u16` mask. |
| 5 | **Mirrored / out-of-depth-order band sets** | S1 SYZ bushes speed UP toward the bottom (S1:516-535). S2 HPZ mirrored write (S2:16157-16182); MCZ symmetric about the middle (S2:16482-16540). S3K AIZ1 7-value V (SE:591-606); MGZ2 pillars scattered out of order (SE:1207); LRZ1 two ramps in opposite directions (S3K:115412-115428). | **YES** within the 16-layer cap (row 4; ~~8~~ until 2026-08-27) — any layer may carry any factor; a curve may ramp up or down (`to` ≠ `fb`, sd guard 4). **[O19 @ aeon `4f846e25` — HALF STALE: the YES holds, the NUMBER in it does not.** Read "within the 16-layer cap" (row 4). Same symbols: `MAX_PARALLAX_BANDS`, `engine/system/constants.emp:638`; curve direction guard `scene_dsl.emp:627` (`curve_to != fb`).**]** | — |
| 6 | **Time-driven autoscroll** (camera-independent drift) | S1 GHZ clouds 1.0/0.75/0.5 px/frame added to the 3/8 layer (S1:94-102, REV01 only); Special Stage ±1 px/frame (S1 `Special Stage Background & Palette Cycle.asm:261-262,295`). S2 WFZ clouds 0.5/0.25/0.125 (S2:15631-15640); HTZ clouds +4/16 px/frame on top of camera (S2:15809-15813); DEZ stars 24 rows at 1–6 px/frame (S2:17455-17495); SCZ BG 0.5 px/frame whenever moving (S2:17850-17857); title +1 (S2:15206). S3K AIZ1 `$2000`/frame (SE:613-620); MGZ1 `$500` + `$500`/row (SE:1007-1014); MGZ2 `$800` (SE:1160-1162); FBZ out `$E00` (S3K:108906-108908); FBZ2 `$8000` (S3K:109717-109718); ICZ1 intro (S3K:110359-110373); ICZ2 `frame>>1` (SE:1260-1262); LBZ2 `$E00` (S3K:111755-111757); SSZ1 `$500` (S3K:116624-116625); SSZ2 `$8000`/`$1000` (S3K:118016,118040); Ending `$800` (S3K:121375). **CNZ has none in either game.** | **NO** for plane scroll: `Decode_Factor_A/B` take only camX (px:1619-1660); the only frame-driven inputs are the deform phase accumulators (px:1498-1505) and the column-table phase (px:1578-1593). **PARTIAL** via BgAnim: a band with `driver: "timer"` translates its TILE ART 1 px per `1 << rate_shift` ticks (ba:1-30, driver 2 = Logic_Tick; schema §5) — so "clouds at camX·3/8 + 1 px/frame" = a layer `fb: FACTOR_3_8` plus a timer band over the cloud rows. Costs: rates are 2^-n px/frame only (GHZ's 0.75 and WFZ's 0.25/0.125 → 1, 1/4, 1/8 fine; 0.75 → no), pattern width = band width (`step_mask`, ba:19-21), tiles×8 banks in ROM, ≤4 bands (ba:66), all inside the 448-tile blob (schema §5.1). **[O19 @ aeon `4f846e25` — VERDICT UNCHANGED, THE FIX COLUMN WAS WRONG AND IS CORRECTED ABOVE.** Verdict re-measured: `band_drift`, `ly_drift`, `CAP_BAND_DRIFT` and `BAND_DRIFT_N` have **zero occurrences** anywhere under `engine/`, `tools/` or `games/` at this revision, so **NO for plane scroll still holds in the engine**; `tools/effects_gen.py`'s `LAYER_KEYS` (`:103-106`) has no `drift` key, so the generator refuses it. The BgAnim half is unchanged: `BGANIM_MAX_BANDS = 4`, `engine/level/bg_anim.emp:57` (not `:66`); `BGANIM_BANKS = 8`, `:59`; `step_mask`, `:70`. **What moved is everything around it** — a full design now exists (`docs/superpowers/specs/2026-08-29-band-drift-design.md`) and empyrean `86925008` carries `$defs.layer.properties.drift` (`aurora-effects-scene.schema.json:345`), gated: authorable only once `CAP_BAND_DRIFT`'s emission parcel lands.**]** | **CORRECTED 2026-08-29 (O19) — the original proposal here would have built green and accumulated nothing.** **Engine M**: a capability-gated `band_drift` tail (same shape as `band_curve`, `parallax.emp:221`) holding the rate — **that half was right**. ~~a per-band 16.16 accumulator in the shadow view~~ **is structurally impossible and must not be built**: Step 4a re-copies every shadow band from ROM every frame (`copy_band_entry_fwd`), so an accumulator there is wiped before it is read; and Step 4a *rotates* the array (`.find_k`), so slot index ≠ layer index and the accumulated drift would jump between layers as the camera moved vertically. Aeon's design puts the accumulator one stage upstream, in RAM, in `Parallax_Drift_Acc` — a capability-sized array **indexed by config band index**, the sibling of `Parallax_Current_Scroll_B` — folded into the plane-B target inside `Parallax_Update`'s band loop. It is a `u32` laid out `[pixels:i16][fraction:u16]` so the pixel part wraps at 65536 = 128 × 512 and the wrap is invisible. **Schema S**: `layer.drift: {"rate": int}` — **and the unit is 1/256 px per FRAME, not 8.8-as-authored**: 1 px/frame = 256, corpus max 6 px/frame = 1536, `0` refused. **Aurora S**: one field — with a **unit hazard the engine cannot guard**: present px/frame in the UI and multiply by 256 on export, or an author who types `1` meaning 1 px/frame gets 1/256. The preview clock already exists for timer bands (it lives in `MapViewport`, documented in `effects-facet.tsx`'s docblock, and it is timer-only by ruling — `camera_x`/`camera_y` bands preview clocklessly). Still the single highest-value addition in this survey. Full contract: aeon `docs/superpowers/specs/2026-08-29-band-drift-design.md`. |
| 7 | **Ripple / heat-haze bands** (per-line table added to a strip) | S1 LZ water FG+BG ripple, phase +1 per 2 frames (S1:188-235). S2 EHZ 21 lines, OOZ sun 33, CNZ 16, CPZ block 18, title — all `SwScrl_RippleData` stepping every 8 frames (S2:15285-15302, 16318-16336, 17000-17017, 17386-17398). S3K AIZ1/2 water (SE:639-679), SOZ1 both planes (S3K:113900-113931), LRZ3 both planes with separate FG/BG phases (S3K:119669-119680). | **YES** — scene-level `deform_fg`/`deform_bg` (shared tables, sine/triangle/zero/bin, 256 samples, schema §2.4) with per-layer amplitude shifts `dsa`/`dsb` and `phase`; sampled `(phase + line) & $FF` per line (px:1925-1965, 1995-1996); phases advance by `speed` per frame per plane (px:1498-1505). FG and BG phases are independent (matches LRZ3). **PARTIAL** on rate: speed is a u8 in whole steps per frame (sd:544-546), so S2's one-step-per-8-frames ripple is not spellable (nearest: speed 1 = 8× faster; stretching the table changes the spatial period too). Amplitude is table >> shift, so per-layer amplitude is power-of-two only. **[O19 @ aeon `4f846e25` — UNCHANGED.** `Parallax_Deform_Phase_FG` / `_BG` advanced by whole steps once per frame, `engine/level/parallax.emp:1562` / `:1565`, sampled at `:1973` / `:1996`; the speed is still a `u8` (`layer()` guard `scene_dsl.emp:578-580`, `pcfg_deform_speed_fg` at `:2477`). The one-step-per-8-frames ripple is still not spellable.**]** | Engine S: a fractional phase accumulator (8.8) for `Parallax_Deform_Phase_FG/BG` — the sample index already masks to 8 bits. Schema S. |
| 8 | **Per-layer own deform table** | Not a classic technique as such (S3K LRZ3 is two tables on two planes, not per band). | **ENGINE-ONLY / NO for sonic4 today** — `deform: {own: …}` lowers only under `CAP_MULTI_DEFORM_TABLE` ($0020, sd:182); sonic4 declares `SCANLINE_CAPS = $005E` (`games/sonic4/config/game.emp:71`), which lacks that bit, and `scene_registry.emp:309` refuses the mismatch. The schema advertises the field regardless. **[O19 @ aeon `4f846e25` — UNCHANGED.** `CAP_MULTI_DEFORM_TABLE = $0020`, `engine/level/scene_dsl.emp:186`; sonic4 `SCANLINE_CAPS = $005E`, `games/sonic4/config/game.emp:71` — bit $0020 is **not** in it. The refusal moved file: it is now the `BAND_EXT_N` pin pair at `games/sonic4/data/effects/scene_registry.emp:417-420`, not `:309`. Prefer the symbols over either line.**]** | Raise the bit in the game (record grows by `band_ext` for every band, px:161-167). Not needed by any surveyed zone. |
| 9 | **FG plane parallax ≠ 1** | Only as a pin: S1 title FG forced 0 (S1:85-89); S2 title FG 0 (S2:15214-15217). Never in play. | **PARTIAL** — `fa` accepts any factor and `Decode_Factor_A` honours it (px:1619-1651), but the FG streamer only maintains Plane A around the camera; scene_dsl says Plane A is "hard-locked to the camera … any FG offset drags the plane-wrap seam on screen" (sd:272-273, px:925). No curve on Plane A (sd:271-274). **[O19 @ aeon `4f846e25` — UNCHANGED.** The hard-lock is stated at `engine/level/scene_dsl.emp:275-278` ("Plane A is hard-locked to the camera (`-Camera_X`, never lerped) ... a ramping FG factor is not a thing this engine can express at all").**]** | None; no zone needs it. |
| 10 | **Sub-tile art parallax inside a row** (tile art shifted in software / per-camera art streaming) | S2 HTZ clouds byte-shifted into RAM then DMA'd (S2:85562-85601); HTZ mountains 96-chunk streaming by camX (S2:85507-85560). S3K HCZ pillars (the technique ba names in its header). | **YES** — BgAnim `driver: "camera_x"` with `rate_shift` (1 px per 2^n camera px: HTZ's camX/8 = `rate_shift: 3`); fine phase by 8 pre-shifted banks, coarse by column rotation (ba:8-16). **[O19 @ aeon `4f846e25` — UNCHANGED.** `bganim_band.driver`, `engine/level/bg_anim.emp:67` (0 = Camera_X, 1 = Camera_Y, 2 = Logic_Tick); `rate_shift` `:69`; the 8 pre-shifted banks `BGANIM_BANKS = 8` `:59`, coarse column rotation at `:197`.**]** | — |

### B.2 Vertical scroll

| # | Technique | Who does it | aeon | Smallest fix |
|---|---|---|---|---|
| 11 | **Whole-plane BG vertical fraction** | S1 GHZ `max(0, 32 − camY/32)` (S1:72-82); LZ 1/2 (S1:177-179); MZ locked at 512 then 3/4 (S1:280-292); SLZ 1/2 + $C0 (S1:368-372); SYZ 3/16 (S1:469-474); SBZ 1/8 (S1:582-586). S2 MTZ 1/4, HPZ 1/2, OOZ 1/8, MCZ camY/3 − 320 / camY/6 − 16 (S2:16419-16430), CNZ camY>>6, CPZ 1/4, DEZ 1:1, ARZ 1:1 / 1/2, SCZ locked (S2 table at the routines cited in §C). S3K AIZ 1/2; MGZ2 3/16 (SE:1129-1130); CNZ 13/128 (S3K:107669-107677); HCZ1 1/4 (S3K:105800-105806); MHZ 5/32 + $76 (S3K:112323-112327); LRZ1 1/8; LRZ2 (1/8)·3/4; DEZ static (S3K:118639-118645). | **PARTIAL** — `Vscroll_BG = ((camY − v_center) >> v_factor) + v_offset`, `v_factor` 0..14 a shift, 15 = lock (px:1511-1558; schema §2.1). Powers of two only: 1, 1/2, 1/4, 1/8, 1/16 … all fine; **3/4 (MZ), 3/16 (SYZ, MGZ2), 13/128 (CNZ), 5/32 (MHZ), 1/3 and 1/6 (MCZ) are not** — nearest 1/2 or 1, 1/4, 1/8, 1/8, 1/4 and 1/8. `v_offset` is signed (schema §2.1) so the "+constant" parts are fine; `v_center` covers MZ's "locked until camY ≥ 456" only approximately (a shift of a negative dividend is refused at the lowering, sd:2379-2381). GHZ's inverted `32 − camY/32` is not spellable. **[O19 @ aeon `4f846e25` — MECHANISM UNCHANGED; a hard NEW consequence has been measured beside it.** `Parallax_Step5_Vscroll`, `engine/level/parallax.emp:1570`, is still one `asr.w d2, d0` against `pcfg_v_factor_bg` with `#15` as the lock sentinel (`:1583-1588`) — so powers of two only, exactly as the row says. **NEW, and it changes how the row should be read:** aeon derived that a 512-px background covers an act of at most `512 << v_factor_bg`, and OJZ act 1 (6,144 px at v_factor 3, ceiling 4,096) is **2,048 px past it** — the wrap is structural, not an anchoring mistake, and nothing in the build checks it (`docs/DEFERRED_WORK.md`, "The 512-px background has a HEIGHT x DEPTH budget"). Owner decision **d-31** option 3 (background art taller than the plane) was SCOPED AND PRICED 2026-08-29: `docs/research/2026-08-29-tall-background-map.md`. So the *rounding* loss this row prices is no longer the expensive half of v_factor.**]** | Engine S: give `pcfg_v_factor_bg` the same two-term shift-add form as the horizontal factor (`Parallax_Step5_Vscroll` is one `asr.w`, px:1524-1528). Schema S. |
| 12 | **Vertical band windowing** (one BG Y used to pick which rows of a tall H-scroll list are on screen) | S2 MCZ 512-line table (S2:16585), ARZ 1728 (S2:17795), DEZ 768 (S2:17600), CNZ, CPZ, HPZ — all index the row list by `Camera_BG_Y_pos` (e.g. S2:16963-16970). S3K everywhere via `ApplyDeformation` a4/a5 tables (S3K:103662-103700). S1 MZ/SLZ/SYZ/SBZ1 via `BGScroll_X` row skip (S1:441-459). | **YES** — this is exactly Step 4a: band tops live in plane space and are rotated into screen space every frame against `Vscroll_BG` (px:1000-1060). Cap is the plane: the list may be at most 512 lines (sd:2388-2390), versus S2 ARZ's 1728 — which only matters together with row 14. **[O19 @ aeon `4f846e25` — UNCHANGED.** Step 4a's rotation is still masked by `PLANE_B_SPAN` (`engine/level/parallax.emp:1096`, `:1140`), the constant declared at `:410` with its own `ensure` at `:411`; the author-side range guard is `engine/level/scene_dsl.emp:2547` (`pl >= 0 && pl < 512`) under the pin at `:60`. **Peer-document caveat:** aeon's `docs/DEFERRED_WORK.md` says of a proposed guard that it *"names `PLANE_B_SPAN`, which is not a constant that exists"* — that sentence is wrong at this revision; the constant exists at `parallax.emp:410`. Do not repeat it.**]** | — (see 14) |
| 13 | **Different vertical scroll for different bands, mid-frame** | S3K AIZ2 battleship: `HInt6` rewrites Plane A VSRAM at line $40 (S3K:104930-104932, 104979-104982); MHZ2 airship at $80 (S3K:112596-112599). S2 2P split screen (S2:1184-1233). Nothing in S1. | **PARTIAL** — `vsplit: {at}` lowers to one `fx_vscroll_split` fire = one mid-frame VSRAM write (sd:288-326; rd:590-592; shipped `ojz_act1_depth.json` uses two). Losses: **Plane B only** (rd:585-587: Plane A mid-frame shows the streamer's working margin — S3K's version is Plane A); the value is a **baked constant** and the scene must be **locked** (`v_factor: 15`, sd:318-326), whereas AIZ2's lower band tracks a second camera. **[O19 @ aeon `4f846e25` — UNCHANGED.** `fx_vscroll_split(line, offset)`, `engine/effects/raster_dsl.emp:624`, is literally `[ fire(line, [ stream_vsram(2, [offset]) ]) ]` — one word, VSRAM byte 2 = Plane B entry 0, a **baked constant**; the Plane-A refusal is in its own docblock at `:621-623`. The lock requirement is `scene_dsl.emp:1318` (`any_vsplit == 0 \|\| v_factor == 15`).**]** | Engine M: a camera-derived split value (second `v_factor` applied to Camera_Y, patched into the fire word each frame — the `patchable` channel machinery already patches LINES from world Y, rd:426; it would need to patch the VALUE too). Schema S. |
| 14 | **Per-column (2-cell) vertical scroll** | S3K only, event-scoped: AIZ1 fire flame wobble on Plane B, 16-byte sine per column (SE:702-725); MGZ2 floor collapse, 10 Plane A columns with per-column delay + gravity (S3K:106510-106540; SE:1084-1086); LBZ1 walkway (S3K:110981-111035); SSZ1 launch (S3K:116289-116303); SSZ2/Knuckles ending water on Plane B (S3K:118339-118346); LRZ3 lava on Plane B (S3K:119570-119576); Gumball permanently (SE:1626-1639). Mode set via `$8B07` (S3K:102502-102518). Neither S1 nor S2 ever sets reg $0B bit 2 (S1 `sonic.asm:2748`; S2 `$8B03` at s2.asm:4827). | **PARTIAL** — `v_deform: {columns: {table, speed, amp_shift}}` fills the 40-entry column buffer for **Plane B**, animated by `speed` (px:1570-1605; `Vscroll_Write` emit px:754-786; `CAP_PER_COL_VSRAM` is in sonic4's $005E). Generators `v_column_perspective`/`v_column_floor` (pd:107-127) or a 256-byte `bin`. A sine table = AIZ1's flame wobble, SSZ2's water, LRZ3's lava — yes. **Plane A column collapse (MGZ2/LBZ1/SSZ1) — no**: it is per-column state driven by a level event and coupled to solid objects, not a table. **[O19 @ aeon `4f846e25` — UNCHANGED, plus ONE NEW AUTHORING OBLIGATION.** `SceneVDeform.Columns(table, speed, amp_shift)`, `engine/level/scene_dsl.emp:252`; the generators `v_column_perspective` / `v_column_floor`, `engine/level/parallax_dsl.emp:124` / `:134`; `CAP_PER_COL_VSRAM = $0002` (`scene_dsl.emp:181`) is in sonic4's $005E. **NEW:** a scene attaching `Columns` must now also declare a `left_column_mask` policy or the build refuses it (`scene_dsl.emp:1337`) — the left partial column renders at a V-scroll the program never wrote. Aurora already ships that control (`EffectsScenePanel.tsx`, `leftColumnMaskRowVisible`).**]** | Not a background feature; leave. |
| 15 | **Time-driven vertical bob** | S3K FBZ outdoors `Gradual_SwingOffset` on BG Y (S3K:108884-108911, 109220); SSZ1 wobble in BG Y (S3K:116613-116621). | **NO** — `v_offset` is a constant. **[O19 @ aeon `4f846e25` — VERDICT UNCHANGED, SMALLEST FIX **DEAD** AND EXPLICITLY REFUSED BY AEON.** `v_offset` is still read as a plain constant in `Parallax_Step5_Vscroll` (`engine/level/parallax.emp:1618`, and `:1610` on the locked arm), so **NO** holds. But this row's fix — *"rides on row 6's engine parcel"* — is wrong and is named as wrong in aeon's drift design §6.7 ("What does NOT ride on this parcel"): Plane B's vertical scroll is a **whole-plane** quantity, there is no per-band vertical field for a bob to live in, and per-column VSRAM is per-*column*, not per-row. A bob is a **scene-level Step-5 term** — different field, different code site, different capability bit. Worth building; not that parcel, and not that size.**]** | **CORRECTED 2026-08-29 (O19).** ~~Rides on row 6's engine parcel (a vertical drift/bob term); S.~~ It does **not** ride on that parcel, and aeon's design refuses it by name (§6.7). Plane B's vertical scroll is a **whole-plane** quantity — one `Parallax_Current_Vscroll_BG` out of Step 5 — so there is no per-band vertical field for a per-band bob to live in, and per-column VSRAM is per-*column*, not per-row. What FBZ and SSZ1 do (one sine on the whole BG Y) is a **scene-level term folded into `Parallax_Step5_Vscroll`**: a different field, a different code site and a different capability bit. Worth building; not sized here — the "S" was a sizing of the wrong mechanism. |

### B.3 Mid-frame (H-int) and palette

| # | Technique | Who does it | aeon | Smallest fix |
|---|---|---|---|---|
| 16 | **Water-line palette swap by H-int** | S1 LZ: all 64 colours at the water line, palette only (S1 `sonic.asm:1034-1055`, line from `LZWaterFeatures.asm:30-44`). S2 CPZ2/ARZ `PalToCRAM` 64 colours (S2:1240-1256). S3K `HInt2` (HCZ, 64 colours at line 223, S3K:1230-1240), `HInt3/4` 3 colours per line downward (S3K:1008-1049). | **PARTIAL** — `fx_tint_band` + `patchable` world-anchored line + palette variants (rd:620-655, 426; `ojz_effects.emp:845-847`), **3 colours per fire per scanline** by a measured cycle budget (rd:224, 385): a 16-colour line takes 6 consecutive fires; a full 64-colour swap ≈ 22 lines of fires. The S3K `HInt3` shape (3/line) is ours exactly; the one-shot 64-colour swap is deliberately refused. Not authorable from the wave-1 **scene** JSON — ~~raster programs are hand `.emp`~~ **as of empyrean `86925008` they are also a JSON PRESET document, which is a different file, not a scene field** (see the marker). **[O19 @ empyrean `86925008` / aeon `4f846e25` — CHANGED, HALF STALE. The *scene* half of "not authorable" lived; the *at all* half died.** A band is still **not** a scene field — but bands are now a first-class JSON **PRESET document**: `contract/schema/aurora-effects-preset.schema.json` ("Aurora Effects — Raster Preset Document (wave 2, bands)"), bound per SECTION, per aeon `docs/superpowers/specs/2026-08-28-raster-band-ownership-design.md` §16.1. Engine side unchanged: `fx_tint_band` `engine/effects/raster_dsl.emp:654`, `patchable` `:460`, `RASTER_BURST_MAX_CRAM = 3` with the 6-fires-per-16-colour-line arithmetic at `:419`. **CARRY THE LIVE LIMIT, it is in the schema's own words:** nothing checks that an authored preset is BOUND to a section, so **an authored band today costs ROM and shows nothing**; binding is still a hand-authored `preset()` call. Also reserved-and-refused in that schema, by name: `fires`, `variants`, `cycles`.**]** | Schema/Aurora M if palette bands are to be editor-authored; engine none. |
| 17 | **Palette cycling on BG lines** | S1 all zones except MZ (`_inc/PaletteCycle.asm:47-314`), SBZ script with per-colour timers (:351-372). S2 `PalCycle_*` (S2:2725-3002), HTZ per-frame delay list (S2:2818-2823). S3K `AnPal_*` (S3K:3104-3165), AIZ2 switches table past camX $3800 (S3K:3260-3264). | **ENGINE-ONLY** — `sec_pal_cycle` scripts, ≤4 channels, each rotating a span every `period` frames (`engine/effects/palette.emp:77, 139-163, 428-439`), bound per section through the preset (`preset.emp:63`). Not among the four wave-1 write surfaces (schema §1). Per-step variable delays (S2 HTZ) and per-colour independent timers (S1 SBZ) are not in the channel format. **[O19 @ aeon `4f846e25` — UNCHANGED.** `PAL_CYCLE_MAX_CHANNELS = 4`, `engine/effects/palette.emp:77`; `pal_cycle_channel.pc_period` `:154`; `Palette_DoCycle` `:428`; `Palette_LoadCycle` `:322`. Still no per-step delay list and no per-colour timer. And the wave-2 preset document does **not** open it: `cycles` is reserved-and-refused by name in `aurora-effects-preset.schema.json` at empyrean `86925008`.**]** | Aurora/schema M for authoring; engine S for a per-step delay list. |
| 18 | **Shadow/Highlight, register writes, VSRAM streams mid-frame** | None of the three games use S/H; S2 2P and S3K 2P re-point plane bases mid-frame (S2:1184-1233; S3K:954-996). | **YES/ENGINE-ONLY** — `fx_sh_below`, `reg_set` (except $8A/$8F), `stream_vsram`, `stream_cram` (rd:104-108, 150-173, 218-300, 576-592). **[O19 @ aeon `4f846e25` — UNCHANGED.** `fx_sh_below` `engine/effects/raster_dsl.emp:610`; `reg_set` `:172` (with the $0A and $0F refusals at `:204` / `:206`); `stream_vsram` `:323`; `stream_cram` `:252`; `stream_pal_region` `:267`.**]** | — |

### B.4 Background art

| # | Technique | Who does it | aeon | Smallest fix |
|---|---|---|---|---|
| 19 | **BG plane redrawn per band from separate BG cameras** (art wider/taller than one plane) | S1 `Draw_MZ`/`Draw_SBZ` with `BG_ScrollBlockMap_*` mapping 16-px rows to bg1/bg2/bg3 X (`Level Drawing (REV01).asm:181-186, 395-470`); GHZ title via `LoadTilesAsYouMove_BGOnly` (:7-21). S2 `Draw_BG3_CPZ` + `CPZ_CameraSections` + `BGCameraLookup` (S2:19050-19129) — the only shipped S2 user; OOZ's is `fixBugs`-only; SLZ/SYZ/MCZ/EHZ pin BG X and rely on 512-px wrap. S3K `Draw_BG`/`Draw_BGNoVert`/`Refresh_PlaneTileDeform` walking `*_BGDrawArray` band tables (S3K:103080-103227), e.g. MGZ2 (S3K:107026-107030), LRZ1 (S3K:115251, 115639), SOZ2 12 rows (S3K:115161). | **NO** — Plane B is one 64×64 nametable blitted once at level load (`engine/level/bg.emp:3-13, 15-16`); `Draw_BG_TileColumn` has **zero callers** (`engine/level/plane_buffer.emp:386-387`); per-section BG swap is deferred/superseded by the seam-streaming spec (`aeon/docs/DEFERRED_WORK.md:3227-3245`, `docs/research/2026-08-08-bg-seam-streaming.md`). Consequence: every background layer must be periodic at 512 px horizontally, the whole act's background fits one 512×512 plane, and all of it shares the 448-tile ceiling (`bg.emp:52-55`). **[O19 @ aeon `4f846e25` — VERDICT UNCHANGED; THE FIX IS NO LONGER UNSCOPED.** Re-measured rather than assumed: `BG_Init` still blits Plane B **once at level load** (`engine/level/bg.emp:6-7`, `:58`), and `Draw_BG_TileColumn` (`engine/level/plane_buffer.emp:390`) still has **ZERO callers** — grepped over the whole tree at this revision, only the definition and two comments. `BG_TILE_REGION_BYTES` = 448 tiles, `bg.emp:55`. **What changed is the price:** d-31 option 3 is SCOPED AND PRICED (`docs/research/2026-08-29-tall-background-map.md`) — the **vertical** axis is ~350 B ROM, 4 B RAM, no new VRAM, `Parallax_Step5_Vscroll` untouched. The **horizontal** axis stays L and stays unattractive (there is no single BG camera). And the 448-tile ceiling is *not* dissolved by streaming — it bites 1.45x harder for OJZ.**]** | **Engine L** — the booked seam-streaming work, extended with per-band X redraw (the deferred note itself records "there is no single BG camera — per-band `Parallax_Current_Scroll_B`"). This is the structural gap behind rows 4, 12, 20 and 21. |
| 20 | **Background art swapped by event mid-act** | S3K AIZ1 fire (S3K:104630-104704), FBZ six indoor/outdoor wipes per act with four directional plane redraws (S3K:108720-108774, 109193-109206), ICZ1 intro→indoor + ICZ2 in/out with three palettes (S3K:110662-110706; SE:1353-1390), HCZ2 wall/drain (S3K:106051-106130), MHZ2 custom layout+art (S3K:113088-113111), LBZ2 Death Egg via the Window plane (S3K:102525-102579). S2 WFZ ship fly-away is a BG-camera offset, not an art swap (S2:20599-20641); HTZ quake swaps parallax for a flat redrawn plane (S2:15975-16030). S1 has none (only LZ4's waterfall palette, `PaletteCycle.asm:87-89`). | **PARTIAL** — the *scroll* and *palette* halves are there: per-section `sceneRef` + `TRANS_SMOOTH` 16-frame lerp (schema §3; `constants.emp:607-618`; px:1538-1548), per-section palette with cross-fade (`preset.emp:57-66`). The *art* half is row 19's NO. **[O19 @ aeon `4f846e25` — UNCHANGED.** Same root cause as row 19, same symbols (`BG_Init`, `Draw_BG_TileColumn`). The scroll/palette halves are unchanged: `TRANS_SMOOTH` / `PARALLAX_TRANS_DEFAULT = 16`, `engine/system/constants.emp:643`; the lerp arm in `Parallax_Step5_Vscroll` under `CAP_TRANSITIONS`, `engine/level/parallax.emp:1596-1606`.**]** | Same engine L as row 19. |
| 21 | **Animated BG tiles (frame sequences)** | S1 GHZ waterfall 2 frames/6f, SBZ smoke 8 frames + 3 s/2 s gaps, CPU `LoadTiles` to fixed slots (`_inc/AnimateLevelGfx.asm:41-57, 207-285, 415-421`). S2 CPZ/DEZ `AnimBack` 8 frames × 2 tiles every 4 (S2:86033-86048); MTZ `AnimBack` 4 frames with $13/7/$13/7 durations, two phase-offset copies (S2:85868-85881). S3K per-act `AniPLC` scripts (S3K:53839-53936); HCZ1 waterline rebuilt from raw art and DMA'd (S3K:53972-54054). | **PARTIAL** — a BgAnim band is 8 banks DMA'd by `step & 7` (ba:8-16, 26-30); the banks are authored as arbitrary 8 phases (schema §5 `phases`), so an 8-frame cyclic animation at a uniform 2^n-frame duration is spellable with `driver: "timer"` — **only for a 1-column band**, because wider bands rotate columns once `step >> 3` advances (ba:10-13; `step_mask` = pattern width − 1). Fewer frames = repeat banks; >8 frames, non-uniform durations (MTZ, EHZ flowers), and idle gaps (SBZ smoke) are not spellable. `Sec.sec_anim_blocks` ("animated tile script", `engine/structs.emp:124`) is declared but no consumer was found in `engine/` — treated as dead. **[O19 @ aeon `4f846e25` — UNCHANGED.** `BGANIM_BANKS = 8`, `engine/level/bg_anim.emp:59`; the `step & 7` bank select at `:192` and the `step >> 3` column rotation at `:197`; `step_mask` `:70`. `Sec.sec_anim_blocks` (`engine/structs.emp:124`) **still has exactly one occurrence in the whole tree — its own declaration.** Re-checked, still dead.**]** | Engine M: a plain frame-sequence driver (frame list + per-frame duration) beside BgAnim, sharing its DMA path. Schema S. |
| 22 | **HCZ waterline permutation** (BG rows re-ordered by a 97-position table + tile rebuild) | S3K HCZ1 (S3K:105799-105980, `HCZ_WaterlineScroll_Data` $2460 bytes), LBZ2 stride $40 (S3K:111584-111678). | **NO** **[O19 @ aeon `4f846e25` — UNCHANGED (NO by absence).** Nothing in `engine/` reorders BG rows or rebuilds waterline tiles; the only per-frame BG-row machinery is Step 4a's band rotation (`engine/level/parallax.emp:1096`), which permutes *scroll values*, not plane content. Absence claim, not a symbol — treat it as the weakest row in this pass.**]** | Engine L; zone-specific; not recommended. |
| 23 | **Reels / independently scrolling sub-planes** (slot machine), **BG on Plane A / plane role swap** (FBZ2, DEZ3, MHZ2), **Window plane as a third layer** (LBZ2) | S3K:119136-119298; S3K:109519-109527, 120377-120379, 113095-113097; S3K:102525-102579. | **NO** — engine has no Window use and no plane-role swap. **[O19 @ aeon `4f846e25` — UNCHANGED, and STRONGER than the row states.** The Window plane is not merely unused: it is disabled (`$11`/`$12` = 0) and there is **no free window space anywhere in this VRAM map** — `engine/system/boot_data.emp:140-158` says so at the register table, with $F000 lying inside Plane B. Enabling the window means re-planning VRAM, not writing two registers.**]** | Out of scope for a background model. |
| 24 | **Nametable-register frame swap** (S1 Special Stage bird/fish canvases) | `_inc/Special Stage Background & Palette Cycle.asm:19, 110-122`. | **NO** (`reg_set` is transient mid-frame; a persistent $82/$84 change is `Set_VDP_Reg`, rd:167-169 — nothing schedules it per frame). **[O19 @ aeon `4f846e25` — UNCHANGED.** `reg_set` refuses to be a persistence mechanism in its own docblock (`engine/effects/raster_dsl.emp:200`: "A register change meant to PERSIST is not a raster op at all"), and `Set_VDP_Reg` (`engine/system/vdp_init.emp:114`) is the one way to change a register and have it stick. Nothing schedules a per-frame $82/$84 change.**]** | Niche. |
| 25 | **Split-screen 2P** | S2 interlace + H-int at line 108 (S2:1184-1233, 4848-4850); S3K H-int at $6B, two deform passes into one buffer (S3K:7641-7657, 954-996; SE:127-142). | **NO** — no interlace/2P in the engine (grep: `interlace` only in `constants.emp`/`boot_data.emp` VDP mode words). **[O19 @ aeon `4f846e25` — UNCHANGED.** `VDP_REG_0C_BOOT = $81` — "H40 (320px), **no interlace**" — `engine/system/constants.emp:460`, written once from `engine/system/boot_data.emp:153`. Those two sites are still the only occurrences of the word in the engine.**]** | L; not a background feature. |

---

## C. Per-zone one-liners

**Expressible** = the zone's background as a whole (scroll + vertical + effects), against the
current model. Rounding of a vertical fraction to a power of two (row 11) is counted as *partial*
only where it is visibly different; art-width/art-swap gaps (rows 19/20) are noted where they
bite.

### Sonic 1 (`_inc/DeformLayers (REV01).asm`)
- **GHZ / Title / Ending** (S1:49-163): 6 strips at 3/8, 3/8, 3/8, 3/8, 1/2, then a per-line ramp 1/2 → ≈0.85 (`camX/208`/line); clouds +1.0/0.75/0.5 px/frame; BG Y `max(0, 32 − camY/32)`; waterfall 2-frame tiles; palette cycle. → **partial**: strips + curve (`FACTOR_1_2` → `FACTOR_7_8`, nearest to 0.846) yes; cloud drift only via timer bands at 1 and 1/2 (0.75 → no); inverted vertical → no (use lock + offset).
- **LZ / SBZ3** (S1:170-245): one strip 1/2, camY/2; per-line ripple on both planes below the water, phase +1 per 2 frames; H-int 64-colour water palette. → **partial**: deform_fg + deform_bg yes, phase speed ½ step/frame → speed 1 (row 7); palette split at 3 colours/line (row 16).
- **MZ** (S1:249-358): 4 bands (5-row cloud ramp 1/2 → 1/5, 1/4, 1/2, 3/4); BG Y 512 then camY·3/4; no BG palette cycle. → **partial**: bands yes (ramp `to` ≈ 3/16 for 0.2); vertical 3/4 → 1/2 or 1 (row 11); tile art >512 px wide relies on `Draw_MZ` (row 19).
- **SLZ** (S1:365-427) — the brief's test case. Stars: 28 rows from camX·1 stepping −camX/32 per 16-px row to camX·5/32; buildings 3/16; buildings 1/4; bottom 1/2; BG Y camY/2 + $C0; BG X pinned to 0 (512-px wrap, `LevelSizeLoad & BgScrollSpeed.asm:346`). → **CONFIRMED yes**: layer 0 `fb: FACTOR_1, curve: {to: {s1:3, s2:5, op:0}}` (= 1/8 + 1/32 = 5/32, custom packed; pd:21-23), layers 1-3 `FACTOR_3_16`, `FACTOR_1_4`, `FACTOR_1_2` (pd:35, 29, 28), scene `v_factor: 1, v_offset: 192` (px:1524-1528). 1/8, 3/16, 1/4, 1/2 are all in the named set; the ramp is a smooth per-line Bresenham rather than S1's 16-px steps — same endpoints, finer. Four layers ≤ 8; BG already 512-px periodic so row 19 does not bite. The 448-line star region is a plane-space layer span, legal under 512 (sd:2388-2390).
- **SYZ** (S1:465-542): cloud ramp 1/2 → 15/128 (−7/128 per row), 1/8, 1/4, bush ramp 1/2 → 27/28; BG Y camY·3/16; BG palette cycle. → **partial**: two curves + two flats yes (`to` 1/8 and `FACTOR_15_16`); vertical 3/16 → 1/4 or 1/8.
- **SBZ1** (S1:551-649): cloud ramp 1/4 → 13/64, 1/4, 3/8, 1/2; BG Y camY/8; smoke-puff tiles with gaps; BG palette scripts. → **partial**: scroll yes (`to` 3/16 ≈ 13/64); smoke gaps no (row 21); palette script authoring no (row 17).
- **SBZ2 / FZ** (S1:653-675): flat 1/4, camY/8. → **yes**.
- **Special Stage**: sprite maze; BG canvases swapped by nametable register; per-line cloud/bubble blocks with ±1 px/frame drift and per-block sine. → **no** (rows 6, 24); not a level background.

### Sonic 2 (`s2.asm`)
- **Title** (S2:15201): 0 / camX/4 / +ripple; camera auto-advances. → **partial** (row 6).
- **EHZ** (S2:15253): 9 strips 0, 1/64, 1/64+ripple, 0, 1/16, 3/32, then a 78-line ramp 1/8 → ≈0.73 (−1/128/line); BG Y fixed 0. → **yes** (8 layers exactly if the two zero strips are kept; 3/32 = `FACTOR_3_16`>>1 → custom `{s1:4,s2:5,op:0}`; ramp `to` ≈ `FACTOR_3_4`).
- **MTZ / Minimal** (S2:15578, 17879): flat 1/8, camY/4; two `AnimBack` 4-frame strips with 19/7 durations. → **partial** (row 21 durations).
- **WFZ** (S2:15609-15771): table-driven bands, static hull + clouds at 0.5/0.25/0.125 px/frame drift; band table swapped at camX $2700; BG offsets servo'd by level events (ship fly-away). → **partial**: drift via timer bands only (row 6); event-driven BG camera offset → per-section scene switch approximates the *scroll* change, not the animated servo.
- **HTZ** (S2:15779-16030): 128 lines at 1/8, then 96 lines of cloud accumulator ramp with +0.25 px/frame drift; mountains streamed by camX; earthquake flat-BG mode with `Camera_BG_Y_offset` ratchet. → **partial**: 1/8 + curve yes; cloud drift row 6; mountain streaming ≈ camera_x band (row 10); quake mode → section scene switch, ratchet no (row 15).
- **HPZ** (S2:16107-16200): 16-line blocks, 7-block mirrored ramp (7/128 per block), 1/2 and BG-cam bands; camY/2. → **yes** (curves + flats, ≤ 8).
- **OOZ** (S2:16224-16405): 1, 1/4, 1/8, 1/16 of the BG cam (= camX/8), 33-line pure-ripple sun, variable-height factory band; camY/8. → **partial**: fractions of camX/8 are 1/8, 1/32, 1/64, 1/128 → all named or custom; sun = a layer with `fb: FACTOR_LOCKED, dsb: n` yes; ripple every 8 frames → row 7. Band count 12 > 8 → merge.
- **MCZ** (S2:16411-16585): 24 bands n/10 (n=1..9) mirrored, heights sum 512; BG Y camY/3 − 320 (act 1) / camY/6 − 16; boss shake. → **partial**: n/10 → nearest two-term (row 1); 24 bands > 8; camY/3 → 1/4 (row 11).
- **CNZ** (S2:16939-17068): 7-row ramp camX·(1 − 7n/64), 1/16, 1/16, 1/8, 16-line ripple; camY>>6; **no autoscroll**. → **yes** (curve `FACTOR_1` → 22/64 ≈ `FACTOR_3_8`, flats, ripple layer; 10 bands → 8 by merging the two 1/16 rows).
- **CPZ** (S2:17244-17398): 16-line blocks, 1/8 above / 1/2 below block 18, ripple block; camY/4; two BG cameras redraw the plane (`Draw_BG3_CPZ`); H-int water palette (act 2); 8-frame `AnimBack`. → **partial**: scroll yes; per-camera plane redraw no (row 19); palette split partial (row 16); anim yes if 1 column wide (row 21).
- **DEZ** (S2:17405-17600): 128 lines locked, 28 star rows each at its own 1–6 px/frame drift, 3-band Earth limb 7/8, 6/8, 5/8, camera-locked sky; BG 1:1. → **partial/no**: the stars are pure autoscroll at 24 distinct rates (row 6) — timer bands cover at most 4 rows at 2^-n rates; Earth limb `FACTOR_7_8`, `FACTOR_3_4`, `FACTOR_5_8` yes.
- **ARZ** (S2:17644-17795): rows at 1/10 … 9/10 plus BG-cam rows at 281/256 (faster than the camera); 16 rows summing 1728 lines; BG Y 1:1 / 1/2; H-int water palette; waterfall tiles 2 frames/5. → **partial**: n/10 rounding; 17/16 = `{s1:0,s2:4,op:0}` ≈ 1.098; 1728-line list > 512 plane (row 12/19); waterfall 2-frame yes (1-column) else row 21.
- **SCZ** (S2:17815-17872): flat, BG +0.5 px/frame when moving, Y locked. → **partial** (row 6; 1/2 px/frame is a timer band at `rate_shift: 1`).
- **2P variants**: → **no** (row 25).

### Sonic 3 & Knuckles (`sonic3k.asm` / `Screen Events.asm`)
- **AIZ1** (SE:515-679; S3K:104525-104704): intro 37-step ramp in 4-line bands; normal: 7-value mirrored mountains, 6 cloud rows drifting `$2000`/frame, 13-line ramp, both-plane water wobble, tree reveal, fire transition (column-vscroll flame + art restream). → **partial**: ramps/flats yes; drift row 6; art swap row 20; flame wobble = `v_deform` Columns sine yes.
- **AIZ2** (SE:744-891; S3K:104909-104999): 7 speeds over 25 slots mirrored; both-plane wobble above and below water; **battleship `HInt6` Plane A split with a second camera**. → **partial**: 24 bands > 8; split row 13 (Plane A + camera-tracked → no).
- **HCZ1** (S3K:105799-105980; SE:972): waterline permutation table + per-frame tile rebuild; 5/5/6-line bands; 192-line per-line ramp; `HInt2` palette. → **no** for the waterline (row 22); the rest yes.
- **HCZ2** (S3K:105998-106230; SE:974-977): 7 speeds over 24 slots; solid chase wall as BG; drain transition. → **partial** (band count; wall = gameplay).
- **MGZ1** (SE:989-1025): 9-row ramp, 5-row accelerating drift (`$500` + `$500`/row), swapped last two; BG Y = shake only. → **partial** (row 6).
- **MGZ2** (SE:1090-1209; S3K:106453-106540): 23 bands, **16 on screen**, out-of-order scatter + per-band nudges, 3/16 vertical, cloud drift `$800`, floor collapse by Plane A column vscroll. → **partial/no**: 16 > 8 (row 4), drift (row 6), 3/16 (row 11); collapse is FG gameplay (row 14).
- **CNZ1/2** (S3K:107663-107716, 107875): 4 bands, hand-tuned non-uniform ramp from 7/16, BG Y 13/128; **no autoscroll**; miniboss re-anchor. → **yes** for scroll (ramp as flats), 13/128 → 7/64 or 3/32.
- **FBZ1/2** (S3K:108857-109285, 109505-109763): two BGs $200 px apart with six directional wipes per act; indoor 9 speeds over 36 slots; outdoor 9 cloud rows drifting `$E00` + vertical bob; FBZ2 BG drawn on Plane A, clouds as sprites. → **partial/no**: art swap row 20, drift row 6, bob row 15, plane swap row 23.
- **ICZ1** (S3K:110068-110419; SE:1214-1253): Y-wrapping level, mirrored plane; intro 5 static + 9 drifting rows (`$800` + `$800`/row), 2/11/13-line bands; indoor flat halves; avalanche BG region; two palettes. → **partial** (drift row 6; palette swap yes via section preset; Y-wrap not surveyed in aeon).
- **ICZ2** (SE:1257-1409; S3K:110662-110810): outdoor 40-line per-line ramp + 8 wobble rows + `frame>>1` drift, Y fixed 0; indoor 5-step V, (camY−$700)/4+$118; three palettes by camX. → **partial** (drift row 6; the rest yes — `v_center: $700, v_factor: 2, v_offset: $118`).
- **LBZ1** (SE:1567-1604; S3K:110981-111035): 1/16 + 4-row ramp with hand pixel nudges; walkway collapse Plane A columns. → **yes** for BG (nudges = separate flat layers); collapse is FG.
- **LBZ2** (S3K:111584-111803; SE:1611-1619): HCZ-style waterline (stride $40), 13 cloud rows drifting `$E00`, line-by-line underwater wave, Death Egg lift-off via Window plane + Plane A vscroll counter. → **no** (rows 22, 6, 23).
- **MHZ1** (S3K:112320-112386): no bands, BG = (X/2 − X/8) = `FACTOR_3_8`, Y 5/32 + $76, horizontal level wrap. → **partial** (5/32 → 1/8).
- **MHZ2** (S3K:112596-113252): `HInt6` split at $80 with two BG draw regions, plane role swap, pillar `divu` ramp, sprites placed from the hscroll buffer, custom art streamed. → **no** (rows 13, 19, 23).
- **SOZ1** (S3K:113838-113931): 1/16 + 7-entry ramp; both-plane heat haze over 224 lines, 5 × 8-line bands. → **yes**.
- **SOZ2** (S3K:114708-114737, 115161): BG = camera/2 both axes; scripted BG pans during sand rise; 12-row plane rebuild. → **partial** (scripted pan = row 6/15; rebuild row 19).
- **LRZ1** (S3K:115387-115428, 115641): 1/8, two opposite-direction ramps from one base, 12 bands. → **yes** (two curves + flats ≤ 8).
- **LRZ2** (S3K:115737-115843): 1/8, symmetric 12 bands around a 240-line middle; Death Egg as a streamed sprite. → **yes** (bands merge to 8).
- **SSZ1** (S3K:116613-116663, 117578; 116289-116303): 29-band table, ~20 scattered slots, `$500` drift, Y-wrap, Plane A spiral columns, launch by column vscroll + second camera. → **partial/no** (rows 4, 6, 14).
- **SSZ2 / Ending** (S3K:118009-118054, 117952-117963, 118339-118346; 121351-121453): `$8000`/`$1000`/`$800` drift, 128-line per-line ramp, 4-line bands, Plane B column vscroll for the water. → **partial** (drift row 6; columns and ramp yes).
- **DEZ1/2** (S3K:118639-118645, 118768-118775): static BG, palette cycling only. → **yes** (`v_factor: 15`, `fb: FACTOR_LOCKED`; cycling engine-only, row 17).
- **DDZ** (S3K:118920-119004): two FG cameras, Plane A vscroll from the second camera, 6-row ramp. → **no** (row 13 Plane A / second camera).
- **LRZ3** (S3K:119564-119680): 1/16, boss 20-column X offsets from a byte table, Plane B column vscroll for lava, both-plane haze with separate phases. → **partial** (per-column *horizontal* offsets no; the rest yes).
- **HPZ** (S3K:120179-120239): two anchor sets, 9 bands incl. two 4-line ones. → **yes**.
- **DEZ3** (S3K:120377-120615): BG on Plane A, scripted pan. → **no** (row 23).
- **Bonus stages**: Gumball two column bands (SE:1623-1690) → partial (Plane B columns yes, Plane A no); Slot Machine 8 reels (S3K:119136-119298) → no; Pachinko flat 3/4 + $60 (S3K:119032-119048) → yes (`FACTOR_3_4`); Blue Sphere whole-plane `$8B00` angle scroll (S3K:10598, 12703-12712) → not a level background.
- **2P Competition**: → no (row 25).

---

## D. Things we can do that they don't

- **Per-scanline linear factor ramps as a first-class field** (`curve`, sd:256-286). The games
  hand-roll every ramp with a 16.16 accumulator per zone; S1's are 16-px-row steps, S2 EHZ's is
  grouped 1/2/3 lines. Ours is per-line everywhere.
- **Independent FG and BG deform with authored tables** (sine, triangle, zero, hand-drawn `bin`)
  on any layer with its own amplitude shift and phase (schema §2.4; pd:45-80). The games have one
  ripple byte table per game (`SwScrl_RippleData`, `Lz_Scroll_Data`, `AIZ1_Water*Delta`).
- **Per-column Plane B vertical scroll as a static or animated authored shape** (perspective,
  floor, sine) usable in ordinary play (pd:107-127; px:1570-1605). S3K only turns column mode on
  for scripted events and one bonus stage.
- **Section-bound scenes with a smooth boundary lerp** (`TRANS_SMOOTH`, `constants.emp:607-618`;
  px:1538-1548) and a 2-D section grid (`act_descriptor.emp:95-96`). The games switch parallax
  per zone/act, or by one `cmpi` against camera X (S2 WFZ S2:15641-15644; S3K AIZ2 palette
  S3K:3260-3264).
- **World-anchored raster patches** — a fire line that follows a world Y through the camera
  (`patchable`, rd:426-450; `ep_patch_world_ys`, `preset.emp:65`). The games recompute the
  water line by hand each frame (S1 `LZWaterFeatures.asm:30-44`; S2 5285-5292).
- **Shadow/Highlight below a line** (rd:576-578) — none of the three games use S/H at all.
- **Per-line palette bands that are dot-free by construction** (3 colours per fire, rd:385) —
  the classics write 64 CRAM words in one interrupt and accept the artefacts.
- **Build-time refusal of wrong scenes** (`ensure` guards throughout sd; `effects_gen.py`
  refuses unknown keys/values) — the classic disassemblies carry documented bugs in this exact
  area: S2 EHZ writes 222 of 224 lines (S2:15382-15383), WFZ's band table runs off into HTZ's code
  (S2:15768-15771), MCZ/ARZ/DEZ shake is not applied to the bands (S2:16434-16441, 17564-17570).
- **Palette variants derived from the live palette per channel** (`variant()`, `ojz_effects.emp:637-641`).

---

## E. Framing challenges — what in the brief is false or misleading

1. **"autoscroll … s1 stars?"** — refuted. Starlight's stars are entirely camera-driven
   (S1:375-395; the 16.16 accumulator is camX·7/8/28 per row, no frame term). S1's only
   time-driven scroll is GHZ's three cloud rows (S1:94-97, REV01 only) and the Special Stage
   bubbles/clouds (`Special Stage Background & Palette Cycle.asm:261-262, 295`).
2. **"s2 CNZ/SCZ" as autoscroll examples** — half right. **CNZ has no autoscroll at all**
   (every value in `SwScrl_CNZ_GenerateScrollValues` S2:17041-17068 derives from `Camera_X_pos`);
   S2's autoscrollers are WFZ, HTZ, DEZ, SCZ and the title. S3K's CNZ has none either.
3. **"per-layer independent vertical scroll (e.g. s3k HCZ/ICZ/LRZ column tables)"** — wrong
   mechanism and wrong zones. HCZ and ICZ never enable 2-cell column vscroll; LRZ1/2 don't
   either (LRZ3's boss does). Column mode (`$8B07`) is set in exactly seven places, all events or
   bonus stages (S3K:104639, 106513, 110986, 115959, 117774, 119524; SE:1626), and column vscroll
   cannot give per-*row* vertical scroll anyway. S3K's genuine per-band vertical scroll is the
   `HInt6` mid-frame VSRAM write in AIZ2 and MHZ2 (S3K:104979-104982); HCZ's waterline is an
   hscroll-table permutation plus a tile rebuild (row 22). There is no `Vertical_scroll_table`.
4. **"`engine/level/bganim*.emp`"** — the file is `engine/level/bg_anim.emp`; "column rotation" is
   the coarse `step >> 3` part of one translation mechanism, not a separate driver.
5. **"deform tables are per-layer samples"** — per-layer *sampling* (shift/phase) is per layer,
   but per-layer *tables* (`deform: {own: …}`, schema §2.2) require `CAP_MULTI_DEFORM_TABLE`,
   which sonic4 does not declare (`game.emp:71` = $005E; `CAP_MULTI_DEFORM_TABLE` = $0020 at
   `scene_dsl.emp:186`); the `BAND_EXT_N` pin pair at `scene_registry.emp:417-420` refuses the
   mismatch. An Aurora scene using `own` fails the sonic4 build today. **[O19 @ aeon `4f846e25`:
   unchanged; only the refusal's line cite moved (`:309` → `:417-420`). Note the sister bit went
   the other way — `CAP_FACTOR_CURVE` ($0040, `scene_dsl.emp:187`) **is** in $005E, so curves are
   shipped and `own` tables are not.]**
6. **"more than 8 strips on screen"** — **[O19: the shape of this challenge is still right and its
   number is dead.]** The ceiling is N layers per *scene* covering the whole 512-line plane
   (`scene()`, `scene_dsl.emp:1117-1118`), which is tighter than an on-screen limit; and N includes
   a dormant layer if one is used to inherit scroll words. ~~N = 8~~ **N = 16 since 2026-08-27**
   (aeon `4f846e25` `engine/system/constants.emp:638`). The challenge survives the number change
   intact, which is exactly why it is stated in terms of *scope* rather than the value.
7. **The Aurora UI authors a subset** — **[O19: RE-MEASURED AT AURORA `8b716f5`; THIS ONE MOVED
   THE MOST, and it is the one row here nobody had to leave the repo to check.]** The panel now
   also edits, per layer, **`curve`** (parcel H — `curveFieldValue` / `curveFromField`) and
   **`vsplit`** (`vsplitFieldValue` / `clampVSplitAt`) with their own advisories, and, per scene,
   **`deform_fg` / `deform_bg`** (the shared table + speed, one loop over `SCENE_DEFORM_ROWS`),
   **`v_deform`** (table + speed + `amp_shift`, via `vDeformToggleCommand`) and the
   **`left_column_mask`** policy that `v_deform` makes mandatory — plus a per-layer `deform: own`
   table with its `phase`. Still JSON-only, re-checked: **`dsa` / `dsb`** (the card says so itself:
   *"The card has no control for dsa/dsb/phase"*) and **`anchor`** (no occurrence anywhere in
   `components/effects/`). The preview half of the claim holds: the scene half is still unpreviewed
   and wave 2 (`effects-facet.tsx` docblock), and the BgAnim band half now previews with a
   timer-only clock in `MapViewport`. So the "yes in the file, not yet in the panel" caveat now
   applies to two fields, not eight.
8. **`precision`** in schema §2.1 is retired on the aeon side (`effects_gen.py:78`; sd:169
   "RETIRED: CAP_PER_LINE") — the fill is per-line for every scene; the schema row is stale.
9. **Vertical fractions are shifts only** — the brief's "v_factor/v_center/v_offset" framing hides
   that MZ, SYZ, MGZ2, CNZ, MHZ and MCZ all use non-power-of-two vertical fractions (row 11).
10. **The biggest gap is not in the scene model at all**: Plane B is blitted once and never
    redrawn (`BG_Init`, `bg.emp:6-7`, `:58`; `Draw_BG_TileColumn`, `plane_buffer.emp:390`, zero
    callers), which is why art-width and art-swap techniques fail regardless of how the scene
    schema grows. **[O19 @ aeon `4f846e25`: re-measured and still true — and this is now the most
    load-bearing sentence in the document, because aeon's d-31 pricing (2026-08-29) turns the
    *vertical* half of it into a small parcel (~350 B ROM, 4 B RAM, no new VRAM) while leaving the
    horizontal half L. See row 19's marker.]**

**BLOCKED**: none. Every row was resolved from source. Not surveyed (out of the question's scope):
whether aeon supports S3K-style vertical level wrap (ICZ1/SSZ1) or screen shake on the BG.

---

## F. Addendum 2026-08-27 — the RAM half of "8 → 16 layers", measured

> **[O19 STATUS, 2026-08-29 @ aeon `4f846e25`] THIS ADDENDUM'S NUMBER WAS RIGHT AND ITS OPEN
> ITEMS ARE ALL CLOSED. The raise LANDED on 2026-08-27** (`parcel/band-ceiling-16-impl`).
> - **RAM: confirmed independently.** aeon derives the same `104 + 28 × MAX` → **328 B at MAX 8,
>   552 B at MAX 16, +224 B**. Two lanes, two derivations, one number.
> - **The cycle half (item 1) is COSTED, and this addendum's fear was wrong.** `ENGINE_ARCHITECTURE.md`'s
>   *"Step 4a stays copy-all"* does **not** mean O(MAX): every per-frame walk is seeded from
>   `pcfg_band_count`, and `MAX_PARALLAX_BANDS` appears in `engine/level/parallax.emp` **not once in
>   a code body**. A scene that does not use the extra bands pays **zero** added cycles per frame;
>   a full sixteen costs `4664 + 15 × 854 = 17,474` cyc = **13.7%** of the NTSC frame. So the
>   framing *"doubling the constant doubles that work for every scene including the 4-layer ones"*
>   was the one thing in this addendum that did not survive.
> - **Item 3 is done**: `SceneCfg9..16` + `lower9..16` are declared; `scene_dsl.emp:54` now pins
>   `== 16`; `tools/effects_gen.py:193` mirrors 16.
> - **Item 4 is done on both sides**: empyrean `86925008` and Aurora's vendored copy both read
>   `layers.maxItems: 16`, and the panel derives its cap rather than carrying a literal.
> - **The real blocker was none of the four**, which is worth keeping: `pcfg_layer_mask` was a
>   `u8`, so bands 8..15 tested a structurally-zero bit, took `.band_disabled`, and **silently
>   inherited the band above** — a green build and a wrong picture. Fixed by growing
>   `parallax_config` 28 → 30 with a `u16` mask (`pcfg_v_factor_fg` moved $02 → $1C). A costing
>   that enumerates RAM and cycles can still miss the thing that stops you.
> - The `engine/ram.emp` stale-comment warning below stands as a *method* note; the comment itself
>   is aeon's and moved with the parcel.

**Asked by the owner; nobody had answered it.** §B row 4 and aeon's own
`docs/DEFERRED_WORK.md` both say `MAX_PARALLAX_BANDS` is *"a RAM + cycle question"* and
neither produces a number. This is the RAM number. ~~The cycle number is still un-costed
and is the harder half — see the end.~~ **(Costed 2026-08-27; see the status box.)**

**Answer: +224 bytes of work RAM.** The parallax state block goes **328 → 552 bytes**.

**Measured from the ARTIFACT, then re-derived from source, and the two agree exactly.**
Read out of aeon's built `s4.debug.lst` (dated 2026-08-26 19:06, the DEBUG build — the
*larger* of the two shapes, so every headroom figure below is the conservative one):

| symbol | address | span |
|---|---|---|
| `Parallax_State` | `$FFFF88A0` | |
| `Parallax_State_End` | `$FFFF89E8` | **328 B** total today |
| `Parallax_Shadow_Bands` | `$FFFF8928` | |
| `Parallax_Shadow_Scroll_A` | `$FFFF89C8` | **160 B** = **20 B/band** |

**Per band = 28 B**, enumerated over every field in `engine/ram.emp` that is indexed by
`MAX_PARALLAX_BANDS` (`:345-346`, `:367-369`) rather than over the ones the comment
mentions:

- `Parallax_Current_Scroll_A` / `_B` — `u16` each → 2 + 2
- `Parallax_Shadow_Bands` — `BAND_ENTRY_LEN + BAND_EXT_BYTES + BAND_CURVE_BYTES` = 10 + 0
  + 10 → **20** (`ram.emp:38/:57/:65`; `BAND_CURVE_BYTES` moved 0 → 10 on 2026-08-26 with
  the d-15 showcase parcel, because OJZ now authors a curve)
- `Parallax_Shadow_Scroll_A` / `_B` — `u16` each → 2 + 2

8 × 28 = 224 today; 16 × 28 = 448. Fixed (non-scaling) remainder = 104 B, so
104 + 448 = **552**.

⚠ **`engine/ram.emp:337` says the block is "244 bytes at MAX_PARALLAX_BANDS=8" and that is
STALE — it is 328.** Kept here because the staleness is the check: 244 is exactly what the
formula yields with `BAND_CURVE_BYTES = 0`, i.e. the comment is the pre-curve-tail figure
and was not updated when the constant moved on 2026-08-26. Reproducing the stale number
from the old constants is what proves the model is right rather than coincidentally close.
**A costing done off that comment would be 84 B light.** aeon's comment, aeon's to fix; no
message sent, because there is no live dependency to name.

**Headroom: it fits, with room to spare.** `Game_RAM_End` is `$FFFFE50E` and the initial
stack pointer is `$FFFFFF00` (first long of `s4.bin`, read from the ROM, not from a doc),
and the stack grows down from there — so the free gap is **6,642 B**. 224 B is **3.4%** of
it. **RAM is not the constraint.**

**What this number does NOT cover, stated so it is not read as the whole cost** — *[O19: all four
items below are CLOSED; kept verbatim because the status box above is only readable against
them, and because item 1 is the one this lane got wrong.]*

1. ~~**The cycle half — the real gate, still un-costed.**~~ **[CLOSED, and the premise was wrong —
   the walks are O(live band count), not O(MAX). See the status box.]** `ENGINE_ARCHITECTURE.md:2486`:
   *"Step 4a stays copy-all."* The per-frame shadow copy is sized by
   `MAX_PARALLAX_BANDS`, not by the layer count a scene actually declares, so **doubling
   the constant doubles that work for every scene in the game including the 4-layer ones**.
   On a scanline budget that is where this is won or lost, and nobody has measured it.
   aeon has the instrument (`tools/parallax_cost_probe.py`, `deform_own_cost_probe.py`).
2. **`PARALLAX_STATE_LONGS`** (`engine/level/parallax.emp:322`) is derived from the
   constant and its `ensure` at `:276` pins the shadow span — both move with it.
3. **Three mirrors that must move in lockstep**, and they are pinned to each other so the
   build catches a partial edit: `scene_dsl.emp:54` (`ensure(MAX_PARALLAX_BANDS == 8, …)`,
   an inlined ceiling), `tools/effects_gen.py:188`, and the record-shape set
   `1..MAX_PARALLAX_BANDS` in `games/sonic4/data/effects/scene_registry.emp` —
   **eight new `SceneCfgN` shapes would have to be declared**, which is the bulk of the
   work and is code size, not RAM.
4. **Aurora's side is one schema bump** (`layers` max) plus whatever the band panel's
   derived cap reads — it already derives from the constant rather than carrying an 8.

**Verified at:** aeon `origin/master` `65236705e1260575d49abd1dd8fc64fdf5b74c22`
(`git ls-remote`-resolved; every source read taken with `git show <rev>:<path>`, never
through the sibling working tree). The listing and `s4.bin` are the artifacts on aeon's
disk at 2026-08-26 19:06 and are **not** pinned to that revision — they are the build the
lane last ran, which is why the source re-derivation is carried beside them rather than
the listing being trusted alone.
