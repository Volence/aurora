# The screen frame, the fire line, and the band that vanished

**Branch:** `feat/screen-frame-guides` (from master `18488a9`)
**Date:** 2026-08-27
**Source:** the owner, live, mid-authoring — three reports and a build failure that turned out to share one root.

---

## 0. What he hit

1. *"I press add a band bank and idk where it is"* — **Add blank band** worked; nothing on screen said so.
2. *"if I zoom in the bands hold relative to my screen, not the bg"* — the layer guides rode the editor viewport.
3. `[Error] fire: screen line 303 outside 3..223` — and again at 319. Then **304/318**. Then **302/317**. Three dead
   builds in twenty minutes, on a **224-line screen**.

**(2) and (3) are the same defect.** For a locked scene `canvasYToLayerTop` was

```
canvasYToWorldY(canvasY, vp.y, vp.zoom) - guideOriginWorldY(vp, 'screen')   // origin === vp.y
  ==  canvasY / zoom
```

— a self-consistent inverse of the forward transform, so **nothing was arithmetically wrong**. The legal band
`0..223` simply occupied the first `223 * zoom` canvas pixels and **nothing on screen marked where it ended**.
He dragged into ordinary-looking canvas below that line and got 302. The frame is not decoration; it is the
drag's only feedback.

---

## 1. THE FRAME-ANCHOR RULE — chosen, derived, and what was rejected

> **Screen line 0 sits at the screen frame's top edge, less the scene's `v_offset`.**
> `guideOriginWorldY('screen', { frameY, vOffset }) === frameY - vOffset`.

### The derivation, which is aeon's up to its last step

| # | Fact | Source |
|---|---|---|
| 1 | `scene_vsplit_line(s, wy) = scene_plane_line(s, wy) - v_offset`, legal only under the lock | `aeon engine/level/scene_dsl.emp` `scene_vsplit_line` |
| 2 | Locked, `scene_plane_line` is the **identity** — *"For a locked plane the authoring space IS the plane, so the mapping is the identity"* | same file, `scene_plane_line` |
| 3 | So a locked layer's SCREEN line is `wy - v_offset`, and a screen line is a row of the 224-line visible display | (1)+(2) |
| 4 | The visible display's top edge, in act world pixels, is the camera's unbiased top edge `Camera_Y` | aeon camera; Aurora's own `ScreenFrameAnchor` is documented as *"in WORLD pixels (act axis; the camera's unbiased edge)"* |
| 5 | Therefore the guide for top `wy` is at world `Camera_Y + wy - v_offset` — an origin of `Camera_Y - v_offset` | (3)+(4) |

**Step 5 is a derivation. The VALUE of `Camera_Y` is a CHOICE, and it has to be**, because the lock's whole
meaning is that the answer does not depend on the camera (`parallax.emp`'s `.v_locked` arm: *"locked: BG =
vOffset (static, ignores camera + lerp)"*). Every camera position is equally consistent with a locked scene, so
**the engine cannot name one**. It is flagged as a choice, not smuggled in as a derivation.

Aurora already carries the author's own statement of which camera position they mean: **`viewStore.screenFrame`**,
the pinned draggable 320×224 rectangle that parcel G landed and nothing consumed. Anchoring to it gives guides
that stay on the same background pixel across a pan and a zoom, and that move **only** when the author says the
camera is somewhere else — by dragging the frame.

### Rejected

| Candidate | Why not |
|---|---|
| **`vp.y`, the shipped stand-in** | Not a world position at all. The reported bug. |
| **A hard-wired world 0** | It is the frame's *default* anchor, so nothing regresses on first open — but as a **rule** it asserts the camera is pinned at the act's top-left, true only at an act's very start and false everywhere an author works. It also leaves the guides unmovable against the art they are compared with. |
| **The act's start / camera-start position** | A second source of truth that would silently disagree with the frame the author can drag; and a scene is assigned to many sections, so there is no one act position it belongs to. |
| **A scene-document field** | This is an authoring viewpoint, not scene data. aeon's editor JSON has no such key, so it would not round-trip. |

### Two consequences, stated as choices

- **A locked scene FORCES the frame on**, whatever `overlays.showScreenFrame` says. A set of lines captioned
  "screen lines" drawn without the screen they are lines *of* is the ambiguity the frame was built to remove.
  The toggle still owns the frame everywhere else.
- **A forced-on frame is still grabbable.** One predicate (`screenFrameShown()`) gates the draw, the press and
  the hover — a frame on screen that cannot be moved would be worse than none, because the guides would then be
  anchored to something visible and immovable.

`guideCaption('screen')` changed from `screen lines — locked scene` to
`screen lines — from the screen frame's top edge`.

### The signature change is deliberate

`guideOriginWorldY(vp, space)` became `guideOriginWorldY(space, origin)`. A viewport and a `GuideOrigin` would
**both** satisfy a `{ y: number }` first parameter, so a stale call site would have kept compiling while quietly
restoring the bug. Putting `space` first made every one a type error. `DEFAULT_GUIDE_ORIGIN` is a **world
constant** (`{ frameY: 0, vOffset: 0 }`), never a viewport read: a forgetful caller gets a guide in the wrong
place but still **fixed in the world**.

---

## 2. TASK B — which layers are bounded to 3..223, and how that was determined

> **Only layers carrying a `vsplit` attachment.** Every other layer keeps the plane's `0..PLANE_LINE_SPAN-1`.

### The measurement

| Claim | Where it is enforced |
|---|---|
| `scene_vsplit_fires()` emits one fire per layer for which `scene_vsplit_is_none(l.ly_vsplit) == 0` | `aeon engine/level/scene_dsl.emp` — **ENGINE DSL** |
| That predicate is a **variant** test (`None => 1, At(off) => 0`), so `At(0)` still emits — 0 is a legal scroll value, not a sentinel | same file |
| The fire is `fx_vscroll_split(line, offset)` = `fire(line, [stream_vsram(...)])` | `aeon engine/effects/raster_dsl.emp` — **ENGINE DSL** |
| `fire()` ensures `line >= 3 && line <= 223` (`for line in 3..224` at the encoder is where it comes from — 224 visible scanlines, 0-2 to the priming records) | `raster_dsl.emp` — **ENGINE DSL** |
| The generator emits **no raster construct at all** — `effects_gen.py`'s `render_module()` writes `scene(...)`/`layer(...)`, the binding, the caps and the witnesses, and nothing else | `aeon tools/effects_gen.py`, corroborated against the committed `effects_scenes.emp` |
| The one live path from an editor scene to a fire is hand-authored: `scene_vsplit_fires(Scene_Editor_ojz_act1_depth)` | `games/sonic4/data/effects/ojz_effects.emp` |
| Every other `fire`/`patchable` call site uses a typed literal line, so no other layer top reaches the bound | tree-wide grep |
| The other scene-side consumer of a top is `scene_band()`, which makes a **band record** and never a fire — that is the layer the 0..511 belongs to | `scene_dsl.emp` |
| `patchable`'s sibling rule is **not reachable** from the editor path today; when wave 2 lands preset composition it will be, and its bound is the same 3..223 | `raster_dsl.emp`, `ojz_effects.emp` |

**THE LINE IS NOT THE TOP.** `screen = world_y - v_offset`. Both shipped scenes have `v_offset: 0`, which is
exactly why writing the rule as `3 <= world_y <= 223` would have looked right forever and been wrong the first
time anyone set a `v_offset`. `layerTopBounds` and `fireLineAdvisory` both carry the `v_offset` term.

### ⚠ A RULE IN A GAME'S DATA FILE IS NOT AN ENGINE RULE

Mid-parcel, the owner added a **third** vsplit and the build refused it. That refusal was a literal `== 2` in
`games/sonic4/data/effects/ojz_effects.emp` whose own comment called itself *derived*. **There is no engine cap
on vsplit count at all.** It is **deliberately not transcribed**, and `effects-aeon.test.ts` carries a row
asserting that three and five ordered splits are advised about nothing — so nobody re-adds it from the same
comment. Every bound this parcel transcribes was checked to live in `scene_dsl.emp` / `raster_dsl.emp` first,
and the table above says which for each.

**Taken instead:** `scene_vsplit_fires()`'s own `ensure(line > prev)` — splits must **descend the screen**.
Verified in the DSL, reachable from this panel, and an author cannot act on the build error without it.
`vsplitOrderAdvisory` transcribes it; `prev` starts at `-1` in the engine, so the first split can never trip it,
and layers without a split neither break the chain nor join it.

### Advisory vs prevention — where each line is drawn

**ADVISORY (`fireLineAdvisory`, `vsplitOrderAdvisory`):** a sentence under the field. It does not clamp, does not
disable, does not narrow anything, and **a warned scene still saves** (ROADMAP row 58's ruling, untouched). A
document that *arrives* holding 303 keeps 303 and shows the advisory. The ordering rule is advisory-only and
stays that way: it is a fact about **two** layers with two valid fixes, and a control that picked one would be
choosing for the author.

**PREVENTION (`clampLayerTop` narrowed for a fire-emitting layer):** the one prevention in this parcel, and it
**keeps a written promise rather than adding a rule**. `clampLayerTop`'s docblock has said since ROADMAP item 37
that *"the guide drag routes through this too, so a locked layer cannot be dragged to a line the bake would
refuse."* That was **false** for exactly the layers that can break a build. It bounds a **gesture and a
keystroke**; it touches neither load nor save; it leaves every non-fire layer on the plane's full span. What it
removes is the ability to **originate** an unauthorable value from a control that gave no sign of a limit — the
three dead builds.

`layerTopBounds(scene, layer?)` / `clampLayerTop(scene, value, layer?)` take the layer **optionally**, and
omitting it keeps the **loose** bound — so a forgetful call site refuses nothing the build accepts. Both live
call sites pass it.

---

## 3. TASK C — the band that vanished

`runBandVerb` (new, `src/renderer/providers/band-follow.ts`) is now the **one** execute for both doors —
`BgAnimBandPanel`'s chips and `EffectsToolOptions`'s bar, which each had their own copy. It executes, then:

1. `setBandLensTarget({ kind: 'band', index })` — selects it, and lights it on the map;
2. `revealPanel('aeon.bganim.bands')` — opens the section holding it;
3. `revealBand(index)` — the panel's effect scrolls the card into view;
4. one toast: `Band N added — selected below, and lit on the map`.

**The index is read, not inferred:** `command.plan.bandIndex`, which `planBandInsertion` recorded. Re-deriving
"it must be the last one" would be wrong the first time an insertion is not an append. The REMOVE direction of
the same command type is deliberately not followed.

**Two blockers had to be removed first:**

- **`CollapsibleSection` snapshots panel state into its own `useState` at mount** and re-reads only on its own
  header click, so an external `savePanelState` would have changed localStorage and **re-rendered nothing** —
  the reveal would have been a silent no-op. `panel-state.ts` gained a subscription and a `revealPanel(id)` that
  writes **and notifies**. It is a **one-way door** on purpose: nothing should be able to *collapse* a section
  behind the author's back.
- **`Card` had no ref, no id and no data attribute**, so there was nothing to scroll to. It gained an optional
  `domId`; the band cards pass `bandCardDomId(index)`.

**ONE UNDO STEP, and structurally unable to be two.** `EditHistory.execute` is the only thing that pushes an
undo entry; the selection (`bandLensTarget`), the scroll request (`bandReveal`), the reveal (localStorage) and
the toast are all outside the document and none is an `AnyCommand`. Pinned in the node suite
(`band-follow.test.ts`: *"NONE OF IT IS AN EDIT"*) and in the app (harness `[7g]`: one Ctrl+Z restores the
exact `bgOverrideHash`).

**Stated rather than hidden:** undoing the add does **not** un-select. `bandLensTarget` keeps an index that may
name no band — the staleness `resolveBandLens` already exists to absorb, exactly as it does for a promote.

---

## 4. Verification

### Node suite

`npx vitest run` — **388 files passed, 2 skipped; 5108 tests passed, 7 skipped.** (Master: 5090 passed.)

### CDP harness — `scratchpad/screen-frame-guides-harness.mjs`

Drives the real Electron app under Xvfb: real CDP mouse events on `#map-canvas`, real clicks on real chips, and
reads the model back through `window.__dbg` **and the canvas's own pixels**.

**33/33 rows, three consecutive clean runs**, dpr = 1 in all three,
rect `{left:284, top:106, width:816, height:742}`:

| run | rows | uptime at start | load at start |
|---|---|---|---|
| 1 | 33/33 | 179954 s | 6.15 2.72 2.37 |
| 2 | 33/33 | 179993 s | 4.89 2.81 2.41 |
| 3 | 33/33 | 180028 s | 3.19 2.62 2.36 |

Every mouse coordinate goes through `aimY`/`aimX` (integer client pixels) and every expectation is derived from
**that integer** through the app's own contract. No two rows are ever read out of two different runs.

#### The three catchers

| id | row | what makes it discriminating |
|---|---|---|
| **3c** | the guide holds the **same world row** across a pan and two zooms | `vpY + canvasY/zoom` is the map's own inverse transform, so "the same world Y" **is** "the same background pixel". A static observation cannot tell the two origins apart at all — at `vpY = 0` with the frame at world 0 they are the **same number**. |
| **5c** | the same drag on a **fire-emitting** layer stops at 223 | driven **at zoom 2**, where the legal band ends at canvas Y 446 on a 742-tall canvas. At zoom 1 the drag might never leave 0..223 and the row would pass on the broken build too. |
| **7d** | the new band's card is **in the DOM** and the band is selected | the section is `defaultCollapsed` and renders no children while shut, so the element's existence **is** the reveal. `[7b]` proves it was absent beforehand. |

#### Non-discriminating rows, disclosed

- Every row named `[anti-vacuous]` — `0a` (both probes exist), `1a`, `1b`, `2a`–`2e`, `3d`, `3h`, `5a`, `7a`,
  `7b`, `7c`. They exist so a green catcher cannot be green because nothing was on screen.
- **`3b`** — "the guide sits exactly T screen lines below the frame top" — **passes on the broken build too**,
  measured: it was green under plant A. It is taken at `vpY = 0`, where the two origins coincide. It states the
  rule; **3c** is what tests it.
- **`7g`** (one undo step) passed under plant C, correctly: it measures undo count, not the follow-up.

#### "If this row went green for a reason OTHER than the rule holding…"

- **3c** — (i) *a different rule's error?* There is no error matcher; it compares numbers. (ii) *two paths, one
  observable?* `layerGuideGeometry` is the only producer, and the report is a **publish** from the draw pass.
  (iii) *the wrong quantity?* Ruled out by measurement: under plant A the same row reports
  `worlds=[112,212,212,152]`. A **stale publish read four times** is ruled out by `3d`, which asserts the paint
  counter advanced between all four samples (`paints=[8,9,10,11]`).
- **5c** — the obvious false green is *the drag never grabbed*, leaving the old value. Ruled out: `5b` runs the
  **identical gesture** immediately before and reaches 351, and the value going into 5c **is** 351 — so 223 can
  only come from a completed, clamped drag. `5d` independently shows the gesture left one undo entry.
- **7d** — the obvious false green is *the card was always there*. Ruled out by `7b` (absent before the click).
  The index could not be set by a stray map click; none is dispatched, and under plant C it read `null`.

### Red-first plants — the app, rebuilt and re-run each time

| plant | what was broken | rows that went red | quoted failure |
|---|---|---|---|
| **A** | `guideOriginWorldY` fed `{ frameY: vp.y }` at all three sites — the shipped stand-in restored | **3c**, 3g, 6a (30/33) | `worlds=[112,212,212,152] ; canvasY per sample=[{"vpY":0,"zoom":1,"canvasY":112},{"vpY":100,"zoom":1,"canvasY":112},…]` — **the guide sits on canvas row 112 at both pans**, which is the owner's sentence verbatim. Also `guide canvasY 112 -> 112 (delta 0, expected 90)` when the frame is dragged, and `top=297 frame-relative=447 viewport-relative=297`. |
| **B** | `clampLayerTop` returns the plane bound for every layer | 4c, 4d, **5c**, (5b/5d cascade) (28/33) | `[4c] world_y=400 (typed 400)`; `[5c] top=400; the same gesture without the fire bound writes 351` |
| **B2** | `clampLayerTop` clamps **every** screen-space top to 3..223 — the over-strict direction, the failure this repo cares most about | **4a**, 4b, **5b**, 6a (29/33) | `[4a] ★ a layer with NO split still reaches 303 … world_y=223`; `[5b] top=223 contract=351` |
| **C** | `runBandVerb` executes and calls no follow-up | **7d**, 7e, 7f, 7h (29/33) | `[7d] card=null lens=null`; `[7f] []` (no toast) |

Node-suite plants, each restored and re-run green (8 in total): the viewport origin in `layerGuideGeometry`
(5 rows red, `expected 112 to be 612`); the blanket fire bound (`expected 'this layer authors a Plane B
split, s…' to be null`); `world_y` used as the screen line (`expected 300 to be 100`); `Boolean(vsplitFieldValue)`
exempting `at: 0` (`expected false to be true`); the clamp forgetting the fire bound (`expected 302 to be 223`);
the clamp going blanket (`expected 223 to be 303`); `revealPanel` writing without notifying (`expected +0 to
be 1`); plain layers joining the vsplit ordering chain.

### The aeon tree — reported honestly

⚠ **The md5s of `../aeon/games/sonic4/data/editor/effects/*.json` DID change during this session, and every
change was the owner's own live editing.** I cannot show them unchanged over the whole session and will not
pretend otherwise.

```
session start        dee9716e9bd000534ab0dd6d95605174  ojz_act1_depth.json
                     bdfc968a78bced3cddb7e71dbd3bb490  ojz_act1_start.json
09:41 (owner edits)  3f03af1df8acf8ce813fc44efe9445df  ojz_act1_depth.json
                     f7605b5c542d1b540c685d21f8f93863  ojz_act1_start.json
09:49 → now          55a1339c73ca2cf3906bddb9729bfd2a  ojz_act1_depth.json
                     f7605b5c542d1b540c685d21f8f93863  ojz_act1_start.json
```

**What IS demonstrable:**

- Across **all seven harness runs** (09:53 onward) both md5s are **unchanged**: `55a1339c…` / `f7605b5c…`.
  The 09:53:32 mtime on `ojz_act1_depth.json` is a rewrite with **byte-identical content** (its md5 already
  read `55a1339c…` in a copy taken at 09:49).
- **No process of mine ever opened his tree.** The harness hard-refuses to start without `AEON_DIR`, asserts the
  directory exists, and **prints the path it opened on every run** — always
  `/tmp/claude-1000/…/scratchpad/aeon-fixture`, a `tar` copy. My only touches of
  `/home/volence/sonic_hacks/aeon` were `sed`, `grep`, `md5sum` and `tar` — all read-only.
- The harness never presses Ctrl+S and calls no save; it undoes back to the fixture's own scene list and says so.
- `scratchpad/fixtures/aeon-build-pin` was never read, written or removed — it does not exist in this worktree.

His scene as it stands now: `v_factor 15`, `v_offset 0`, tops `0 / 32 / 80 / 209 / 223` with three splits
(`at: 80 / 20 / 44`) on the last three. **Every one of them is inside 3..223 and strictly ascending, so neither
advisory would say anything about it** — which is the shape this parcel is meant to keep him in.

---

## 5. Files

| file | what |
|---|---|
| `src/renderer/canvas/effects-guides.ts` | `GuideOrigin`, `DEFAULT_GUIDE_ORIGIN`, the re-ordered `guideOriginWorldY`, the origin on `GuideDrawOptions`, the new caption, and the derivation written out |
| `src/renderer/components/MapViewport.tsx` | `guideOriginOf`, `screenFrameShown`, the guide scene hoisted above the frame block, one anchor read by both, the origin at all three interaction sites, the layer passed to the drag's clamp |
| `src/renderer/providers/effects-aeon.ts` | `EFFECTS_FIRE_LINE_MIN/MAX`, `layerEmitsFire`, `fireScreenLineOf`, `fireLineAdvisory`, `vsplitOrderAdvisory`, `layerTopBounds`/`clampLayerTop` taking the layer |
| `src/renderer/components/effects/EffectsScenePanel.tsx` | both advisories rendered under the layer-top field; the layer passed to the bound and the clamp |
| `src/renderer/providers/band-follow.ts` | **new** — `runBandVerb`, `followBand`, `newBandIndexOf`, `bandCardDomId`, `BANDS_SECTION_ID` |
| `src/renderer/shell/panel-state.ts` | `subscribePanelState`, `revealPanel` |
| `src/renderer/components/ui/CollapsibleSection.tsx` | subscribes, so an external reveal actually re-renders |
| `src/renderer/components/effects/column-layout.tsx` | `Card` takes an optional `domId` |
| `src/renderer/components/effects/BgAnimBandPanel.tsx` | `apply` routes through `runBandVerb`; the scroll effect; card ids |
| `src/renderer/components/effects/EffectsToolOptions.tsx` | its chip routes through `runBandVerb` — the two doors, one derivation |
| `src/renderer/state/editorStore.ts` | `bandReveal`, `revealBand`, `clearBandReveal` |
| `scratchpad/screen-frame-guides-harness.mjs` | the 33-row CDP harness |

---

## 6. Booked, not fixed

- **`showScreenFrame` is now unreachable-as-off in the effects facet on a locked scene.** Deliberate (§1), but a
  reader of the overlay menu is not told. A disabled-with-reason state on the toggle would say it; not built.
- **The frame is anchored per-session, not per-project.** `viewStore.screenFrame` is not persisted with the
  document, so the author re-places it each session. Whether it should be a project-level or per-act setting is a
  real question this parcel did not answer.
- **`patchable`'s `lo..hi` rule is not surfaced**, because it is not reachable from the editor path today (§2).
  When wave 2 lands raster preset composition from the editor it becomes live; the bound is the same 3..223, so
  only `lo <= line <= hi` and `lo <= hi` would need adding.
- **Undoing an add leaves a stale `bandLensTarget`** (§3). Absorbed by `resolveBandLens`, not corrected.
- **TAGGED FOR FOREGROUND HARDWARE FOLLOW-UP:** nothing here was confirmed on an emulator or a ROM. The 3..223
  bound and the `top - v_offset` mapping are transcriptions of aeon comptime `ensure`s; a build of a scene
  authored through this panel would confirm them end to end, and this lane may not build.
