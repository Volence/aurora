# Triage — owner feedback on the Effects facet (2026-08-26)

*Advisory parcel, decision-maker ruling. Source: `docs/reviews/2026-08-26-owner-feedback-effects-facet.md`
(his words). Every claim below was read from source in this worktree at master `7387346`, from
`empyrean/docs/AURORA_EFFECTS_SCHEMA.md` (cited by §), and from aeon's tree at
`/home/volence/sonic_hacks/aeon` (`engine/level/scene_dsl.emp`, `games/sonic4/data/…`). No emulator
was run; runtime confirmations are tagged **FOREGROUND**. Nothing in `src/` was modified.*

**One sentence for the overseer:** three of the nine points are the same defect — yesterday's lens
made *every* left-click in the view-only Effects facet a band gesture with no way out — and the
one he actually cares about (8, trunks over an animated background) is *not* a plane/priority
question at all: trunks and foliage are both Plane B, and the thing that blocks it is that Aurora
cannot author a band's ART, only its geometry.

---

## A. Per point

### 1. "A view to show the size of the camera on screen" — (ii) missing feature

**True.** No 320x224 frame exists anywhere on the map canvas: `grep` for `224`, `320`, `cameraRect`,
`screenRect`, `screen frame` over `src/renderer/canvas/*`, `src/renderer/components/MapViewport.tsx`,
`src/renderer/state/viewStore.ts`, `src/core/model/*` returns nothing but an unrelated comment
(`editorStore.ts:153`). The nearest thing is the parallax guides (item 43 part 1), which are lines,
not a frame.

It matters more than "nice to have" because of point 4: on the two shipped scenes a layer top *is a
screen line* (see 4), and without a screen-sized frame there is nothing on the canvas for those
lines to be relative to.

**Ruling:** build it (parcel G). Clockless overlay, toggle in the View menu, pinned at a world point
the author drags (not cursor-following: a frame that chases the cursor cannot be compared against
anything). Its size must be **derived, not typed** — Aurora carries no screen constant today; the
parcel cites aeon's own (`engine/constants` or `tools/vram_map.py`, whichever names the H40
224-line frame) and the ROADMAP §4.6 "224-line strip" is the only local mention.

### 2. "I double clicked and the animation tile popped up, which I don't know how to remove" — (i) DEFECT in yesterday's parcel

**Reproduced in source.** The candidate lens is seeded by *any* left-click that lands on the Plane-B
rectangle while the Effects facet is active, not by a double-click: `MapViewport.tsx:1701-1712`
records the cell on mousedown for `e.button === 0 && inEffectsFacet()`, and `commitBandMark()`
(`:1461-1497`) commits on mouseup when the pointer moved <5px. There is no `dblclick` handler
(`grep dblclick|onDoubleClick` over MapViewport: none); a double-click is simply two marks.

**There is no clear affordance of any kind.** `bandLensTarget` is only ever set to `{kind:'band'}`
(`MapViewport.tsx:1476`, `BgAnimBandPanel.tsx:363`) or `{kind:'candidate'}` (`editorStore.ts:425`
inside `setBandCandidate`). The only writer of `null` is the initial state (`editorStore.ts:386`)
and the debug hook (`debug-hooks.ts:661`, harness-only). The `Escape` branch at
`MapViewport.tsx:1196-1213` handles `pasting` and `marquee` and nothing else. The panel's candidate
group (`BgAnimBandPanel.tsx:592-604`) shows the coverage line and a hint but no button. Blank cells
would seed nothing (`commitBandMark` case 3), but the live OJZ background names a real tile in all
4,096 cells (item 43's `[6a]`), so "click somewhere harmless" does not exist either.

So: once lit, the wash stays until the app is closed. That is a defect, and it is compounded by
the wash being deliberately drawn *over* the foreground (`band-lens.ts:40-45`).

**Fix (parcel A, then B):** (a) `Escape` in the Effects facet sets `bandLensTarget` to `null`
(same branch as marquee, which is the precedent for "Escape clears chrome from any tool");
(b) a `Hide` chip beside the `highlighted on the map ·` line in both places it is rendered
(candidate group and lit card); (c) — the real fix — the mark stops being a side-effect of View
and becomes its own dock tool (point 3), so a pan-click in View seeds nothing.

**"Is there a way to draw in a band?"** — (ii) missing. No command edits the override's tile
pixels: `commands.ts` has `set-bg-override-layout` (cells → words) and `set-bg-override-band`
(band records) and nothing that writes `tiles[i]` or `phases[k][i]`; `ArtBrowser.tsx:75` *reads*
`project.bgOverride` for the strip only. The phase banks are generated once at promote/insert time
(`phaseFill: copy|shift|blank`, `bg-anim-aeon.ts:160-182`) and never edited. This is the gap that
also blocks point 8 — see there.

**"Is there a way to add these bands?"** — exists (`Promote` and `Add band` chips in the `New band`
section, `BgAnimBandPanel.tsx:459-617`) but both `BG animation bands` and `New band` arrive
**collapsed** (`defaultCollapsed` at `:300` and `:459`, chosen by item 45 for 1280x800), and nothing on the canvas or the dock says a band can be
made. Wording/affordance, folded into parcel B's tool-options line.

### 3. "The left toolbar only has View" — (iv) by design, but the design is now wrong

**True and deliberate:** `facet-tools.ts:31` `parallax: ['view']`, with a comment saying the
authoring happens in the column and "no scene parameter is edited by clicking the act". Item 43
then added two canvas gestures (guide drag, band mark) *without* adding tools, and justified the
mark-on-mouseup design precisely because View was the only tool (`ROADMAP` row 43: "taking the
press would kill panning").

**Ruling:** that justification is what produced point 2. Add one tool, `mark-band` (dock icon +
key), gate the mark on it, and leave View as a pure pan. The guide drag can stay on View (it grabs
a line, not the plane, and a miss pans — no accident possible). The tool-options slot (`mapFacet`
supplies none for aeon, `facet-registry.ts:161-163`) carries the two band verbs as chips
(`Promote from tile N` / `Add blank band`) so the collapsed section is no longer the only door.
Parcel B.

### 4. "Why max 8 layers if they go well beyond the screen — should be 8 per what's drawn" — (iii) engine model, and the UI IS misleading him

**What the cap bounds.** Schema §2.1: `layers` is 1..8 because `8 = MAX_PARALLAX_BANDS`; aeon
`scene_dsl.emp:1044` — the shadow view `Parallax_Shadow_Bands` is sized for eight entries per
**scene**, and an anchored scene needs `count+1 <= 8` (`:1050`). A scene is bound per **section**
(§3, `sceneRef` in `section_N.meta.json`) or per act (§4). So the cap is per scene, and the unit
of "what's drawn" that can carry a different eight is the section. Per-*screen* is not a unit the
engine has.

**But his intuition is right for every scene that exists,** and the brief's ground truth
("layers are a world-Y division of the whole act") is only half true. `scene_dsl.emp:2339-2391`
(`scene_plane_line`): a layer top maps to a plane line as `((world_y - v_center) >> v_factor) + v_offset`
*except* when `v_factor == 15` (the lock sentinel) — then "**for a locked plane the authoring
space IS the plane, so the mapping is the identity. EIGHTEEN OF THE TWENTY shipped scenes are that
case (tops 0/32/80/112/160, which read as screen lines because v_offset is 0)**". Both Aurora
scene files are locked (`ojz_act1_depth.json` and `ojz_act1_start.json`: `"v_factor": 15`, tops
0/32/80/112/160). On those scenes the eight layers divide the 224 visible lines (of a 512-line
plane), i.e. exactly "8 per what's drawn".

**Where the UI misleads him.** The panel labels the field `world_y` with bounds 0..32767
(`EffectsScenePanel.tsx:399-405`, `EFFECTS_WORLD_Y_BOUNDS`), and the guides draw at *act* world Y
(`effects-guides.ts:1-36`, "identity, no offset"). For a locked scene the engine's own bound is
`0 <= line < 512` (`scene_plane_line` ensure) and the number is a screen line. Aurora will
happily let him drag a locked layer to world_y 3000 and the bake refuses. The guides *look* right
on the canvas only by coincidence — Plane B is painted at world origin, so plane line N and act Y
N overlap inside the 0..512 rectangle — and are meaningless relative to the foreground beside it,
which is what "they go well beyond what's viewable" is describing.

**Ruling:** parcel C — the provider decides the space per scene (`locked → "screen line", bound
0..511`; `unlocked → "world Y"`, plus an advisory that the mapped plane line lands in 0..511), the
label, the spinner bound, the guide clamp and the guide caption all read it. Answer his question
on the surface: `8 layers per scene; a section can use its own scene`. With parcel G's frame the
locked case becomes visible.

### 5. "What is plane a packed scroll factor vs plane b packed scroll factor?" — (iv) wording + (iii)

**True:** the labels are the raw keys (`fa`, `fb`, `EffectsScenePanel.tsx:406-413`) and the titles
are the schema's own words. Engine meaning (§2.2, §2.3): per layer, `fa` is how far **Plane A (the
foreground / level plane)** scrolls horizontally per camera pixel and `fb` the same for **Plane B
(the background)**; `FACTOR_1` = moves with the camera, `FACTOR_1_16` = one-sixteenth (far away),
`FACTOR_LOCKED` = does not move. "Packed" is the engine's shift-add encoding of that fraction
(`{s1, s2, op}`, §2.3) — the custom escape hatch the picker shows only in `custom` mode
(`FactorField`, `:154-188`). Both shipped scenes keep `fa` at `FACTOR_1` on every layer, which is
what a level plane normally is.

**Ruling:** parcel D — label `Plane A (foreground)` / `Plane B (background)` with a one-line hint
under the picker (`fraction of camera X the plane scrolls; 1 = with the camera`), keep "packed"
and `s1/s2/op` inside the custom expander where they belong. No model change.

### 6. "The purple tiles don't say what they do — draw left to right? rotate?" — (iv) + (iii)

**True:** the caption leads with `coverageSubject` (`highlighted: the cells band 0 animates`) and
the card says `driver timer · rate_shift 2` and a rate line (`1px per 4 frames · ≈15 px/s`,
`bandStatus`). Nothing says the *mechanism*. The colour is magenta, not purple (`band-lens.ts:11`).

**What a band does (from source, so the sentence can be written once):** a band is a
`cols x rows` tile pattern whose eight banks are DMA'd over the same VRAM slots; with
`phaseFill: 'shift'` bank k is phase 0 rolled k px (`bg-anim-aeon.ts:169-175`), so the pattern
**scrolls horizontally** inside its own `pattern_px = cols*8` window; the driver (`timer`,
`camera_x`, `camera_y`) advances it 1 px per `2^rate_shift` units (schema §5); fine 1-px steps are
bank swaps, 8-px steps are a column rotation (`2026-08-26-band-animates-in-rom.md`, "coarse
two-piece DMA"). Every cell whose layout word names a band slot shows the same motion — that is
the footprint the lens shows. Direction: the memory bank records bank k at x = phase 0 at (x+k),
i.e. the art moves **left** as the driver increases — **FOREGROUND** to confirm on the ROM before
the caption states a direction.

**Ruling:** parcel D — the caption's second line and the card's rate line become one sentence from
one provider: `scrolls left · 1px per 4 frames (timer)` / `scrolls with the camera, 1px per 4 camera px`;
the candidate variant says `would scroll …`. The `From tile` group's hint gets the mechanism
sentence above, once.

### 7. "How are we doing the curved scroll? I don't see what's setting it" — (iii) + (ii)

**Found.** `aeon/games/sonic4/data/editor/effects/ojz_act1_depth.json` layers 3 and 4 carry
`"curve": {"to": "FACTOR_3_8"}` + `"vsplit": {"at": 20}` and `"curve": {"to": "FACTOR_1"}` +
`"vsplit": {"at": 44}`. Schema §2.2: `curve.to` ramps Plane B's factor from `fb` at the layer's
top to `to` at its bottom — that *is* the "curved horizon"; `vsplit` is a per-layer whole-plane
vertical scroll from that layer down. The codec round-trips both (`scene.ts:105-108`), so the file
is safe, but the layer card renders only `world_y`/`fa`/`fb` (`EffectsScenePanel.tsx:399-413`). So
the curve is set, saved, and invisible in the UI. Note also: section 0 is bound to
`ojz_act1_start` (`ojz/act1/section_0.meta.json`), which has no curve, and `project.json`
`sceneRef` is `null` — so the curved scene is not what section 0 plays today.

**Ruling:** parcel E (read-only surfacing of `curve`, `vsplit`, `deform`, `enabled:false` on the
card — S, no new commands), then parcel H (controls for `curve.to` and `vsplit.at` — the two the
shipped art uses; `deform` stays wave 2).

### 8. "Trees drawing over the bg behind it, with animation — how do I do that?" — the goal

**The premise in the feedback doc is wrong: this is not a priority/plane question.** The trunks
are Plane B art. `aeon/games/sonic4/data/editor/bg_src/ojz_forest_flowers.png` (the 512x512 source
the shipped override reproduces byte-for-byte, item 24) *is* four orange trunks over dark foliage,
and the BG library history is named for exactly this iteration (`ojz_bg_deep-forest-v14-animated-trunks`,
`v16-trunks-over-wall`). Inside one plane there is no priority; a nametable cell either names a
band slot (it animates) or a static slot (it does not). "Trunks over animated foliage" therefore
means: **the foliage cells between the trunks name band slots and the trunk cells do not.** Nothing
else — no plane bit, no `fa`/`fb`.

(The priority bit would matter only if the trunks were on a *different* plane than the moving
art — Plane B high-priority draws over Plane A low-priority — and that is not this picture.)

**Recipe with today's tooling — and where it stops.**

1. *Promote road* (visible by construction): `Effects › BG animation bands › From existing tiles`,
   point at a foliage cell (the lens shows every cell the range would take), `phaseFill: pre-shifted`,
   `Promote`. **Stops here for anything taller than one tile row:** the marquee measurement
   (`2026-08-26-bganim-marquee-resolution.md`, ROADMAP row 43) — the blob is row-major and a band's
   slots are column-major, so only single-row runs of this picture are promotable, and the live
   blob's de-duplication means the foliage tile between the trunks is the same slot as foliage
   elsewhere (band 0's slot 3 paints 964 cells). A 32-px foliage strip is four `rows=1` bands —
   which is the whole `BGANIM_MAX_BANDS` budget.
2. *Insert road*: `From new art › Add band` gives a blank `cols x rows` band in the prefix
   (proven, item 24) — then `Layout › BG layer › paint-tile` can point the between-trunk cells at
   its slots (`set-bg-override-layout`, d-12). **Stops here:** the band is blank and Aurora has no
   way to draw its art or its banks (point 2's second half). The picture goes black where the band
   is pointed.
3. *Regeneration road* (what exists today, d-10): aeon's `forest_bg_gen.py` lays a band region out
   column-major as its own block; that is how the live 8x4 timer band came to exist. Aurora then
   tunes driver/rate/fill and shows the footprint. This works but the band's art is authored
   outside Aurora.

Trunk *edge* tiles (a tile with both bark and foliage pixels) are the hard case on every road:
`shift` fill would roll the bark along with the foliage. Keeping bark still while foliage moves
needs per-bank hand-drawn art — which is road 2's missing piece again. In the shipped picture the
trunks sit on 8-px columns, so the edge problem is small, but it is real for any redraw.

**What is missing, exactly (parcels I and J, gated on owner question Q1):**
- **I — band art authoring inside Aurora:** a `set-bg-override-tiles` command (pixels of `tiles[i]`
  with the prefix rule — a write inside slots `0..Σ(cols*rows)` must also update that band's
  `phases[0]`, or the injector's `validate_band_coherence` refuses the file), the Art facet's pixel
  surface reaching the override blob, and a bank strip (phase 0..7) editor with `shift` as a
  regenerate button rather than a one-time fill.
- **J — point cells at a band in one gesture:** the BG tile picker groups the animated prefix by
  band, and a `stamp band` mode lays the band's `cols x rows` column-major pattern under the brush
  so a region is pointed at a band without hand-picking 32 slots.

With I + J, road 2 becomes: add band → stamp the foliage region → draw phase 0 → `shift` → watch.
Without them the honest answer to his question is road 3.

### 9. "Any vertical parallax in tooling yet?" — (iii)

**Partly.** Scene-level: `v_factor` (a right-shift, `15` = locked), `v_center`, `v_offset` are all
editable (`EffectsScenePanel.tsx:318-358`; schema §2.1) — that is whole-plane vertical scroll.
Per-layer: `vsplit` exists in the engine (§2.2) with no control (point 7). Bands: the `camera_y`
driver is in the picker (`BgAnimBandPanel` driver select). **Both shipped scenes are locked
(`v_factor: 15`), so OJZ has no vertical parallax today — by authoring, not by tooling.** None of
it is previewed (scene preview is wave 2; `effects-facet.tsx:9-16`).

**Ruling:** wording only now — the `V factor` row says `15 = locked (no vertical scroll)` in its
label, not only its tooltip; parcel H adds `vsplit`. No new parcel of its own.

---

## B. Parcels, in dispatch order

| # | Title | Size | Files | Acceptance (reviewer-checkable) | Deps |
|---|---|---|---|---|---|
| **A** | **Candidate lens can be cleared** (fix-now) | S | `components/MapViewport.tsx` (Escape branch `:1196`), `components/effects/BgAnimBandPanel.tsx` (`:592-604`, card `:358-363`), `state/editorStore.ts` | In the Effects facet, seed a candidate by click; `Escape` → `bandLensTarget === null` and a covered pixel is byte-identical to the lens-off value (reuse `[8b]`'s method). A `Hide` chip beside every `highlighted on the map` line does the same. Escape with `pasting`/`marquee` set keeps today's order (those still win first). Undo stack length unchanged by any of it. Harness rows planted red first (chip removed; Escape branch skipped). | — |
| **B** | **Band mark is a tool, not a View side-effect** (fix-now) | M | `workspace/facet-tools.ts:31`, `workspace/tool-meta.ts`, `state/editorStore.ts` (`EditorTool`), `components/MapViewport.tsx` (`:1701-1712`, `:1461`), `workspace/facets/effects-facet.tsx` (ToolOptions slot) | Dock shows `View` + `Mark band`; in `View` a click on the plane seeds nothing (harness: `bandLensTarget` unchanged, `bandCandidate` unchanged); in `Mark band` today's click behaviour holds unchanged (re-run `bganim-band-lens-harness` with the tool selected: 37/38 + 1 NM, same rows). Guide drag still works in both tools. ToolOptions line shows `Promote from tile N` and `Add blank band` chips wired to the same two commands, disabled with the same reasons the panel gives. Keyboard letter reserved in `tool-meta` without colliding with the layout facet's. | A |
| **C** | **Locked scenes author screen lines, and the UI says so** | M | `providers/effects-aeon.ts` (new `layerTopSpace(scene)`), `components/effects/EffectsScenePanel.tsx` (`:399-405`, `:318-336`), `canvas/effects-guides.ts`, `components/MapViewport.tsx` (guide clamp), tests | Node: `layerTopSpace({v_factor:15}) → {label:'screen line', max:511}`; unlocked → `{label:'world Y', max:32767}` plus `planeLineOf(scene, wy)` reproducing `scene_dsl.emp:2372-2391` (`((wy - vc) >> vf) + vo`) with the two refusals (`wy < v_center`, line outside 0..511) as advisory hints. Panel label and spinner bound follow it; a locked layer cannot be dragged past 511 (harness). Title of the Layers section reads `Layers (5/8 per scene)` with a tooltip `a section can bind its own scene`. `V factor` label carries `15 = locked`. | — (parallel with A/B) |
| **D** | **Say what a band does, and what fa/fb are** (wording) | S | `providers/bganim-preview-aeon.ts` (`bandStatus`), `providers/band-coverage.ts` (`coverageSubject`), `canvas/band-lens.ts` (caption), `components/effects/BgAnimBandPanel.tsx`, `components/effects/EffectsScenePanel.tsx:406-413` | One provider sentence, asserted identical on the caption and the card: `scrolls <dir> · 1px per 2^n <driver units>`; candidate variant uses `would scroll`. Direction word is **FOREGROUND-gated**: the parcel ships `scrolls` without a direction until the overseer confirms on the ROM, then flips one constant. `fa`/`fb` rows labelled `Plane A (foreground)` / `Plane B (background)` with the hint under; `packed` appears only inside the custom expander. `effects-column` harness re-run at both frames — column overflow at 1680x1050 must stay 0px. | after A (same panel file) |
| **E** | **Layer cards show curve / vsplit / deform / disabled read-only** | S | `components/effects/EffectsScenePanel.tsx` (card), `providers/effects-aeon.ts` (`layerExtras(layer)`) | Opening `ojz_act1_depth` shows on layer 3: `curve → FACTOR_3_8 · vsplit at 20`; layer 4: `curve → FACTOR_1 · vsplit at 44`; layers 0–2 show nothing extra (no empty line). `enabled:false` shows `disabled` and matches the dashed guide. Node test on the fixture; the sentence is built by the provider. | — (parallel) |
| **G** | **Screen frame overlay (320x224)** | M | `state/viewStore.ts`, `canvas/screen-frame.ts` (new), `canvas/canvas-colors.ts`, `components/MapViewport.tsx`, View menu | Toggle in View; frame pinned at a world point, dragged by its edge, persisted per session. Size derived from a named aeon constant (cite in the docblock; if aeon has none, the parcel says so and books it in aeon rather than typing 320/224 with no source). Clockless: `[11b]`'s 0-idle-repaint row passes with the frame on. Draws under the guides and the lens (it is a reference, not chrome about a document). | — (parallel) |
| **H** | **Controls for `curve.to` and `vsplit.at`** | M | `providers/effects-aeon.ts` (`setLayerFieldCommand` keys), `components/effects/EffectsScenePanel.tsx`, codec tests | `curve` picker reuses `FactorField` (it is a factor, §2.2); `vsplit` is a NumberField clamped 0..511 by the provider (item 37 rule). Round-trip golden: `ojz_act1_depth.json` parse→serialize byte-stable before and after an edit+undo. `deform` NOT in scope (wave 2). | E |
| **I** | **Band art authoring: tile pixels and phase banks in the override** | L | `core/editing/commands.ts` (new `set-bg-override-tiles`), `core/editing/bg-override-band.ts` (phase-0 coherence), Art facet pixel surface, new bank-strip component, agent method | A pixel write inside the animated prefix updates that band's `phases[0]` in the same command (unit test: coherence holds after write and after undo); a write outside the prefix touches no band. `shift` regenerates banks 1–7 from the edited phase 0 on demand. Bank editor edits bank k independently. Injector's `validate_band_coherence` accepts the saved file (run aeon's tool against the fixture in the test, as item 24's probe does). | owner **Q1** |
| **J** | **Point cells at a band in one gesture** | M | BG tile picker (`providers/tile-picker-source.ts`), `components/MapViewport.tsx` (stamp mode), `set-bg-override-layout` | Picker groups the prefix by band; `stamp band` lays `cols x rows` column-major under the brush; a stamped region's words name exactly the band's slots (harness reads the words back); undo restores every word. | owner **Q1**; independent of I |

Parallelism: **A, C, E, G** in parallel now; **B** after A; **D** after A; **H** after E; **I, J** after Q1.
Item 43's wave 2 (blob-strip range drag) stays booked as is and is not re-booked here.

---

## C. Questions only the owner can answer

**Q1 — where does band ART get made?**

- `question`: Aurora can make a band (geometry, driver, rate, pre-shifted banks) but cannot draw
  its art or its eight banks; today the art comes from aeon's generator (d-10 regeneration). For
  the trunks-over-foliage look, do you want band art authored in Aurora, or keep aeon's generator
  as the art road and Aurora as the tuner?
- `options`:
  - `aurora`: **Aurora authors band art** — parcels I + J (L + M). Cost: the largest parcel on this
    list, a new command family with a coherence rule the injector enforces, and a bank editor; the
    payoff is road 2 in point 8 working end-to-end inside one app, including hand-drawn edge tiles.
  - `generator`: **aeon's generator stays the art road** — no I/J; Aurora ships A–H only. Cost:
    every new animated region is a PNG/generator round-trip outside Aurora, and trunk-edge tiles can
    only be what `shift` makes of them; the lens and the tuning still work.
- `recommend`: `aurora`, `because`: it is the only road on which the thing he actually asked for
  (draw the trunks, animate what is behind them, in the same picture) is done where he is looking
  at it; and the bar this line was built to ("artists don't leave for Aseprite") already ruled
  against a tool round-trip once (§2.6 B).

No second question. Tool-vs-view (B), frame anchoring (G), and the locked-scene wording (C) are
decided above with their costs; overturn them in review if wanted.

---

## D. Framing challenges

1. **Brief, "known ground truth": "Layers are a world-Y division of the whole act."** Only for an
   unlocked plane. Both Aurora scene files and 18 of aeon's 20 registry scenes are locked
   (`v_factor: 15`), and for those aeon says in so many words that the authoring space *is* the
   plane and the tops are screen lines (`scene_dsl.emp:2366-2369`). Item 43 part 1's guides are
   labelled and bounded in the wrong space for every scene that exists. This is the root of point 4.
2. **Feedback doc, point 8: "a priority/plane question plus band aiming."** The trunks are Plane B
   art (`bg_src/ojz_forest_flowers.png`); no plane or priority bit is involved. It is a
   which-cells-name-band-slots question, and the missing piece is band *art* authoring, not aiming.
3. **Feedback doc, point 2: "the click-to-seed gesture … fired on his double-click."** Any single
   left-click seeds; there is no double-click gesture in MapViewport. Also "the animation tile popped
   up" is the lens wash, not a tile — nothing was written (`commitBandMark` case 1).
4. **Brief: "§2.6 (what shipped) — items 43/44/45 are the band tool."** §2.6 is the August line
   (UX overhaul, art authoring, collision) and does not mention bands; 43/44/45 are §5.1 rows only.
5. **ROADMAP row 43's "the effects facet's only tool is `view`, so taking the press would kill
   panning"** was a constraint the parcel chose to keep rather than one it had to; keeping it is what
   made every pan-click a band gesture.
6. **Point 6, "purple":** the wash is magenta (`band-lens.ts:11`); worth matching the word the
   owner uses in the caption's swatch so he and the UI name the same colour.

## E. Tagged for the overseer's foreground

- Band scroll **direction** on the built ROM (parcel D's one gated word).
- What the live 8x4 band's 964-cell footprint looks like when it steps — already tagged by row 43,
  still open; it is the concrete case behind point 8's "road 1 stops here".

## F. Blocked

Nothing. Images `6.png`..`9.png` were not available to this agent (session cache, not the repo);
point 8's reading of image 9 rests on the BG source PNG and the library names instead, and point
4's reading of image 6 on the scene files' tops rather than on what he was zoomed to.
