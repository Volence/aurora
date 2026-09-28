# MapViewport foreground: the nine on-screen items, measured on today's tree

**Branch** `parcel/mapviewport-foreground`, base master `98b82907`. **Date** 2026-09-28.
**Row** `MAPVIEWPORT-UNTESTED`, last line `2026-09-25T14:29:44Z` (line 279 of `docs/lens-findings.jsonl`),
"WHAT REMAINS", FOREGROUND-ONLY. Re-derived from that line. It lists the same nine items as the
brief, and the owner-parked M5, M7 and the M1 note, which this parcel does not touch.
**Code tip** `4d095fdb` (the harness and its `package.json` line), then `4ec26c0c` (run logs). This
packet follows them. No `src/` file was committed.

---

## 0. The answer: seven of the nine already had rows, and the ledger never cited them

`npm run harness:cdp-sweep-4-0912` (`scratchpad/cdp-sweep-4-0912-harness.mjs`, packet
`docs/reviews/2026-09-12-cdp-sweep-4.md`) was built on 2026-09-12 from the same list, in the same
words, and landed with red-first plants. No line of `MAPVIEWPORT-UNTESTED` cites it. Every line
from `2026-09-12T05:18:14Z` onwards copies the list forward. The same thing happened with the
plane items the 2026-09-25 packet closed. **The brief's list is stale. The ledger is where the
staleness starts, and the brief copied it.**

Since then, two changes to that harness matter here:

- `3d35454c` (2026-09-26, ROADMAP rows 223+224) **retired its XO rows** along with the crossover
  brush. That left item 7, the collision hover preview, with no running-app row.
- Its guide rows (GD) prove the drag **inside** the Effects facet. `effects-guides` 8b proves that
  Layout **draws** no guide. Nothing pressed a guide's row **outside** the facet, so item 3's gate
  had only its drawing half proven.

So the parcel did three things. It re-ran cdp-sweep-4 on today's tree and re-planted one mutation
per item there. It built `harness:mapviewport-foreground` for the two real gaps. And it measured
item 9 at narrower windows.

| # | item | verdict | rows | derived on-screen behaviour (from the code) |
|---|---|---|---|---|
| 1 | stamp ghost during a chunk-link hover | **ALREADY-COVERED**, re-run and re-planted | sweep-4 SG.0, SG.a, SG.b | While the stamp is armed with a chunk picked, the link hover names the placement under the pointer, and the picked chunk's own art is drawn at 0.55 alpha. It sits at that chunk's own snapped origin, with a `SELECTION_MARQUEE` outline. The ghost gate (`MapViewport.tsx` ~860) never reads `linkHover`. |
| 2 | the Chunk links panel on screen | **ALREADY-COVERED**, re-run and re-planted; plus one measurement (CLV) | sweep-4 CL.a, CL.b, CL.c; this harness CLV (note) | `ChunkLinkOptions.tsx`: "Under cursor: <name> (#id)" in textBase with Detach enabled, or the no-link text in textLo with Detach disabled. |
| 3 | the guide drag gated on the Effects facet | **PROVEN**: the Effects half ALREADY-COVERED (sweep-4 GD.*), the gate half NEW | sweep-4 GD.0, GD.a, GD.b; this harness GT.0, GT.c, **GT.a** | `activeGuideScene()` returns null outside `EFFECTS_FACET`, so in any other facet no guide is drawn and a press on its row goes to the armed tool. |
| 4 | the screen frame's locked-scene arm | **ALREADY-COVERED**, re-run and re-planted | sweep-4 SF.0, SF.a, SF.b | On a locked scene (`layerTopSpace === 'screen'`), the frame is drawn even with the toggle off, with its top at the scene's `v_offset` (`frameAnchorFor`). An edge drag writes `v_offset` as one undo step (`endFrameDrag` then `commitVOffset`). |
| 5 | `resolveEscape`'s lens arm | **ALREADY-COVERED**, re-run and re-planted | sweep-4 ESC.0, ESC.a, ESC.b | In Effects, with no paste and no marquee, Escape clears `bandLensTarget` and the lens tint goes. In Layout, Escape leaves it standing (`map-escape.ts`). |
| 6 | the paste ghost | **ALREADY-COVERED**, re-run and re-planted | sweep-4 PG.0, PG.a, PG.b, PG.c | The clipboard's art is drawn at 0.55 under the 0.1 fill, at the hovered snapped base, with a dashed edge. There is no art over a tile set it does not fit. Collision shading appears where the clipboard's plane word is nonzero. |
| 7 | the collision hover preview | **PROVEN (new rows)** | this harness XP.0, XP.a, XP.p, XP.d, XP.c, XP.e, XP.b | `drawCollisionPreview` (~795 to 1061): the brush word's resolved shape is filled in `COLLISION_PREVIEW_FILL` at the hovered 16 px cell, and the cell gets a `COLLISION_PREVIEW_PRIMARY` outline. Both are drawn on `#map-preview-canvas`. The ghost follows the cell under the pointer, clears on leaving the map, and carries the palette's flip. |
| 8 | the band preview | **ALREADY-COVERED**, re-run and re-planted | sweep-4 BAND.0, BAND.c, BAND.a, BAND.b | With Play animations on, the cells a band owns show that band's phase for the camera pan. Cells whose phase art differs change between two steps, and static cells never change. With it off, the plane is static (`drawBands`, ~1404). |
| 9 | the hover bar's legibility | code half **ALREADY-COVERED** (sweep-4 HB.*). Widths **PROVEN** at 1400/1100/900 (HBW.a). **DEFECT-BOOKED** at 700 (HBW.find). Look calls are **questions** (section 4) | sweep-4 HB.0, HB.a, HB.b; this harness HBW.a; notes HBW.find, HB.numbers, HB.lines | `styles.hoverBar`: 11 px mono in textBase on `rgba(17, 17, 27, 0.9)`, anchored to the bottom, `white-space` normal, inside a container with `overflow: hidden`. Nothing sets nowrap or a min width, so the readout wraps. A run with no break opportunity gets clipped. |

**Result: 9 of 9 have running-app rows that pass on today's tree. Every claim row went red under a
plant and green again on the restored build. One finding is booked (item 9 at 700 px). No `src/`
change was made.**

---

## 1. The rig, and which tree answered

- **Tree.** This worktree, built with `VITE_AURORA_DEBUG=1 npx electron-vite build`. Each run was
  launched with `AURORA_BUILT_TREE=<this worktree>` and
  `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` (an example path,
  not a default). Every run of both harnesses printed `root:` and `pinned: AURORA_BUILT_TREE=`
  naming this worktree. This harness also printed `in-tree: yes`, and the finals printed
  `src on disk: identical to HEAD` and `harness: blob 0279ce53... (as committed at HEAD)`.
- **aeon.** HEAD `713f039d576c1f557d611bccaee98bbae396a90c`, clean.
  - `harness:mapviewport-foreground`: `AEON_DIR` is an rsync copy (`.git` and `.claude`
    excluded), taken 2026-09-28T14:45:50Z into a directory under `$HOME`. Each run copies it
    again into its own mkdtemp under `TMPDIR`, and the harness refuses the live sibling.
  - cdp-sweep-4: its required `git archive` tarball of the same commit. Every run printed
    `commit 713f039d...` back from it.
- **No emulator.** `ORACLE_SOCKET` points into each run's own mkdtemp. No `mcp__oracle__*` call
  was made.
- **Display.** Every run in this parcel was at **dpr 1**, window 1400x900 (inner 1400x872). The
  map canvas rect was `{284,74,876,774}` in the Collision facet, `{284,106,816,742}` in Effects
  and `{284,74,876,721}` in Layout. **The 1.35 path was not exercised today.** Every part of
  every final printed "no mouse event reached the page at a position this harness did not send".
- **Window widths (HBW).** `Browser.getWindowForTarget` does not exist in this Electron, on the
  page socket or the browser socket (`'Browser.getWindowForTarget' wasn't found`). The widths are
  therefore set with `Emulation.setDeviceMetricsOverride`, and the run prints this every time.
  That is a viewport override, not an OS window resize. CSS layout sees the same width, but it
  is not the window manager's resize path.

---

## 2. The new rows (`scratchpad/mapviewport-foreground-harness.mjs`, `npm run harness:mapviewport-foreground`)

**Oracle.** Nothing is asked of the map about itself.

- The collision tables are decoded **outside the app**, from the run's own copy, by the tree's
  own `collisionTableSearchPaths` and `loadCollisionProfilesFa` (`src/core/project/aeon/load.ts`).
  A word is resolved by `resolveCell`, and `columnSolidRun` gives each column's run. These are
  bundled from `src/`, and no plant touches those files.
- Colours come from `HEAD:src/renderer/canvas/canvas-colors.ts`, each through a regex that must
  match exactly once.
- The brush word is read with `armCollisionBrush({})`, which is an empty selection and writes
  nothing.
- Pixels come from `#map-preview-canvas`'s own backing store and from screenshots.

### 2.1 Item 7: the collision hover preview (PART `xp`)

Setup: the Collision facet, then Brush 1 and Plane A by real clicks. Zoom 4, so one cell is 64
CSS px. The shape is the first palette entry, picked by real clicks, whose oracle profile is
asymmetric and partial at both ends. In the finals that was `#242 (mirrored to face left) · solid ·
all`, word 13554, heights `[13,13,13,12,12,12,12,12,11,11,11,11,10,10,10,10]`. The aim (636,426)
derives back to cell (5,5).

| row | asserts | final1 evidence |
|---|---|---|
| XP.0 | PREMISE: real clicks hit; the aims land on (5,5), (6,5) and a far cell; the layer is empty before the hover. Does not discriminate. | layer before `total 0` |
| XP.a | Within the hovered box, the fill covers the oracle silhouette (coverage ≥ 0.5). It appears nowhere outside that silhouette, including anywhere else on the layer. Nothing is drawn beyond the angle mark's reach (6.5 cell px × zoom + 4 = 30 px) | silhouette 2703 px, fill inside 2552 (0.944), fill outside 0; layer beyond reach 0 |
| XP.p | `COLLISION_PREVIEW_PRIMARY` on ≥ 90% of each edge's outermost ring. The tolerance, (1 − 0.95) × 255 + 1, comes from HEAD's alpha: the outline is drawn last, over the white scope outline | 58/58 on each edge; pixel `rgb(127,188,245)` |
| XP.d | ON SCREEN: the screenshot equals the layer composited over a no-ghost reference in ≥ 99% of the box, and changed there | composite 4096/4096, changed 3186 |
| XP.c | One real move to (6,5): the silhouette is in the new box, and the old box has no fill | coverage 0.944, old-box fill 0 |
| XP.e | Pointer off the map (a real move onto the palette): the whole layer is empty | `total 0` |
| XP.b | A real click on H: the brush word becomes the mirror (oracle), and the ghost at the same cell is the mirrored silhouette and no longer the old one | 13554 to 12530; coverage 0.944, fill outside 0; against the old silhouette, 76 outside |

### 2.2 Item 3: the facet gate (PART `gate`)

The Effects facet and scene `ojz_act1_start` are chosen by real clicks at view (0,0,1). The
report puts layer 2 at canvasY 80 = world_y 80, the offset from the plain world contract is 0,
and the pixel at (584,186) is cyan `rgb(60,165,180)`.

| row | asserts | final1 evidence |
|---|---|---|
| GT.0 | PREMISE; does not discriminate | as above |
| GT.c | CONTROL, not a gate row: in Effects, a real press on that row dragged 40 px takes the guide (80 to 120), and one Ctrl+Z restores it | 120, then 80 |
| GT.a | In **Layout**, with the marquee tool armed by a real `m`, the same world row pressed (584,154) and dragged the same way leaves world_y at 80. The press goes to the marquee instead: the committed selection contains the pressed tile (37,10) | world_y 80; marquee `{col 36,row 10,w 6,h 6}` |

### 2.3 Item 9: widths (PART `hb`), and item 2's measurement (PART `panel`)

HBW.a: the collision overlay is on, and the view is panned so a known non-air cell of section 0
is on the map at every width (cell (8,13), word 4306, readout
`Sec 0 | Tile (17, 27) | Pos 136, 216 | Coll A #210 top 23° ▇▇▇▆▆▆▆▅▅▅▅▄▄▄▄▄`, the longest arm).
The row checks three things at 1400 (the app's default, `src/main/index.ts`), 1100 and 900:
- every line box of the text lies inside the map container;
- `scrollWidth ≤ clientWidth`;
- the collision arm is really shown.

| window | map canvas width | bar lines | bar height | scrollWidth / clientWidth | inside |
|---|---|---|---|---|---|
| 1400 | 876 | 1 | 25 | 876 / 876 | yes |
| 1100 | 576 | 1 | 25 | 576 / 576 | yes |
| 900 | 376 | 2 | 41 | 376 / 376 | yes |
| 700 (finding, not gated) | 176 | 3 | 57 | **188 / 176** | **no** |

CLV (a note, not a row; cdp-sweep-4's CL.a scrolls the readout into view before it looks). At the
default window, with the stamp armed and nothing scrolled, the readout sits at y 747.8 to 762.8
in an 872 px window. That is inside its scroller (74 to 795; `scrollTop` 0, `scrollHeight` 1146 vs
`clientHeight` 721), and `elementFromPoint` hits it. **It is on screen without scrolling at
1400x900.** It is 32 px above the scroller's bottom, so a shorter window would push it below the
fold. That was not measured.

---

## 3. Red first: every claim row planted, rebuilt, run, restored, rebuilt, run

Each plant is an exact-anchor replacement that is refused unless the anchor occurs exactly once.
The diff is printed from disk before the build. Each red build is a fresh debug build, and each
red run's header shows the file under `src on disk: DIFFERS FROM HEAD`. The restore is
`git checkout HEAD -- src` at `4d095fdb`, with the tracked status empty afterwards, followed by a
fresh build and the **restored-green run**, whose header shows `identical to HEAD`. Every run was
at dpr 1. Logs are in `docs/captures/2026-09-28-mapviewport-foreground/logs/`, as `red-<plant>.log`
and `green-<plant>.log`.

| plant (file) | the line on disk | red | stayed green | restored |
|---|---|---|---|---|
| xp-ghost (MapViewport) | `if (profile && false /* PLANT xp-ghost */) {` | XP.a (coverage 0), XP.c, XP.b | XP.0, XP.p, XP.d, XP.e | 8/8 |
| xp-primary | the primary `strokeCssRectInsetOnDeviceGrid(..., 1.5, dpr)` commented out | XP.p (0/58 each edge; edge reads the solid-edge orange `rgb(255,150,60)`) | the other 7 | 8/8 |
| xp-visible | `styles.previewCanvas` gains `visibility: 'hidden'` | XP.d (composite 910/4096, changed 0) | the other 7 (the layer's own pixels are unchanged) | 8/8 |
| xp-follow | `if (!prev /* PLANT xp-follow */) {` (the cell-change clause dropped) | XP.c (fill left in the old box 2558) | the other 7 (the part re-enters from off the map, so XP.a is a fresh hover) | 8/8 |
| xp-leave | onMouseLeave's preview clear commented out | XP.e (3570 px left on the layer) | the other 7 | 8/8 |
| xp-flip | the ghost word built with `userXFlip: false` | XP.b (76 fill px outside the mirrored silhouette) | the other 7 | 8/8 |
| gt-gate | `if (false /* PLANT gt-gate */ && ...facetFor(tabId) !== EFFECTS_FACET) return null;` | GT.a (world_y 80 to 120 in Layout, marquee null) | GT.0, GT.c | 4/4 |
| hb-nowrap | `styles.hoverBar` gains `whiteSpace: 'nowrap'` | HBW.a (at 900: scrollWidth 511 > 376) | SETUP | 2/2 |
| sg-linkhover (sweep-4 PART stamp) | the stamp ghost gate gains `&& !useEditorStore.getState().linkHover` | SG.a (0/14884 at alpha 140, 0/976 edge) | SG.0, SG.b, CL.* | 7/7 |
| cl (ChunkLinkOptions) | readout `color: T.textLo`, Detach `disabled={true}` | CL.a (colour `rgb(110,117,137)`), CL.b (disabled) | SG.*, CL.c | 7/7 |
| pg-art (sweep-4 PART paste) | the paste ghost's `drawImage` commented out | PG.a (art 0; 676/676 fill-only) | PG.0, PG.b, PG.c | 5/5 |
| hb-color (sweep-4 PART hover) | `styles.hoverBar` `color: T.textFaint` | HB.b (colour `rgb(71,77,94)`) | HB.0, HB.a | 4/4 |
| gd (sweep-4 PART effects) | the guide press `if (idx !== null && false /* PLANT gd */) {` | GD.a, GD.b (world_y stays 80) | GD.0, SF.*, ESC.*, BAND.* | 14/14 |
| sf-anchor | `frameAnchorFor`: `return session; /* PLANT sf-anchor */` | SF.a (frame at y −200 instead of 88), SF.b (`v_offset` stays 288) | GD.*, SF.0, ESC.*, BAND.* | 14/14 |
| esc (map-escape.ts) | `if (false /* PLANT esc */ && inEffectsFacet && ed.bandLensTarget) return 'lens';` | ESC.a (target still set, cell still washed) | the rest | 14/14 |
| band | `drawBands`: `if (!overlayOpts.playAnimatedArt \|\| true /* PLANT band */) return;` | BAND.a (0 of 233 expected cells changed) | the rest | 14/14 |

**Rows that do not discriminate, and why.**

- The premises XP.0 and GT.0, and the control GT.c. GT.c proves the Layout aim is a live guide's
  world row. It cannot fail on a gate plant.
- HBW.a at 1400 and 1100. The readout fits on one line there either way, so hb-nowrap turns only
  the 900 column red. The harness header says so.

**One slip, and its repair.** The first sweep-4 plant run used `RUN_TAG=red-sg-linkhover`. The
2026-09-12 parcel had committed captures under that same tag, so the red run overwrote three
tracked PNGs in `docs/captures/2026-09-12-cdp-sweep-4/`. I restored them with
`git checkout HEAD -- docs/captures/2026-09-12-cdp-sweep-4` (tracked status empty afterwards),
and every later tag was prefixed `mvfg-`. The untracked captures my runs wrote there were
deleted. No capture was committed.

---

## 4. Item 9's look calls: numbers, not rulings

Measured in each final, at the default window, in the bar's own left padding strip (198 pixels):

- Text: `rgb(184,190,206)` (textBase), 11 px JetBrains Mono, line-height normal, on a 25 px bar.
- Background `rgba(17,17,27,0.9)` as painted: `rgb(15,15,24)`. **WCAG contrast 10.25**.
- **Worst case the 0.9 background allows** (a white map pixel under it): `rgb(41,41,50)`, contrast
  **7.75**. Both are above 7:1.

Questions for the owner, each with its numbers. Nothing here decides them.

1. **Is 11 px mono readable enough for the coordinate readout?** It is the tXs token (11 px), the
   same size as the Chunk links readout.
2. **Is a wrapped bar acceptable?** At a 900 px window the bar takes 2 lines (41 px of a 721 px
   map, 5.7%). At 700 px it takes 3 lines (57 px). It grows upwards over the map.
3. **HBW.find, at 700 px: the readout is cut.** The collision arm's sparkline is one run with no
   break opportunity, wider than the 152 px content box of a 176 px bar: `scrollWidth` 188 vs
   `clientWidth` 176. The third line box ends at x 472 in a container ending at 460. **Booked,
   not fixed.** The window has no `minWidth` (`src/main/index.ts` sets only 1400x900), and each
   possible fix changes what the user sees:
   - `overflowWrap: 'anywhere'` splits the sparkline across lines;
   - an ellipsis hides part of it;
   - a minimum window width limits the app.

   That is a design choice. **Reproduction:** `PART=hb npm run harness:mapviewport-foreground`
   and read the `HBW.find` line.

   **Update, later 2026-09-28 (ROADMAP row 244): FIXED.** The overseer ruled the wrap.
   `styles.hoverBar` gained `overflowWrap: 'anywhere'` (`a5d09d64`). HBW.a now gates 700 px too
   (`431c51fe`, red first at 188/176). With the fix, 700 reads 176/176 in 5 lines (89 px), and
   1400/1100/900 are unchanged. The text above is left as it was written.

---

## 5. What each already-covered row does NOT check (limits, not new claims)

- **SG.a** counts alpha, not colour. It would pass if the ghost showed chunk X's art where Y's
  belongs.
- **BAND.a** checks that exactly the right cells change. It does not check that they change to
  the phase's own art, and time-driven stepping with the camera still is not driven.
- **CL.b** reads Detach's enabled state. No row clicks it with a real mouse (chunk-links row 5
  uses `.click()`).
- **ESC** does not check the order when paste or a marquee is also active. `map-escape.test.ts`
  pins that order in node.

Each of these is a candidate row if someone wants it. None is a defect I observed.

---

## 6. Suite and gates

| run | `npm test` (`VITEST_MAX_WORKERS=4`, foreground) | Test Files | Tests | completeness |
|---|---|---|---|---|
| before (`98b82907`), 14:42:54 to 14:44:09Z | exit 0 | 693 passed \| 3 skipped (696) | 11909 passed \| 20 skipped (11929) | `COMPLETE, 696 of 696` |
| after (`4ec26c0c` tree), 15:29:10 to 15:30:31Z | exit 0 | 693 passed \| 3 skipped (696) | 11909 passed \| 20 skipped (11929) | `COMPLETE, 696 of 696` |

The totals are unchanged because this parcel adds no vitest file. The after run printed
`skip-report: OK. Every skip named its reason.` and `failure-class: no failures in this run`.

`npm run check:*`, run once each on the harness commit's tree:
- exit 0: cited-paths, doc-citations, harness-guards (297 clean / 297), ledger-timestamps,
  object-stringify, peer-path-literals, pseudo-skip, python-resolver, scripts-dashes,
  src-dashes, test-dashes, guide-text, prose-constants, test-collection, tsx-dashes;
- **exit 2: lane-status.** The check printed COULD NOT READ for the lane status JSON, with
  ENOENT. That file is gitignored and lives only in the main checkout, which is the overseer's.
  This is "could not measure", not a pass.

**Finals of `harness:mapviewport-foreground`** (tree `4d095fdb`, src identical to HEAD):

| run | total | dpr | time |
|---|---|---|---|
| final1 | 12/12 PASS, 0 FAIL, 0 UNMEASURABLE | 1 | 49.5 s |
| final2 | 12/12 PASS, 0 FAIL, 0 UNMEASURABLE | 1 | 49.3 s |
| final3 | 12/12 PASS, 0 FAIL, 0 UNMEASURABLE | 1 | 49.4 s |

**cdp-sweep-4 on the same tree:** 27/27 before (`sweep4-base.log`) and 27/27 after
(`sweep4-final.log`), dpr 1, 95.5 s each.

---

## 7. What remains on the row

- **OWNER-PARKED, NOT ROWS:** M5 (a paint-block drag paints one block), M7 (the cursor readout
  freezes during drags) and the M1 note (Tab then Space switches the plane mid-stroke).
  Unchanged.
- **For the owner:** item 9's three questions (section 4). HBW.find (the cut at a 700 px window)
  is booked with a reproduction.
  *Update (row 244): the cut is fixed and gated in HBW.a at 700; see finding 3's update.*
- **CANNOT BE A ROW TODAY:** unchanged.
- **Not exercised:** the dpr 1.35 path, since every run today came up at 1.

## 8. PROPOSED ledger line (NOT appended; the overseer appends at landing and restamps `at`)

```json
{"id": "MAPVIEWPORT-UNTESTED", "at": "2026-09-28T15:31:33Z", "sweep": {"date": "2026-09-06", "packet": "docs/superpowers/notes/2026-09-06-aurora-lens-sweep.md", "sha": "c085fa54", "pin": "e17cdb02a9a458b113733b948479725258179927"}, "seat": "step0-A", "severity": "low", "state": "open", "title": "The 3,915-line map surface the user draws on is imported by no test, and three standing fixes live inside it.", "where": {"path": "src/renderer/components/MapViewport.tsx"}, "detail": "NARROWED A NINTH TIME, NO DEFECT IN THE NINE; ONE FINDING BOOKED. Parcel mapviewport-foreground, packet docs/reviews/2026-09-28-mapviewport-foreground.md, code tip 4d095fdb (harness), 4ec26c0c (logs). The eighth narrowing (plane-switch-drag) is the previous line. THE CARRIED LIST WAS STALE SINCE 2026-09-12: harness:cdp-sweep-4-0912 (docs/reviews/2026-09-12-cdp-sweep-4.md) built rows for all nine FOREGROUND-ONLY items that day, and no line of this row cited it. Re-run on today's tree (aeon 713f039d, build FRESH DEBUG, dpr 1): 27/27 before and after. Re-planted one mutation per item on today's tree, each red on its target rows and green on the restored rebuild: sg-linkhover (SG.a), cl (CL.a, CL.b), gd (GD.a, GD.b), sf-anchor (SF.a, SF.b), esc (ESC.a), pg-art (PG.a), band (BAND.a), hb-color (HB.b). So items 1, 2, 4, 5, 6 and 8, and the code half of 9, are ALREADY-COVERED. TWO REAL GAPS, NOW ROWS in the new registered harness:mapviewport-foreground (12/12, 12/12, 12/12 finals, dpr 1). Item 7, the collision hover preview: its only running-app rows (sweep-4 XO.*) were retired 2026-09-26 with the crossover brush. XP.a to XP.e and XP.b check the ghost's fill against the silhouette the tree's own loader and resolveCell derive for the brush word from the copy's tables, then the primary outline, the on-screen composite, follow, leave-clear and the H flip. Six plants, each red on exactly its row(s). Item 3's gate half: GT.a, in Layout, a real press on a guide's world row leaves world_y alone and goes to the marquee. Plant gt-gate (activeGuideScene's facet check dropped) reds it (world_y 80 to 120, no marquee). ITEM 9, MEASURED: the longest readout is uncut at window widths 1400, 1100 and 900 (HBW.a; the nowrap plant reds 900). Contrast is 10.25 as painted and 7.75 worst-case over white; 11px mono; 1, 1, 2 and 3 lines at 1400, 1100, 900 and 700. FINDING BOOKED, NOT FIXED (HBW.find): at a 700 px window the collision arm's sparkline, one unbreakable run, is cut (scrollWidth 188 > clientWidth 176). Any fix is a design choice (wrap anywhere, ellipsis or a window minWidth). Widths are set by Emulation.setDeviceMetricsOverride because this Electron has no Browser.getWindowForTarget. CLV: at 1400x900 the Chunk links readout is on screen without scrolling. WHAT REMAINS: OWNER-PARKED, NOT ROWS: M5, M7, the M1 note (unchanged). FOR THE OWNER: item 9's look questions (11px readable? a wrapped bar acceptable? the 700 px cut). CANNOT BE A ROW TODAY: unchanged. NOT EXERCISED: dpr 1.35 (every run came up at 1). THE TITLE IS HISTORICAL. SUITE (npm test, VITEST_MAX_WORKERS=4): before (98b82907) and after (4ec26c0c) both Test Files 693 passed | 3 skipped (696), Tests 11909 passed | 20 skipped (11929), exit 0, run-completeness COMPLETE 696 of 696. check:lane-status exit 2 in the worktree (docs/lane-status.json absent there, gitignored); every other check:* exit 0.", "convergence": ["S0-A", "controller"], "batch": "mapviewport-foreground"}
```
